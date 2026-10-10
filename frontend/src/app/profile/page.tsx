"use client";

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, StatusBadge, Flash } from "@/components/ui";
import { DOMAINS, profileApi } from "@/features/profile/api";
import { matchingApi } from "@/features/matching/api";
import { aiApi } from "@/features/ai/api";
import MyCvs, { openCvFile } from "@/features/ai/MyCvs";
import CvConsent from "@/features/ai/CvConsent";
import AvailabilityExceptions from "@/features/profile/AvailabilityExceptions";
import MentorStatusControl from "@/features/profile/MentorStatusControl";
import BookingSettings from "@/features/profile/BookingSettings";
import MenteePreferences from "@/features/profile/MenteePreferences";
import { AvatarAndTimezone, CompletenessCard } from "@/features/profile/ProfileExtras";
import { DAY_NAMES, STATUS_LABELS, formatDateTime, setDisplayTimeZone } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { AvailabilitySlot, CvSummary, IndexStatus, MenteeProfile, MenteeProfileInput, MentorProfile, SessionUser } from "@/types";

const splitList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

function DomainSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const known = DOMAINS.some(([v]) => v === value);
  return (
    <select value={known || !value ? value : "__other"} onChange={(e) => onChange(e.target.value === "__other" ? value : e.target.value)} required>
      <option value="">— Chọn lĩnh vực —</option>
      {DOMAINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      {!known && value && <option value="__other">{value}</option>}
    </select>
  );
}

/**
 * Trạng thái chỉ mục embedding do matching-service sở hữu (profile-service không
 * còn trả về trường này). Chỉ mục là nhất quán cuối cùng: profile-service chỉ báo
 * "hồ sơ vừa đổi" rồi trả lời ngay, nên sau khi lưu ta hỏi lại vài lần cho tới khi
 * vector khớp nội dung mới.
 */
