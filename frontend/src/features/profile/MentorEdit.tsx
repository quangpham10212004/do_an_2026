"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase, CalendarClock, CalendarOff, Eye, FileText, Plus, Power, Settings2, Sparkles, Trash2, TriangleAlert, Upload, UserRound,
} from "lucide-react";
import { Alert, Button, ButtonLink, Chip, Chips, Field, FlashAlerts, Input, Loading, PageHeader, Select, StatusBadge, Textarea, type Flash } from "@/components/ui";
import { DOMAINS, profileApi } from "@/features/profile/api";
import { aiApi } from "@/features/ai/api";
import MyCvs, { openCvFile } from "@/features/ai/MyCvs";
import CvConsent from "@/features/ai/CvConsent";
import AvailabilityExceptions from "@/features/profile/AvailabilityExceptions";
import { DomainsSummaryCard } from "@/features/domains/DomainManager";
import MentorStatusControl from "@/features/profile/MentorStatusControl";
import BookingSettings, { bookingErrors, bookingFromProfile } from "@/features/profile/BookingSettings";
import {
  AvatarRow, ChipEditor, CompletenessBar, ConfirmModal, DangerZone, DomainSelect, EditSection, EmbeddingInfo, LinkEditor, MOCK_PROFILE_DELETE,
  SaveBar, SectionRail, jumpToSection, mockDeleteProfile, useActiveSection, useLeaveGuard, useToast, type RailItem,
} from "@/features/profile/editKit";
import { DAY_NAMES, setDisplayTimeZone } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { AvailabilitySlot, BookingSettingsInput, CvSummary, MentorProfile, SessionUser } from "@/types";

/** Giá trị form: ô số giữ nguyên chuỗi người dùng nhập, chỉ đổi sang number khi lưu. */
interface MentorForm {
  displayName: string;
  headline: string;
  domain: string;
  bio: string;
  yearsExperience: number | string;
  hourlyRate: number | string;
  capacity: number | string;
  previousDomains: string[];
  skills: string[];
  links: string[];
  cvFileUrl: string | null;
}
type SlotForm = Omit<AvailabilitySlot, "dayOfWeek"> & { dayOfWeek: number | string };
interface Snapshot { form: MentorForm; slots: SlotForm[]; booking: BookingSettingsInput | null }

const trimSlot = (s: AvailabilitySlot): SlotForm => ({ ...s, startTime: s.startTime.slice(0, 5), endTime: s.endTime.slice(0, 5) });
const MIN_BIO = 50;

/** Hash cũ (từ trang tổng quan, thông báo) → mục mới. */
const HASH_ALIAS: Record<string, string> = { availability: "lich", "booking-settings": "dat", status: "tt", "my-cvs": "pf" };

const SUGGESTIONS: Record<string, string[]> = {
  backend: ["Kafka", "Redis", "Microservices", "Kubernetes", "REST API", "Docker"],
  frontend: ["React", "TypeScript", "Next.js", "CSS", "Testing", "Accessibility"],
  fullstack: ["React", "Node.js", "PostgreSQL", "Docker", "TypeScript", "REST API"],
  devops: ["Kubernetes", "Terraform", "CI/CD", "AWS", "Docker", "Prometheus"],
  data: ["Python", "SQL", "Spark", "Airflow", "Machine learning", "dbt"],
  mobile: ["Flutter", "React Native", "Swift", "Kotlin", "Firebase", "CI/CD"],
};

const emptyForm = (name: string): MentorForm => ({
  displayName: name, headline: "", domain: "", bio: "", yearsExperience: 0, hourlyRate: 0, capacity: 3, previousDomains: [], skills: [], links: [], cvFileUrl: null,
});
const formFromProfile = (p: MentorProfile): MentorForm => ({
  displayName: p.displayName, headline: p.headline || "", domain: p.domain, bio: p.bio || "", yearsExperience: p.yearsExperience, hourlyRate: p.hourlyRate,
  capacity: p.capacity, previousDomains: p.previousDomains ?? [], skills: p.skills, links: p.portfolioLinks, cvFileUrl: p.cvFileUrl,
});

const j = (v: unknown) => JSON.stringify(v);
const dayName = (d: number | string) => DAY_NAMES[Number(d)] ?? "";

