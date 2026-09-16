"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, StatusBadge } from "@/components/ui";
import { DOMAINS, profileApi } from "@/features/profile/api";
import { mentoringApi } from "@/features/mentoring/api";
import { DAY_NAMES, STATUS_LABELS, formatDateTime } from "@/lib/format";

const splitList = (s) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

function DomainSelect({ value, onChange }) {
  const known = DOMAINS.some(([v]) => v === value);
  return (
    <select value={known || !value ? value : "__other"} onChange={(e) => onChange(e.target.value === "__other" ? value : e.target.value)} required>
      <option value="">— Chọn lĩnh vực —</option>
      {DOMAINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      {!known && value && <option value="__other">{value}</option>}
    </select>
  );
}

function EmbeddingInfo({ profile }) {
  if (!profile) return null;
  return (
    <p className="muted small">
      Vector embedding: {profile.embeddingStatus === "PENDING" ? "đang chờ sinh (hệ thống sẽ tự thử lại)" : `cập nhật lúc ${formatDateTime(profile.embeddingUpdatedAt)}`}
    </p>
  );
}

function MentorProfile({ user }) {
  const [profile, setProfile] = useState(undefined);
  const [form, setForm] = useState({ displayName: user.fullName || "", skills: "", domain: "", bio: "", yearsExperience: 0, hourlyRate: 0, capacity: 3, isAvailable: true, portfolioLinks: "" });
  const [slots, setSlots] = useState([]);
  const [msg, setMsg] = useState({});
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    profileApi.getMentor(user.userId).then((p) => {
      setProfile(p);
      setForm({ displayName: p.displayName, skills: p.skills.join(", "), domain: p.domain, bio: p.bio || "", yearsExperience: p.yearsExperience, hourlyRate: p.hourlyRate, capacity: p.capacity, isAvailable: p.isAvailable, portfolioLinks: p.portfolioLinks.join("\n"), cvFileUrl: p.cvFileUrl });
      setSlots(p.availability.map((s) => ({ ...s, startTime: s.startTime.slice(0, 5), endTime: s.endTime.slice(0, 5) })));
    }).catch(() => setProfile(null));
  }, [user]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function save(e) {
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
      setMsg({ ok: "Đã lưu hồ sơ và cập nhật embedding." + (p.verificationStatus === "PENDING_INTERVIEW" ? " Bước tiếp theo: hoàn thành AI Interview." : "") });
    } catch (err) {
      setMsg({ error: err.message });
    }
  }

  async function saveSlots() {
    setMsg({});
    try {
      const saved = await profileApi.saveAvailability(user.userId, slots.map((s) => ({ dayOfWeek: Number(s.dayOfWeek), startTime: s.startTime, endTime: s.endTime })));
      setSlots(saved.map((s) => ({ ...s, startTime: s.startTime.slice(0, 5), endTime: s.endTime.slice(0, 5) })));
      setMsg({ ok: "Đã lưu lịch rảnh." });
    } catch (err) {
      setMsg({ error: err.message });
    }
  }

  async function prefillFromCv(file) {
    if (!file) return;
    setParsing(true);
    setMsg({});
    try {
      const cv = await mentoringApi.parseCv(file);
      const p = cv.parsed;
      setForm((f) => ({
        ...f,
        skills: [...new Set([...splitList(f.skills), ...p.skills])].join(", "),
        yearsExperience: p.yearsExperience ?? f.yearsExperience,
        bio: f.bio || p.summary || "",
        cvFileUrl: `/api/mentoring/cv/${cv.id}/file`,
      }));
      setMsg({ ok: `Đã trích xuất ${p.skills.length} kỹ năng từ CV (engine ${cv.engine}). Kiểm tra lại rồi bấm Lưu.` });
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setParsing(false);
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
            <input type="file" accept="application/pdf" disabled={parsing} onChange={(e) => prefillFromCv(e.target.files[0])} />
            <div className="hint">{parsing ? "Đang phân tích CV..." : "Hệ thống trích xuất kỹ năng và số năm kinh nghiệm."}</div>
          </div>
          <div className="field"><label>Tên hiển thị</label><input required value={form.displayName} onChange={set("displayName")} /></div>
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
          <div className="field"><label><input type="checkbox" checked={form.isAvailable} onChange={set("isAvailable")} /> Đang nhận mentee mới</label></div>
          <button className="btn">Lưu hồ sơ</button>
        </form>

        <div className="card" id="availability">
          <h2>Lịch rảnh hằng tuần</h2>
          {!profile && <Alert type="info">Hãy lưu hồ sơ trước khi khai báo lịch rảnh.</Alert>}
          {profile && (
            <>
              <p className="muted small">Giờ Việt Nam (GMT+7). Mentee chỉ đặt được phiên nằm trọn trong các khung giờ này.</p>
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
              <div className="row between small">
                <span>Mentee đang hướng dẫn: <strong>{profile.activeMenteeCount}/{profile.capacity}</strong></span>
                <span>Đánh giá: <strong>{profile.ratingCount ? `${profile.rating.toFixed(1)}/5 (${profile.ratingCount})` : "chưa có"}</strong></span>
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>Trạng thái xác thực: {STATUS_LABELS[profile.verificationStatus]}</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function MenteeProfile({ user }) {
  const [profile, setProfile] = useState(undefined);
  const [form, setForm] = useState({ displayName: user.fullName || "", goal: "", domain: "", currentLevel: "BEGINNER", skills: "", portfolioLinks: "" });
  const [msg, setMsg] = useState({});

  useEffect(() => {
    profileApi.getMentee(user.userId).then((p) => {
      setProfile(p);
      setForm({ displayName: p.displayName, goal: p.goal || "", domain: p.domain, currentLevel: p.currentLevel, skills: p.skills.join(", "), portfolioLinks: p.portfolioLinks.join("\n") });
    }).catch(() => setProfile(null));
  }, [user]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setMsg({});
    try {
      const p = await profileApi.saveMentee(user.userId, { ...form, skills: splitList(form.skills), portfolioLinks: splitList(form.portfolioLinks) });
      setProfile(p);
      setMsg({ ok: "Đã lưu hồ sơ và cập nhật embedding. Bạn có thể tải CV để chatbot giúp làm rõ mục tiêu, hoặc tìm mentor ngay." });
    } catch (err) {
      setMsg({ error: err.message });
    }
  }

  if (profile === undefined) return <Loading />;
  return (
    <>
      <PageHead title="Hồ sơ nghề nghiệp" subtitle="Thông tin này được AI dùng để gợi ý mentor phù hợp với bạn." />
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
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
        {profile?.cvFileUrl && <p className="small"><a href={profile.cvFileUrl} target="_blank" rel="noreferrer">Xem CV đã tải lên</a></p>}
        <button className="btn">Lưu hồ sơ</button>
      </form>
    </>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth roles={["MENTOR", "MENTEE"]}>
      {(user) => (user.role === "MENTOR" ? <MentorProfile user={user} /> : <MenteeProfile user={user} />)}
    </RequireAuth>
  );
}