function EmbeddingInfo({ profile }: { profile: { userId: string } | null }) {
  const [index, setIndex] = useState<IndexStatus | null | undefined>(undefined);

  useEffect(() => {
    if (!profile) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = (attemptsLeft: number): Promise<void> =>
      matchingApi.indexStatus(profile.userId).then((res) => {
        if (cancelled) return;
        setIndex(res);
        if (res.status === "PENDING" && attemptsLeft > 0) {
          timer = setTimeout(() => poll(attemptsLeft - 1), 2000);
        }
      }).catch(() => {
        if (!cancelled) setIndex(null);
      });
    poll(5);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [profile]);

  if (!profile || index === undefined) return null;
  if (index === null) return <p className="muted small">Vector embedding: chưa lấy được trạng thái.</p>;
  return (
    <p className="muted small">
      Vector embedding: {index.status === "PENDING" ? "đang chờ lập chỉ mục (hệ thống sẽ tự thử lại)" : `cập nhật lúc ${formatDateTime(index.indexedAt)}`}
    </p>
  );
}

/** Giá trị form: ô số giữ nguyên chuỗi người dùng nhập, chỉ đổi sang number khi lưu. */
interface MentorForm {
  displayName: string;
  headline: string;
  skills: string;
  domain: string;
  bio: string;
  yearsExperience: number | string;
  hourlyRate: number | string;
  capacity: number | string;
  portfolioLinks: string;
  cvFileUrl?: string | null;
}

type SlotForm = Omit<AvailabilitySlot, "dayOfWeek"> & { dayOfWeek: number | string };

const trimSlot = (s: AvailabilitySlot): SlotForm => ({ ...s, startTime: s.startTime.slice(0, 5), endTime: s.endTime.slice(0, 5) });

function MentorProfileForm({ user }: { user: SessionUser }) {
  const [profile, setProfile] = useState<MentorProfile | null | undefined>(undefined);
  const [form, setForm] = useState<MentorForm>({ displayName: user.fullName || "", headline: "", skills: "", domain: "", bio: "", yearsExperience: 0, hourlyRate: 0, capacity: 3, portfolioLinks: "" });
  const [slots, setSlots] = useState<SlotForm[]>([]);
  const [msg, setMsg] = useState<Flash>({});
  const [parsing, setParsing] = useState(false);
  const [cvConsent, setCvConsent] = useState(false);
  const [cvListKey, setCvListKey] = useState(0);

  /** Sau khi xoá CV: ai-service đã gỡ cvFileUrl khỏi hồ sơ (best-effort) → tải lại hồ sơ, và bỏ
   *  tham chiếu chưa lưu trong form nếu nó trỏ tới CV vừa xoá. Không ghi đè các ô đang sửa khác. */
  function afterCvDeleted(cv: CvSummary) {
    setForm((f) => ({ ...f, cvFileUrl: f.cvFileUrl === cv.fileUrl ? null : f.cvFileUrl }));
    profileApi.getMentor(user.userId).then(setProfile).catch(() => {});
  }

  async function viewCv(url: string) {
    try {
      await openCvFile(url);
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    }
  }

  useEffect(() => {
    profileApi.getMentor(user.userId).then((p) => {
      setProfile(p);
      setForm({ displayName: p.displayName, headline: p.headline || "", skills: p.skills.join(", "), domain: p.domain, bio: p.bio || "", yearsExperience: p.yearsExperience, hourlyRate: p.hourlyRate, capacity: p.capacity, portfolioLinks: p.portfolioLinks.join("\n"), cvFileUrl: p.cvFileUrl });
      setSlots(p.availability.map(trimSlot));
    }).catch(() => setProfile(null));
  }, [user]);

  const set = (k: keyof MentorForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target instanceof HTMLInputElement && e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg({});
    try {
      const p = await profileApi.saveMentor(user.userId, {
        ...form,
        skills: splitList(form.skills),
        portfolioLinks: splitList(form.portfolioLinks),
        yearsExperience: Number(form.yearsExperience),
        hourlyRate: Number(form.hourlyRate),
        capacity: Number(form.capacity),
      });
      setProfile(p);
      setMsg({ ok: "Đã lưu hồ sơ; chỉ mục gợi ý mentor được cập nhật ngay sau đó." + (p.verificationStatus === "PENDING_INTERVIEW" ? " Bước tiếp theo: hoàn thành AI Interview." : "") });
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    }
  }

  async function saveSlots() {
    setMsg({});
    try {
      const saved = await profileApi.saveAvailability(user.userId, slots.map((s) => ({ dayOfWeek: Number(s.dayOfWeek), startTime: s.startTime, endTime: s.endTime })));
      setSlots(saved.map(trimSlot));
      setMsg({ ok: "Đã lưu lịch rảnh." });
      profileApi.getMentor(user.userId).then(setProfile).catch(() => {});
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    }
  }

  async function prefillFromCv(file: File | undefined) {
    if (!file) return;
    setParsing(true);
    setMsg({});
    try {
      const cv = await aiApi.parseCv(file, cvConsent);
      const p = cv.parsed;
      setForm((f) => ({
        ...f,
        skills: [...new Set([...splitList(f.skills), ...p.skills])].join(", "),
        yearsExperience: p.yearsExperience ?? f.yearsExperience,
        bio: f.bio || p.summary || "",
        cvFileUrl: aiApi.cvFileUrl(cv.id),
      }));
      setMsg({ ok: `Đã trích xuất ${p.skills.length} kỹ năng từ CV (engine ${cv.engine}). Kiểm tra lại rồi bấm Lưu.` });
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    } finally {
      setParsing(false);
      setCvListKey((k) => k + 1); // CV vừa parse cũng được lưu → hiện trong "CV của tôi"
    }
  }

  if (profile === undefined) return <Loading />;
  return (
    <>
      <PageHead title="Hồ sơ mentor" subtitle="Hồ sơ càng chi tiết, AI càng gợi ý bạn tới đúng mentee.">
        {profile && <StatusBadge status={profile.verificationStatus} />}
      </PageHead>
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <form className="card" onSubmit={save}>
          <h2>Thông tin chuyên môn</h2>
          <EmbeddingInfo profile={profile} />
          <div className="field">
            <label>Điền nhanh từ CV (PDF)</label>
            <CvConsent checked={cvConsent} onChange={setCvConsent} audience="MENTOR" disabled={parsing} />
            <input type="file" accept="application/pdf" disabled={parsing} onChange={(e) => prefillFromCv(e.target.files?.[0])} />
            <div className="hint">{parsing ? "Đang phân tích CV..." : "Hệ thống trích xuất kỹ năng và số năm kinh nghiệm."}</div>
            {form.cvFileUrl && (
              <div className="hint">
                CV gắn với hồ sơ:{" "}
                <button type="button" className="btn ghost sm" onClick={() => form.cvFileUrl && viewCv(form.cvFileUrl)}>Xem</button>
              </div>
            )}
          </div>
          <div className="field"><label>Tên hiển thị</label><input required value={form.displayName} onChange={set("displayName")} /></div>
          <div className="field">
            <label>Tiêu đề ngắn</label>
            <input value={form.headline} maxLength={80} onChange={set("headline")} placeholder="Ví dụ: Senior Backend Engineer · 8 năm Java/Spring" />
            <div className="hint">Hiện trên thẻ mentor, tối đa 80 ký tự ({form.headline.length}/80).</div>
          </div>
          <div className="grid grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="field"><label>Lĩnh vực</label><DomainSelect value={form.domain} onChange={(v) => setForm({ ...form, domain: v })} /></div>
            <div className="field"><label>Số năm kinh nghiệm</label><input type="number" min={0} max={60} value={form.yearsExperience} onChange={set("yearsExperience")} /></div>
          </div>
          <div className="field"><label>Kỹ năng</label><input required value={form.skills} onChange={set("skills")} placeholder="Java, Spring Boot, PostgreSQL" /><div className="hint">Phân tách bằng dấu phẩy.</div></div>
          <div className="field"><label>Giới thiệu bản thân</label><textarea required value={form.bio} onChange={set("bio")} /></div>
          <div className="grid grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="field"><label>Mức phí (VNĐ/giờ)</label><input type="number" min={0} step={10000} value={form.hourlyRate} onChange={set("hourlyRate")} /><div className="hint">0 = miễn phí</div></div>
            <div className="field"><label>Sức chứa (số mentee tối đa)</label><input type="number" min={1} max={50} value={form.capacity} onChange={set("capacity")} /></div>
          </div>
          <div className="field"><label>Portfolio / liên kết</label><textarea style={{ minHeight: 60 }} value={form.portfolioLinks} onChange={set("portfolioLinks")} placeholder="Mỗi dòng một liên kết" /></div>
          <button className="btn">Lưu hồ sơ</button>
        </form>

        <div className="stack">
        {profile?.completeness && <CompletenessCard completeness={profile.completeness} />}
        {profile && (
          <AvatarAndTimezone userId={user.userId} avatarUrl={profile.avatarUrl} timezone={profile.timezone} showTimezone={false}
            onChange={() => profileApi.getMentor(user.userId).then(setProfile).catch(() => {})} />
        )}
        {profile && (
          <div className="card" id="status">
            <MentorStatusControl profile={profile} onChange={setProfile} />
          </div>
        )}
        {profile && (
          <div className="card" id="booking-settings">
            <BookingSettings key={profile.userId} profile={profile} onChange={(p) => { setProfile(p); setDisplayTimeZone(p.timezone); }} />
          </div>
        )}
        <div className="card" id="availability">
          <h2>Lịch rảnh hằng tuần</h2>
          {!profile && <Alert type="info">Hãy lưu hồ sơ trước khi khai báo lịch rảnh.</Alert>}
          {profile && (
            <>
              <p className="muted small">Theo múi giờ {profile.timezone}. Mentee chỉ đặt được phiên nằm trọn trong các khung giờ này.</p>
              {slots.map((s, i) => (
                <div className="slot-row" key={i}>
                  <select value={s.dayOfWeek} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? { ...x, dayOfWeek: e.target.value } : x)))}>
                    {DAY_NAMES.slice(1).map((d, idx) => <option key={d} value={idx + 1}>{d}</option>)}
                  </select>
                  <input type="time" value={s.startTime} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)))} />
                  <input type="time" value={s.endTime} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? { ...x, endTime: e.target.value } : x)))} />
                  <button type="button" className="btn ghost sm" onClick={() => setSlots(slots.filter((_, j) => j !== i))}>Xoá</button>
                </div>
              ))}
              <div className="row">
                <button type="button" className="btn secondary sm" onClick={() => setSlots([...slots, { dayOfWeek: 1, startTime: "19:00", endTime: "21:00" }])}>+ Thêm khung giờ</button>
                <span className="spacer" />
                <button type="button" className="btn" onClick={saveSlots}>Lưu lịch rảnh</button>
              </div>
              <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "1.25rem 0" }} />
              <AvailabilityExceptions mentorId={user.userId} />
              <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "1.25rem 0" }} />
              <div className="row between small">
                <span>Mentee đang hướng dẫn: <strong>{profile.activeMenteeCount}/{profile.capacity}</strong></span>
                <span>Đánh giá: <strong>{profile.ratingCount >= 3 ? `${profile.rating.toFixed(1)}/5 (${profile.ratingCount})` : profile.ratingCount ? `${profile.ratingCount} đánh giá — điểm hiện khi đủ 3` : "chưa có"}</strong></span>
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>Trạng thái xác thực: {STATUS_LABELS[profile.verificationStatus]}</p>
            </>
          )}
        </div>
        <MyCvs refreshKey={cvListKey} onDeleted={afterCvDeleted} />
        </div>
      </div>
    </>
  );
}