export default function MentorEdit({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [profile, setProfile] = useState<MentorProfile | null | undefined>(undefined);
  const [form, setForm] = useState<MentorForm>(emptyForm(user.fullName || ""));
  const [slots, setSlots] = useState<SlotForm[]>([]);
  const [booking, setBooking] = useState<BookingSettingsInput | null>(null);
  const [base, setBase] = useState<Snapshot>({ form: emptyForm(user.fullName || ""), slots: [], booking: null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Flash>({});
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [cvConsent, setCvConsent] = useState(false);
  const [cvListKey, setCvListKey] = useState(0);
  const [indexKey, setIndexKey] = useState(0);
  const [delSlot, setDelSlot] = useState<number | null>(null);
  const [delProfile, setDelProfile] = useState<"blocked" | "confirm" | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [toast, showToast] = useToast();

  const hydrate = useCallback((p: MentorProfile) => {
    const f = formFromProfile(p);
    const s = p.availability.map(trimSlot);
    const b = bookingFromProfile(p);
    setProfile(p);
    setForm(f);
    setSlots(s);
    setBooking(b);
    setBase({ form: f, slots: s, booking: b });
    setErrors({});
  }, []);

  useEffect(() => {
    profileApi.getMentor(user.userId).then(hydrate).catch(() => setProfile(null));
  }, [user, hydrate]);

  /* Cuộn tới mục theo hash khi vào trang (gồm hash cũ như #availability). */
  useEffect(() => {
    if (profile === undefined) return;
    const h = window.location.hash.slice(1);
    const id = HASH_ALIAS[h] ?? h;
    if (id && document.getElementById(id)) jumpToSection(id);
  }, [profile === undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof MentorForm>(k: K, v: MentorForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const onText = (k: "displayName" | "headline" | "bio" | "yearsExperience" | "hourlyRate" | "capacity") =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value);

  /* ---- trạng thái chưa lưu theo từng mục ---- */
  const dirtyBy = useMemo(() => {
    const pick = (f: MentorForm, keys: (keyof MentorForm)[]) => keys.map((k) => f[k]);
    return {
      cb: j(pick(form, ["displayName", "headline", "domain", "bio", "yearsExperience", "hourlyRate", "capacity", "previousDomains"])) !== j(pick(base.form, ["displayName", "headline", "domain", "bio", "yearsExperience", "hourlyRate", "capacity", "previousDomains"])),
      ks: j(form.skills) !== j(base.form.skills),
      pf: j([form.links, form.cvFileUrl]) !== j([base.form.links, base.form.cvFileUrl]),
      lich: j(slots) !== j(base.slots),
      dat: j(booking) !== j(base.booking),
    };
  }, [form, slots, booking, base]);
  const names: Record<keyof typeof dirtyBy, string> = { cb: "Thông tin chuyên môn", ks: "Kỹ năng", pf: "Portfolio và CV", lich: "Lịch rảnh", dat: "Cài đặt đặt lịch" };
  const dirtyNames = (Object.keys(dirtyBy) as (keyof typeof dirtyBy)[]).filter((k) => dirtyBy[k]).map((k) => names[k]);
  const dirty = dirtyNames.length > 0;

  /* ---- kiểm tra và lưu ---- */
  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.displayName.trim()) e.displayName = "Nhập tên hiển thị.";
    if (!form.domain) e.domain = "Chọn lĩnh vực chuyên môn chính.";
    if (form.bio.trim().length < MIN_BIO) e.bio = `Cần ít nhất ${MIN_BIO} ký tự để mentee hiểu bạn (hiện ${form.bio.trim().length}).`;
    if (form.skills.length === 0) e.skills = "Thêm ít nhất một kỹ năng.";
    const y = Number(form.yearsExperience);
    if (form.yearsExperience === "" || !(y >= 0 && y <= 60)) e.yearsExperience = "Nhập số năm từ 0 đến 60.";
    const r = Number(form.hourlyRate);
    if (form.hourlyRate === "" || !(r >= 0 && r <= 100_000_000)) e.hourlyRate = "Nhập mức phí từ 0 đến 100.000.000 đ.";
    const c = Number(form.capacity);
    if (form.capacity === "" || !(c >= 1 && c <= 50)) e.capacity = "Nhập sức chứa từ 1 đến 50.";
    if (profile) {
      if (slots.some((s) => !s.startTime || !s.endTime || s.startTime >= s.endTime)) e.slots = "Mỗi khung giờ cần giờ kết thúc sau giờ bắt đầu.";
      if (booking) Object.assign(e, bookingErrors(booking));
    }
    return e;
  }

  async function save(): Promise<boolean> {
    const e = validate();
    setErrors(e);
    setMsg({});
    const count = Object.keys(e).length;
    if (count) {
      const first = e.displayName || e.domain || e.bio || e.yearsExperience || e.hourlyRate || e.capacity ? "cb" : e.skills ? "ks" : e.slots ? "lich" : "dat";
      jumpToSection(first);
      return false;
    }
    setSaving(true);
    try {
      let p = profile;
      if (!profile || dirtyBy.cb || dirtyBy.ks || dirtyBy.pf) {
        p = await profileApi.saveMentor(user.userId, {
          displayName: form.displayName.trim(),
          headline: form.headline,
          domain: form.domain,
          bio: form.bio,
          skills: form.skills,
          portfolioLinks: form.links,
          cvFileUrl: form.cvFileUrl,
          previousDomains: form.previousDomains.filter((d) => d !== form.domain),
          yearsExperience: Number(form.yearsExperience),
          hourlyRate: Number(form.hourlyRate),
          capacity: Number(form.capacity),
        });
      }
      if (dirtyBy.lich) {
        await profileApi.saveAvailability(user.userId, slots.map((s) => ({ dayOfWeek: Number(s.dayOfWeek), startTime: s.startTime, endTime: s.endTime })));
      }
      if (dirtyBy.dat && booking && (profile || p)) {
        const link = (booking.meetingLink || "").trim();
        p = await profileApi.saveBookingSettings(user.userId, { ...booking, meetingLink: link || null, minNoticeHours: Number(booking.minNoticeHours) });
      }
      const fresh = await profileApi.getMentor(user.userId).catch(() => p);
      if (fresh) {
        hydrate(fresh);
        setDisplayTimeZone(fresh.timezone);
      }
      setIndexKey((k) => k + 1);
      showToast({ text: "Đã lưu hồ sơ", actionLabel: "Xem hồ sơ", onAction: () => router.push(`/mentors/${user.userId}`) });
      if (fresh?.verificationStatus === "PENDING_INTERVIEW") setMsg({ info: "Bước tiếp theo: hoàn thành phỏng vấn xác thực năng lực để hồ sơ được duyệt." });
      return true;
    } catch (err) {
      setMsg({ error: errorMessage(err) });
      return false;
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setForm(base.form);
    setSlots(base.slots);
    setBooking(base.booking);
    setErrors({});
    setMsg({});
    showToast({ text: "Đã huỷ các thay đổi chưa lưu" });
  }

  const leaveDialog = useLeaveGuard(dirty, dirtyNames, save);

  /* ---- CV ---- */
  async function viewCv(url: string) {
    try { await openCvFile(url); } catch (e) { setMsg({ error: errorMessage(e) }); }
  }
  /** Sau khi xoá CV: ai-service đã gỡ cvFileUrl khỏi hồ sơ → bỏ tham chiếu đó ở cả form lẫn bản gốc để không báo "chưa lưu" sai. */
  function afterCvDeleted(cv: CvSummary) {
    const strip = (f: MentorForm): MentorForm => ({ ...f, cvFileUrl: f.cvFileUrl === cv.fileUrl ? null : f.cvFileUrl });
    setForm(strip);
    setBase((b) => ({ ...b, form: strip(b.form) }));
    profileApi.getMentor(user.userId).then(setProfile).catch(() => {});
  }
  async function prefillFromCv(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setMsg({ error: "CV tối đa 5 MB. Chọn tệp nhỏ hơn." });
    setParsing(true);
    setMsg({});
    try {
      const cv = await aiApi.parseCv(file, cvConsent);
      const p = cv.parsed;
      setForm((f) => ({
        ...f,
        skills: [...f.skills, ...p.skills.filter((s) => !f.skills.some((x) => x.toLowerCase() === s.toLowerCase()))],
        yearsExperience: p.yearsExperience ?? f.yearsExperience,
        bio: f.bio || p.summary || "",
        cvFileUrl: aiApi.cvFileUrl(cv.id),
      }));
      setMsg({ ok: `Đã trích xuất ${p.skills.length} kỹ năng từ CV (engine ${cv.engine}). Kiểm tra lại rồi bấm Lưu hồ sơ.` });
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    } finally {
      setParsing(false);
      setCvListKey((k) => k + 1);
    }
  }

  /* ---- khung giờ ---- */
  const slotField = (i: number, patch: Partial<SlotForm>) => setSlots((cur) => cur.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  function removeSlot(i: number) {
    const prev = slots;
    const s = slots[i];
    setSlots(slots.filter((_, k) => k !== i));
    setDelSlot(null);
    showToast({ text: `Đã xoá khung giờ ${dayName(s.dayOfWeek)}`, actionLabel: "Hoàn tác", onAction: () => setSlots(prev) });
  }

  /* ---- xoá hồ sơ ---- */
  function askDeleteProfile() {
    setConfirmText("");
    setDelProfile(profile && profile.activeMenteeCount > 0 ? "blocked" : "confirm");
  }
  async function doDeleteProfile() {
    setDelBusy(true);
    try {
      if (MOCK_PROFILE_DELETE) await mockDeleteProfile(); // TODO backend: DELETE /api/profile/mentor/{id}
      setDelProfile(null);
      showToast({ text: "Chức năng xoá hồ sơ đang chờ backend (chế độ mô phỏng), chưa có dữ liệu nào bị xoá." });
    } catch (err) {
      setMsg({ error: errorMessage(err) });
      setDelProfile(null);
    } finally {
      setDelBusy(false);
    }
  }

  const railItems: RailItem[] = [
    { id: "cb", label: "Thông tin chuyên môn", icon: UserRound, dirty: dirtyBy.cb },
    { id: "ks", label: "Kỹ năng", icon: Sparkles, dirty: dirtyBy.ks },
    { id: "pf", label: "Portfolio và CV", icon: Briefcase, dirty: dirtyBy.pf },
    { id: "lich", label: "Lịch rảnh hằng tuần", icon: CalendarClock, dirty: dirtyBy.lich },
    { id: "nghi", label: "Ngày nghỉ", icon: CalendarOff },
    { id: "dat", label: "Cài đặt đặt lịch", icon: Settings2, dirty: dirtyBy.dat },
    { id: "tt", label: "Trạng thái nhận mentee", icon: Power },
  ];
  const active = useActiveSection(railItems.map((r) => r.id));
  const errorCount = Object.keys(errors).length;
  const locate = (key: string, label: string) => {
    const k = `${key} ${label}`.toLowerCase();
    if (/cv|portfolio|link/.test(k)) return "pf";
    if (/skill|kỹ năng/.test(k)) return "ks";
    if (/avail|lịch|schedule/.test(k)) return "lich";
    return "cb";
  };

  if (profile === undefined) return <Loading />;
  const needProfile = <Alert tone="info">Lưu hồ sơ ở mục “Thông tin chuyên môn” trước khi dùng mục này.</Alert>;

  return (
    <div className="pe-page">
      <PageHeader
        back={{ href: `/mentors/${user.userId}`, label: "Xem hồ sơ công khai" }}
        title="Quản lý hồ sơ mentor"
        description="AI dùng thông tin này để gợi ý bạn cho mentee phù hợp."
        actions={<>{profile && <StatusBadge status={profile.verificationStatus} />}<ButtonLink href={`/mentors/${user.userId}`} icon={Eye}>Xem như mentee thấy</ButtonLink></>}
      />
      <div className="pe-layout">
        <SectionRail items={railItems} active={active} />
        <main className="pe-main">
          {profile?.completeness && <CompletenessBar completeness={profile.completeness} locate={locate} />}
          <FlashAlerts flash={msg} />
          {errorCount > 0 && (
            <div role="alert" className="pe-errsum">
              <TriangleAlert aria-hidden="true" />
              <span><b>Chưa lưu được.</b> Sửa {errorCount} mục dưới đây rồi lưu lại.</span>
            </div>
          )}

          <EditSection id="cb" icon={UserRound} title="Thông tin chuyên môn" defaultOpenMobile
            actions={profile ? <EmbeddingInfo userId={user.userId} refreshKey={indexKey} /> : undefined}>
            <div className="flex flex-col gap-5">
              {profile && (
                <AvatarRow userId={user.userId} name={profile.displayName} avatarUrl={profile.avatarUrl}
                  onChange={() => profileApi.getMentor(user.userId).then(setProfile).catch(() => {})}
                  onError={(m) => setMsg({ error: m })} onDone={(m) => showToast({ text: m })} />
              )}
              <div className="form-grid">
                <Field label="Tên hiển thị" id="m-name" required className="span-2" error={errors.displayName}>
                  <Input id="m-name" value={form.displayName} aria-invalid={!!errors.displayName} onChange={onText("displayName")} />
                </Field>
                <Field label="Lĩnh vực chuyên môn chính" id="m-domain" required error={errors.domain}>
                  <DomainSelect id="m-domain" value={form.domain} invalid={!!errors.domain} onChange={(v) => set("domain", v)} />
                </Field>
                <Field label="Số năm kinh nghiệm" id="m-years" error={errors.yearsExperience}>
                  <Input id="m-years" type="number" inputMode="numeric" min={0} max={60} value={form.yearsExperience} aria-invalid={!!errors.yearsExperience} onChange={onText("yearsExperience")} />
                </Field>
                {profile && (
                  <div className="span-2 flex flex-col gap-2">
                    <DomainsSummaryCard mentorId={user.userId} />
                    <Link href="/profile/domains" className="pe-more">Quản lý các lĩnh vực →</Link>
                  </div>
                )}
                <Field label="Tiêu đề ngắn" id="m-headline" className="span-2" hint={`Hiện trên thẻ mentor · ${form.headline.length}/80 ký tự`}>
                  <Input id="m-headline" value={form.headline} maxLength={80} onChange={onText("headline")} placeholder="Senior Backend Engineer · 8 năm Java/Spring" />
                </Field>
                <Field label="Giới thiệu bản thân" id="m-bio" required className="span-2" error={errors.bio}
                  hint={`${form.bio.trim().length}/${MIN_BIO}+ ký tự. Nêu kinh nghiệm, cách bạn hướng dẫn và loại mentee phù hợp.`}>
                  <Textarea id="m-bio" rows={4} value={form.bio} aria-invalid={!!errors.bio} onChange={onText("bio")} className="min-h-[120px]" />
                </Field>
                <Field label="Mức phí (đ / giờ)" id="m-rate" error={errors.hourlyRate} hint="Bạn tự đặt mức phí. Chỉ áp dụng cho yêu cầu đặt mới.">
                  <Input id="m-rate" type="number" inputMode="numeric" min={0} max={100000000} step={10000} value={form.hourlyRate} aria-invalid={!!errors.hourlyRate} onChange={onText("hourlyRate")} />
                </Field>
                <Field label="Sức chứa (số mentee tối đa)" id="m-capacity" error={errors.capacity}>
                  <Input id="m-capacity" type="number" inputMode="numeric" min={1} max={50} value={form.capacity} aria-invalid={!!errors.capacity} onChange={onText("capacity")} />
                </Field>
                <Field label="Từng làm trong lĩnh vực" className="span-2"
                  hint="Chọn nếu bạn từng chuyển ngành — mentee muốn chuyển ngách sẽ ưu tiên gặp bạn.">
                  <Chips>
                    {DOMAINS.filter(([v]) => v !== form.domain).map(([v, l]) => (
                      <Chip key={v} selected={form.previousDomains.includes(v)}
                        onClick={() => set("previousDomains", form.previousDomains.includes(v) ? form.previousDomains.filter((d) => d !== v) : [...form.previousDomains, v])}>
                        {l}
                      </Chip>
                    ))}
                  </Chips>
                </Field>
              </div>
            </div>
          </EditSection>

          <EditSection id="ks" icon={Sparkles} title="Kỹ năng" description="Thêm bằng cách gõ rồi Enter. Bấm dấu X để xoá.">
            <Field error={errors.skills}>
              <ChipEditor items={form.skills} onChange={(v) => set("skills", v)} label="Kỹ năng" placeholder="Thêm kỹ năng, ví dụ Kafka" suggestions={SUGGESTIONS[form.domain] ?? SUGGESTIONS.backend} />
            </Field>
          </EditSection>

          <EditSection id="pf" icon={Briefcase} title="Portfolio và CV">
            <div className="flex flex-col gap-5">
              <LinkEditor links={form.links} onChange={(v) => set("links", v)}
                onRemoved={(l, restore) => showToast({ text: "Đã xoá liên kết", actionLabel: "Hoàn tác", onAction: restore })} />
              <div className="pe-cvbox">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <b>Tải CV (PDF, tối đa 5 MB)</b>
                    <p className="field-hint">
                      {form.cvFileUrl ? "CV đang gắn với hồ sơ. Tải CV mới sẽ điền nhanh kỹ năng và số năm kinh nghiệm, bạn kiểm tra lại rồi lưu." : "CV chỉ bạn và quản trị viên xem được. Chưa có CV nào được tải."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="mentor-cv" className={`btn ${parsing ? "pointer-events-none opacity-50" : ""}`}>
                      {parsing ? <span className="spinner" aria-hidden="true" /> : <Upload aria-hidden="true" />}
                      {parsing ? "Đang phân tích CV…" : "Chọn tệp"}
                    </label>
                    <input id="mentor-cv" type="file" accept="application/pdf" className="sr-only" disabled={parsing}
                      onChange={(e) => { prefillFromCv(e.target.files?.[0]); e.target.value = ""; }} />
                    {form.cvFileUrl && <Button variant="ghost" icon={Eye} onClick={() => form.cvFileUrl && viewCv(form.cvFileUrl)}>Xem CV</Button>}
                  </div>
                </div>
                <CvConsent checked={cvConsent} onChange={setCvConsent} audience="MENTOR" disabled={parsing} />
              </div>
              <MyCvs refreshKey={cvListKey} onDeleted={afterCvDeleted} />
            </div>
          </EditSection>

          <EditSection id="lich" icon={CalendarClock} title="Lịch rảnh hằng tuần"
            description={profile ? `Theo múi giờ ${profile.timezone}. Mentee chỉ đặt được phiên trong các khung này.` : undefined}>
            {!profile ? needProfile : (
              <div className="flex flex-col gap-3">
                {errors.slots && <p className="field-error" role="alert">{errors.slots}</p>}
                {slots.length === 0 && (
                  <div className="pe-empty">
                    <CalendarClock aria-hidden="true" />
                    <b>Chưa có khung giờ rảnh</b>
                    <p>Mentee sẽ không đặt được phiên cho đến khi bạn thêm lịch.</p>
                  </div>
                )}
                {slots.map((s, i) => (
                  <div className="pe-slot" key={i} role="group" aria-label={`Khung giờ ${i + 1}`}>
                    <Select aria-label="Ngày" className="pe-slot-day" value={s.dayOfWeek} onChange={(e) => slotField(i, { dayOfWeek: e.target.value })}>
                      {DAY_NAMES.slice(1).map((d, idx) => <option key={d} value={idx + 1}>{d}</option>)}
                    </Select>
                    <Input aria-label="Từ giờ" type="time" className="pe-slot-time" value={s.startTime} onChange={(e) => slotField(i, { startTime: e.target.value })} />
                    <span className="text-ink-muted" aria-hidden="true">→</span>
                    <Input aria-label="Đến giờ" type="time" className="pe-slot-time" value={s.endTime} onChange={(e) => slotField(i, { endTime: e.target.value })} />
                    <Button variant="ghost" iconOnly icon={Trash2} label={`Xoá khung giờ ${dayName(s.dayOfWeek)}`} onClick={() => setDelSlot(i)} />
                  </div>
                ))}
                <div>
                  <Button variant="ghost" icon={Plus} onClick={() => setSlots([...slots, { dayOfWeek: 1, startTime: "19:00", endTime: "21:00" }])}>Thêm khung giờ</Button>
                </div>
              </div>
            )}
          </EditSection>

          <EditSection id="nghi" icon={CalendarOff} title="Ngày nghỉ và giờ bận đột xuất" description="Mentee không đặt được phiên mới vào các khoảng này. Phiên đã xác nhận không tự huỷ.">
            {profile ? <AvailabilityExceptions mentorId={user.userId} onToast={(text) => showToast({ text })} /> : needProfile}
          </EditSection>

          <EditSection id="dat" icon={Settings2} title="Cài đặt đặt lịch" description="Áp dụng khi mentee đặt phiên với bạn.">
            {profile && booking ? (
              <BookingSettings key={profile.userId} profile={profile} value={booking} onChange={setBooking} errors={errors}
                onProfile={(p) => { setProfile(p); setDisplayTimeZone(p.timezone); }} />
            ) : needProfile}
          </EditSection>

          <EditSection id="tt" icon={Power} title="Trạng thái nhận mentee" description="Đổi trạng thái có hiệu lực ngay, không cần bấm Lưu hồ sơ.">
            {profile ? <MentorStatusControl profile={profile} onChange={setProfile} /> : needProfile}
          </EditSection>

          {profile && (
            <DangerZone title="Xoá hồ sơ mentor" button="Xoá hồ sơ…" onClick={askDeleteProfile}
              text="Hồ sơ biến mất khỏi gợi ý. Chỉ xoá được khi không còn mentee hoặc phiên đang hoạt động." />
          )}
        </main>
      </div>

      <SaveBar dirty={dirty} saving={saving} count={dirtyNames.length} onSave={save} onReset={reset} />
      {toast}
      {leaveDialog}

      {delSlot !== null && slots[delSlot] && (
        <ConfirmModal title={`Xoá khung giờ ${dayName(slots[delSlot].dayOfWeek)} ${slots[delSlot].startTime} – ${slots[delSlot].endTime}?`}
          confirmText="Xoá khung giờ" cancelText="Giữ lại" onClose={() => setDelSlot(null)} onConfirm={() => removeSlot(delSlot)}>
          <p className="text-ink-muted">Mentee không đặt được phiên mới vào khung này nữa. Các phiên đã đặt không bị ảnh hưởng. Thay đổi có hiệu lực sau khi bạn bấm Lưu hồ sơ.</p>
        </ConfirmModal>
      )}

      {delProfile === "blocked" && profile && (
        <ConfirmModal title="Chưa thể xoá hồ sơ" confirmText="Đã hiểu" hideCancel tone="warning" onClose={() => setDelProfile(null)} onConfirm={() => setDelProfile(null)}>
          <p className="text-ink-muted">Bạn còn {profile.activeMenteeCount} mentee đang học. Hoàn tất hoặc kết thúc các mối quan hệ này trước, và kiểm tra các phiên sắp diễn ra.</p>
          <div className="flex flex-col gap-2">
            <Link href="/mentoring/relationships" className="pe-linkrow">{profile.activeMenteeCount} mentee đang học <span className="ml-auto text-accent-ink">Xem →</span></Link>
            <Link href="/mentoring/sessions" className="pe-linkrow">Các phiên sắp diễn ra <span className="ml-auto text-accent-ink">Xem →</span></Link>
          </div>
        </ConfirmModal>
      )}
      {delProfile === "confirm" && (
        <ConfirmModal title="Xoá hồ sơ mentor?" confirmText="Xoá hồ sơ" busy={delBusy} confirmDisabled={confirmText.trim().toUpperCase() !== "XOA HO SO"}
          onClose={() => setDelProfile(null)} onConfirm={doDeleteProfile}>
          <ul className="list-disc pl-5 text-ink-muted">
            <li>Hồ sơ và đánh giá hiển thị công khai sẽ bị gỡ</li>
            <li>Lịch rảnh và ngày nghỉ bị xoá</li>
            <li>Số dư ví vẫn giữ, rút tiền như bình thường</li>
          </ul>
          <Field label="Gõ XOA HO SO để xác nhận" id="m-del-confirm">
            <Input id="m-del-confirm" autoFocus autoComplete="off" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </Field>
          {MOCK_PROFILE_DELETE && <p className="text-small text-ink-subtle">Chế độ mô phỏng: backend chưa có API xoá hồ sơ nên chưa có dữ liệu nào bị xoá.</p>}
        </ConfirmModal>
      )}
    </div>
  );
}
