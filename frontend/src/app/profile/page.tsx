"use client";

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { Eye, Plus, Trash2, Upload } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import {
  Alert, Button, Card, CardBody, CardFooter, CardHeader, DescriptionList, Field, FlashAlerts, Input, Loading, PageHeader, Select,
  StatusBadge, Tabs, Textarea, type Flash,
} from "@/components/ui";
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

function DomainSelect({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const known = DOMAINS.some(([v]) => v === value);
  return (
    <Select id={id} value={known || !value ? value : "__other"} onChange={(e) => onChange(e.target.value === "__other" ? value : e.target.value)} required>
      <option value="">Chọn lĩnh vực</option>
      {DOMAINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      {!known && value && <option value="__other">{value}</option>}
    </Select>
  );
}

/** Tab đang mở, đọc từ #hash (vd. /profile#availability từ trang tổng quan). */
function useHashTab<T extends string>(map: Record<string, T>, fallback: T): [T, (t: T) => void] {
  const [tab, setTab] = useState<T>(fallback);
  useEffect(() => {
    const fromHash = map[window.location.hash.slice(1)];
    if (fromHash) setTab(fromHash);
  }, [map]);
  return [tab, setTab];
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
  return (
    <span className="text-small text-ink-subtle">
      Chỉ mục gợi ý: {index === null ? "chưa lấy được trạng thái" : index.status === "PENDING" ? "đang cập nhật…" : `cập nhật lúc ${formatDateTime(index.indexedAt)}`}
    </span>
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

const MENTOR_TABS = { availability: "schedule", "booking-settings": "schedule", status: "status", "my-cvs": "cv" } as const;
const MENTEE_TABS = { preferences: "preferences", "my-cvs": "cv" } as const;

function MentorProfileForm({ user }: { user: SessionUser }) {
  const [tab, setTab] = useHashTab<"info" | "schedule" | "status" | "cv">(MENTOR_TABS, "info");
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
  const slotField = (i: number, patch: Partial<SlotForm>) => setSlots(slots.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <>
      <PageHeader
        title="Hồ sơ mentor"
        description="Hồ sơ càng chi tiết, AI càng gợi ý bạn tới đúng mentee."
        actions={profile && <StatusBadge status={profile.verificationStatus} />}
      />
      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[
        { id: "info", label: "Thông tin chuyên môn" },
        { id: "schedule", label: "Lịch và đặt lịch" },
        { id: "status", label: "Trạng thái" },
        { id: "cv", label: "CV" },
      ]} />
      <FlashAlerts flash={msg} className="mb-6" />

      {tab === "info" && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <form onSubmit={save}>
            <Card>
              <CardHeader title="Thông tin chuyên môn" actions={<EmbeddingInfo profile={profile} />} />
              <CardBody className="flex flex-col gap-5">
                <div className="flex flex-col gap-3 rounded-md border border-dashed border-border-strong p-4">
                  <div>
                    <div className="font-semibold">Điền nhanh từ CV (PDF)</div>
                    <div className="text-small text-ink-muted">Hệ thống trích xuất kỹ năng và số năm kinh nghiệm, bạn kiểm tra lại rồi lưu.</div>
                  </div>
                  <CvConsent checked={cvConsent} onChange={setCvConsent} audience="MENTOR" disabled={parsing} />
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="mentor-cv" className={`btn ${parsing ? "pointer-events-none opacity-50" : ""}`}>
                      {parsing ? <span className="spinner" aria-hidden="true" /> : <Upload aria-hidden="true" />}
                      {parsing ? "Đang phân tích CV…" : "Chọn file CV"}
                    </label>
                    <input id="mentor-cv" type="file" accept="application/pdf" className="sr-only" disabled={parsing}
                      onChange={(e) => { prefillFromCv(e.target.files?.[0]); e.target.value = ""; }} />
                    {form.cvFileUrl && (
                      <Button variant="ghost" icon={Eye} onClick={() => form.cvFileUrl && viewCv(form.cvFileUrl)}>Xem CV gắn với hồ sơ</Button>
                    )}
                  </div>
                </div>
                <div className="form-grid">
                  <Field label="Tên hiển thị" id="m-name" required className="span-2">
                    <Input id="m-name" required value={form.displayName} onChange={set("displayName")} />
                  </Field>
                  <Field label="Tiêu đề ngắn" id="m-headline" className="span-2" hint={`Hiện trên thẻ mentor (${form.headline.length}/80 ký tự).`}>
                    <Input id="m-headline" value={form.headline} maxLength={80} onChange={set("headline")} placeholder="Senior Backend Engineer · 8 năm Java/Spring" />
                  </Field>
                  <Field label="Lĩnh vực" id="m-domain" required>
                    <DomainSelect id="m-domain" value={form.domain} onChange={(v) => setForm({ ...form, domain: v })} />
                  </Field>
                  <Field label="Số năm kinh nghiệm" id="m-years">
                    <Input id="m-years" type="number" min={0} max={60} value={form.yearsExperience} onChange={set("yearsExperience")} />
                  </Field>
                  <Field label="Kỹ năng" id="m-skills" required className="span-2" hint="Phân tách bằng dấu phẩy.">
                    <Input id="m-skills" required value={form.skills} onChange={set("skills")} placeholder="Java, Spring Boot, PostgreSQL" />
                  </Field>
                  <Field label="Giới thiệu bản thân" id="m-bio" required className="span-2">
                    <Textarea id="m-bio" required value={form.bio} onChange={set("bio")} className="min-h-[140px]" />
                  </Field>
                  <Field label="Mức phí (đ/giờ)" id="m-rate" hint="Để 0 nếu bạn mentor miễn phí.">
                    <Input id="m-rate" type="number" min={0} step={10000} value={form.hourlyRate} onChange={set("hourlyRate")} />
                  </Field>
                  <Field label="Sức chứa (số mentee tối đa)" id="m-capacity">
                    <Input id="m-capacity" type="number" min={1} max={50} value={form.capacity} onChange={set("capacity")} />
                  </Field>
                  <Field label="Portfolio và liên kết" id="m-links" className="span-2" hint="Mỗi dòng một liên kết.">
                    <Textarea id="m-links" className="min-h-[72px] font-mono text-small" value={form.portfolioLinks} onChange={set("portfolioLinks")} />
                  </Field>
                </div>
              </CardBody>
              <CardFooter><Button type="submit" variant="primary">Lưu hồ sơ</Button></CardFooter>
            </Card>
          </form>
          <div className="flex min-w-0 flex-col gap-6">
            {profile?.completeness && <CompletenessCard completeness={profile.completeness} />}
            {profile && (
              <AvatarAndTimezone userId={user.userId} name={profile.displayName} avatarUrl={profile.avatarUrl} timezone={profile.timezone} showTimezone={false}
                onChange={() => profileApi.getMentor(user.userId).then(setProfile).catch(() => {})} />
            )}
            {profile && (
              <Card>
                <CardHeader title="Tóm tắt" />
                <CardBody>
                  <DescriptionList items={[
                    ["Xác thực", STATUS_LABELS[profile.verificationStatus]],
                    ["Mentee đang hướng dẫn", <span key="c" className="tabular">{profile.activeMenteeCount}/{profile.capacity}</span>],
                    ["Đánh giá", profile.ratingCount >= 3 ? `${profile.rating.toFixed(1)}/5 (${profile.ratingCount})` : profile.ratingCount ? `${profile.ratingCount} đánh giá, điểm hiện khi đủ 3` : "Chưa có"],
                  ]} />
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "schedule" && (
        !profile ? <Alert tone="info">Lưu hồ sơ ở tab “Thông tin chuyên môn” trước khi khai báo lịch rảnh.</Alert> : (
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-6">
              <Card>
                <div id="availability" />
                <CardHeader title="Lịch rảnh hằng tuần" description={`Theo múi giờ ${profile.timezone}. Mentee chỉ đặt được phiên nằm trọn trong các khung giờ này.`} />
                <CardBody className="flex flex-col gap-3">
                  {slots.length === 0 && <p className="text-ink-muted">Chưa có khung giờ nào. Thêm ít nhất một khung để nhận lịch.</p>}
                  {slots.map((s, i) => (
                    <div className="flex flex-wrap items-center gap-2" key={i}>
                      <Select aria-label="Ngày" className="w-auto min-w-[130px] flex-1" value={s.dayOfWeek} onChange={(e) => slotField(i, { dayOfWeek: e.target.value })}>
                        {DAY_NAMES.slice(1).map((d, idx) => <option key={d} value={idx + 1}>{d}</option>)}
                      </Select>
                      <Input aria-label="Từ giờ" type="time" className="w-auto" value={s.startTime} onChange={(e) => slotField(i, { startTime: e.target.value })} />
                      <span className="text-ink-muted">đến</span>
                      <Input aria-label="Đến giờ" type="time" className="w-auto" value={s.endTime} onChange={(e) => slotField(i, { endTime: e.target.value })} />
                      <Button variant="ghost" iconOnly icon={Trash2} label="Xoá khung giờ" onClick={() => setSlots(slots.filter((_, j) => j !== i))} />
                    </div>
                  ))}
                </CardBody>
                <CardFooter>
                  <Button variant="ghost" icon={Plus} className="mr-auto" onClick={() => setSlots([...slots, { dayOfWeek: 1, startTime: "19:00", endTime: "21:00" }])}>Thêm khung giờ</Button>
                  <Button variant="primary" onClick={saveSlots}>Lưu lịch rảnh</Button>
                </CardFooter>
              </Card>
              <AvailabilityExceptions mentorId={user.userId} />
            </div>
            <div id="booking-settings" className="min-w-0">
              <BookingSettings key={profile.userId} profile={profile} onChange={(p) => { setProfile(p); setDisplayTimeZone(p.timezone); }} />
            </div>
          </div>
        )
      )}

      {tab === "status" && (
        <div className="max-w-[720px]" id="status">
          {profile ? <MentorStatusControl profile={profile} onChange={setProfile} /> : <Alert tone="info">Lưu hồ sơ trước khi đổi trạng thái.</Alert>}
        </div>
      )}

      {tab === "cv" && (
        <div className="max-w-[860px]">
          <MyCvs refreshKey={cvListKey} onDeleted={afterCvDeleted} />
        </div>
      )}
    </>
  );
}

type MenteeForm = Required<Omit<MenteeProfileInput, "skills" | "portfolioLinks" | "cvFileUrl">> & { skills: string; portfolioLinks: string };

function MenteeProfileForm({ user }: { user: SessionUser }) {
  const [tab, setTab] = useHashTab<"info" | "preferences" | "cv">(MENTEE_TABS, "info");
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
      <PageHeader title="Hồ sơ nghề nghiệp" description="AI dùng thông tin này để gợi ý mentor phù hợp với bạn." />
      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[
        { id: "info", label: "Hồ sơ" },
        { id: "preferences", label: "Sở thích tìm mentor" },
        { id: "cv", label: "CV" },
      ]} />
      <FlashAlerts flash={msg} className="mb-6" />

      {tab === "info" && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <form onSubmit={save}>
            <Card>
              <CardHeader title="Thông tin học tập" actions={<EmbeddingInfo profile={profile} />} />
              <CardBody>
                <div className="form-grid">
                  <Field label="Tên hiển thị" id="e-name" required className="span-2">
                    <Input id="e-name" required value={form.displayName} onChange={set("displayName")} />
                  </Field>
                  <Field label="Lĩnh vực muốn học" id="e-domain" required>
                    <DomainSelect id="e-domain" value={form.domain} onChange={(v) => setForm({ ...form, domain: v })} />
                  </Field>
                  <Field label="Trình độ hiện tại" id="e-level">
                    <Select id="e-level" value={form.currentLevel} onChange={set("currentLevel")}>
                      <option value="BEGINNER">Mới bắt đầu</option>
                      <option value="INTERMEDIATE">Trung cấp</option>
                      <option value="ADVANCED">Nâng cao</option>
                    </Select>
                  </Field>
                  <Field label="Kỹ năng hiện có" id="e-skills" className="span-2" hint="Phân tách bằng dấu phẩy.">
                    <Input id="e-skills" value={form.skills} onChange={set("skills")} placeholder="Java, SQL, Git" />
                  </Field>
                  <Field label="Mục tiêu học tập" id="e-goal" required className="span-2">
                    <Textarea id="e-goal" required value={form.goal} onChange={set("goal")} className="min-h-[120px]"
                      placeholder="Chuẩn bị phỏng vấn backend Java trong 3 tháng, muốn học system design" />
                  </Field>
                  <Field label="Portfolio và dự án" id="e-links" className="span-2" hint="Mỗi dòng một liên kết.">
                    <Textarea id="e-links" className="min-h-[72px] font-mono text-small" value={form.portfolioLinks} onChange={set("portfolioLinks")} />
                  </Field>
                </div>
              </CardBody>
              <CardFooter>
                {profile?.cvFileUrl && (
                  <Button variant="ghost" icon={Eye} className="mr-auto" onClick={() => profile.cvFileUrl && viewCv(profile.cvFileUrl)}>Xem CV đang gắn với hồ sơ</Button>
                )}
                <Button type="submit" variant="primary">Lưu hồ sơ</Button>
              </CardFooter>
            </Card>
          </form>
          {profile && (
            <div className="flex min-w-0 flex-col gap-6">
              <CompletenessCard completeness={profile.completeness} matchingMin={50} />
              <AvatarAndTimezone userId={user.userId} name={profile.displayName} avatarUrl={profile.avatarUrl} timezone={profile.timezone}
                onChange={() => profileApi.getMentee(user.userId).then(setProfile).catch(() => {})} />
            </div>
          )}
        </div>
      )}

      {tab === "preferences" && (
        <div className="max-w-[760px]">
          {profile ? <MenteePreferences key={profile.userId} profile={profile} onChange={setProfile} />
            : <Alert tone="info">Lưu hồ sơ ở tab “Hồ sơ” trước khi đặt sở thích tìm mentor.</Alert>}
        </div>
      )}

      {tab === "cv" && (
        <div className="max-w-[860px]">
          <MyCvs onDeleted={() => profileApi.getMentee(user.userId).then(setProfile).catch(() => {})} />
        </div>
      )}
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