type MenteeForm = Required<Omit<MenteeProfileInput, "skills" | "portfolioLinks" | "cvFileUrl">> & { skills: string; portfolioLinks: string };

function MenteeProfileForm({ user }: { user: SessionUser }) {
  const [profile, setProfile] = useState<MenteeProfile | null | undefined>(undefined);
  const [form, setForm] = useState<MenteeForm>({ displayName: user.fullName || "", goal: "", domain: "", currentLevel: "BEGINNER", skills: "", portfolioLinks: "" });
  const [msg, setMsg] = useState<Flash>({});

  async function viewCv(url: string) {
    try {
      await openCvFile(url);
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    }
  }

  useEffect(() => {
    profileApi.getMentee(user.userId).then((p) => {
      setProfile(p);
      setForm({ displayName: p.displayName, goal: p.goal || "", domain: p.domain, currentLevel: p.currentLevel, skills: p.skills.join(", "), portfolioLinks: p.portfolioLinks.join("\n") });
    }).catch(() => setProfile(null));
  }, [user]);

  const set = (k: keyof MenteeForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg({});
    try {
      const p = await profileApi.saveMentee(user.userId, { ...form, skills: splitList(form.skills), portfolioLinks: splitList(form.portfolioLinks) });
      setProfile(p);
      setMsg({ ok: "Đã lưu hồ sơ; chỉ mục gợi ý mentor được cập nhật ngay sau đó. Bạn có thể tải CV để chatbot giúp làm rõ mục tiêu, hoặc tìm mentor ngay." });
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    }
  }

  if (profile === undefined) return <Loading />;
  return (
    <>
      <PageHead title="Hồ sơ nghề nghiệp" subtitle="Thông tin này được AI dùng để gợi ý mentor phù hợp với bạn." />
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      {profile && (
        <div className="grid grid-2" style={{ maxWidth: 760, alignItems: "start", marginBottom: "var(--spacing-16)" }}>
          <CompletenessCard completeness={profile.completeness} matchingMin={50} />
          <AvatarAndTimezone userId={user.userId} avatarUrl={profile.avatarUrl} timezone={profile.timezone}
            onChange={() => profileApi.getMentee(user.userId).then(setProfile).catch(() => {})} />
        </div>
      )}
      <form className="card" onSubmit={save} style={{ maxWidth: 760 }}>
        <EmbeddingInfo profile={profile} />
        <div className="field"><label>Tên hiển thị</label><input required value={form.displayName} onChange={set("displayName")} /></div>
        <div className="grid grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="field"><label>Lĩnh vực muốn học</label><DomainSelect value={form.domain} onChange={(v) => setForm({ ...form, domain: v })} /></div>
          <div className="field">
            <label>Trình độ hiện tại</label>
            <select value={form.currentLevel} onChange={set("currentLevel")}>
              <option value="BEGINNER">Mới bắt đầu</option>
              <option value="INTERMEDIATE">Trung cấp</option>
              <option value="ADVANCED">Nâng cao</option>
            </select>
          </div>
        </div>
        <div className="field"><label>Kỹ năng hiện có</label><input value={form.skills} onChange={set("skills")} placeholder="Java, SQL, Git" /></div>
        <div className="field">
          <label>Mục tiêu học tập</label>
          <textarea required value={form.goal} onChange={set("goal")} placeholder="Ví dụ: chuẩn bị phỏng vấn backend Java trong 3 tháng, muốn học system design" />
        </div>
        <div className="field"><label>Portfolio / dự án</label><textarea style={{ minHeight: 60 }} value={form.portfolioLinks} onChange={set("portfolioLinks")} placeholder="Mỗi dòng một liên kết" /></div>
        {profile?.cvFileUrl && (
          <p className="small">
            <button type="button" className="btn ghost sm" onClick={() => profile.cvFileUrl && viewCv(profile.cvFileUrl)}>Xem CV đang gắn với hồ sơ</button>
          </p>
        )}
        <button className="btn">Lưu hồ sơ</button>
      </form>
      {profile && <MenteePreferences key={profile.userId} profile={profile} onChange={setProfile} />}
      <div style={{ maxWidth: 760, marginTop: "var(--spacing-16)" }}>
        <MyCvs onDeleted={() => profileApi.getMentee(user.userId).then(setProfile).catch(() => {})} />
      </div>
    </>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth roles={["MENTOR", "MENTEE"]}>
      {(user) => (user.role === "MENTOR" ? <MentorProfileForm user={user} /> : <MenteeProfileForm user={user} />)}
    </RequireAuth>
  );
}
