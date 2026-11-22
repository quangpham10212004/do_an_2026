"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Eye, GraduationCap, Lock, Search, Sparkles, Trash2, TriangleAlert, Upload } from "lucide-react";
import { Button, ButtonLink, Field, FlashAlerts, Input, Loading, PageHeader, Select, Textarea, type Flash } from "@/components/ui";
import { profileApi } from "@/features/profile/api";
import { aiApi } from "@/features/ai/api";
import MyCvs, { openCvFile } from "@/features/ai/MyCvs";
import CvConsent from "@/features/ai/CvConsent";
import MenteePreferences, { prefsErrors, prefsFromProfile, prefsToInput, type PrefsForm } from "@/features/profile/MenteePreferences";
import {
  AvatarRow, ChipEditor, CompletenessBar, ConfirmModal, DangerZone, DomainSelect, EditSection, EmbeddingInfo, LinkEditor, MOCK_PROFILE_DELETE,
  SaveBar, SectionRail, jumpToSection, mockDeleteProfile, useActiveSection, useLeaveGuard, useToast, type RailItem,
} from "@/features/profile/editKit";
import { errorMessage } from "@/lib/api";
import type { Level, MenteeProfile, SessionUser } from "@/types";

interface MenteeForm {
  displayName: string;
  goal: string;
  domain: string;
  currentLevel: Level;
  skills: string[];
  /** Kỹ năng muốn học — MOCK: backend chưa có trường này, lưu tạm ở trình duyệt. */
  wantSkills: string[];
  links: string[];
}
interface Snapshot { form: MenteeForm; prefs: PrefsForm }

/**
 * Cờ mock: kỹ năng "Muốn học" chưa có trong profile-service.
 * TODO backend: thêm `learningSkills: string[]` vào MenteeProfile/MenteeProfileInput (PUT /api/profile/mentee/{id}).
 * Khi true: lưu ở localStorage theo userId, chỉ hiện với chính mentee trên trình duyệt này.
 */
const MOCK_WANT_SKILLS = true;
const wantKey = (id: string) => `mmp.menteeWantSkills.${id}`;
const readWant = (id: string): string[] => {
  try { const v = JSON.parse(window.localStorage.getItem(wantKey(id)) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
};
const writeWant = (id: string, v: string[]) => { try { window.localStorage.setItem(wantKey(id), JSON.stringify(v)); } catch { /* bỏ qua */ } };

const formFromProfile = (p: MenteeProfile, want: string[]): MenteeForm => ({
  displayName: p.displayName, goal: p.goal || "", domain: p.domain, currentLevel: p.currentLevel, skills: p.skills, wantSkills: want, links: p.portfolioLinks,
});
const emptyForm = (name: string): MenteeForm => ({ displayName: name, goal: "", domain: "", currentLevel: "BEGINNER", skills: [], wantSkills: [], links: [] });
const emptyPrefs: PrefsForm = { days: [], timeOfDay: "", budget: "", languages: [] };
const j = (v: unknown) => JSON.stringify(v);
const HASH_ALIAS: Record<string, string> = { preferences: "luuy", "my-cvs": "pf" };

export default function MenteeEdit({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [profile, setProfile] = useState<MenteeProfile | null | undefined>(undefined);
  const [form, setForm] = useState<MenteeForm>(emptyForm(user.fullName || ""));
  const [prefs, setPrefs] = useState<PrefsForm>(emptyPrefs);
  const [base, setBase] = useState<Snapshot>({ form: emptyForm(user.fullName || ""), prefs: emptyPrefs });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Flash>({});
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [cvConsent, setCvConsent] = useState(false);
  const [cvListKey, setCvListKey] = useState(0);
  const [indexKey, setIndexKey] = useState(0);
  const [delCv, setDelCv] = useState(false);
  const [delData, setDelData] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [toast, showToast] = useToast();

  const hydrate = useCallback((p: MenteeProfile) => {
    const f = formFromProfile(p, MOCK_WANT_SKILLS ? readWant(p.userId) : []);
    const pr = prefsFromProfile(p);
    setProfile(p);
    setForm(f);
    setPrefs(pr);
    setBase({ form: f, prefs: pr });
    setErrors({});
  }, []);

  useEffect(() => {
    profileApi.getMentee(user.userId).then(hydrate).catch(() => setProfile(null));
  }, [user, hydrate]);

  useEffect(() => {
    if (profile === undefined) return;
    const h = window.location.hash.slice(1);
    const id = HASH_ALIAS[h] ?? h;
    if (id && document.getElementById(id)) jumpToSection(id);
  }, [profile === undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof MenteeForm>(k: K, v: MenteeForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const onText = (k: "displayName" | "goal") => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value);

  const dirtyBy = useMemo(() => ({
    hh: j([form.displayName, form.currentLevel, form.domain, form.goal]) !== j([base.form.displayName, base.form.currentLevel, base.form.domain, base.form.goal]),
    ks: j([form.skills, form.wantSkills]) !== j([base.form.skills, base.form.wantSkills]),
    pf: j(form.links) !== j(base.form.links),
    luuy: j(prefs) !== j(base.prefs),
  }), [form, prefs, base]);
  const names: Record<keyof typeof dirtyBy, string> = { hh: "Thông tin học tập", ks: "Kỹ năng", pf: "Portfolio và CV", luuy: "Lưu ý khi tìm mentor" };
  const dirtyNames = (Object.keys(dirtyBy) as (keyof typeof dirtyBy)[]).filter((k) => dirtyBy[k]).map((k) => names[k]);
  const dirty = dirtyNames.length > 0;

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.displayName.trim()) e.displayName = "Nhập tên hiển thị.";
    if (!form.domain) e.domain = "Chọn lĩnh vực muốn học.";
    if (!form.goal.trim()) e.goal = "Nhập mục tiêu học tập để AI gợi ý đúng mentor.";
    return { ...e, ...prefsErrors(prefs) };
  }

  async function save(): Promise<boolean> {
    const e = validate();
    setErrors(e);
    setMsg({});
    if (Object.keys(e).length) {
      jumpToSection(e.displayName || e.domain || e.goal ? "hh" : "luuy");
      return false;
    }
    setSaving(true);
    try {
      if (!profile || dirtyBy.hh || dirtyBy.ks || dirtyBy.pf) {
        await profileApi.saveMentee(user.userId, {
          displayName: form.displayName.trim(), goal: form.goal, domain: form.domain, currentLevel: form.currentLevel, skills: form.skills, portfolioLinks: form.links,
        });
      }
      if (MOCK_WANT_SKILLS && dirtyBy.ks) writeWant(user.userId, form.wantSkills);
      if (dirtyBy.luuy) await profileApi.saveMenteePreferences(user.userId, prefsToInput(prefs));
      const fresh = await profileApi.getMentee(user.userId);
      hydrate(fresh);
      setIndexKey((k) => k + 1);
      showToast({ text: "Đã lưu hồ sơ", actionLabel: "Xem hồ sơ", onAction: () => router.push(`/mentees/${user.userId}`) });
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
    setPrefs(base.prefs);
    setErrors({});
    setMsg({});
    showToast({ text: "Đã huỷ các thay đổi chưa lưu" });
  }

  const leaveDialog = useLeaveGuard(dirty, dirtyNames, save);

  /* ---- CV ---- */
  const cvId = profile?.cvFileUrl?.match(/\/api\/ai\/cv\/([^/]+)\/file/)?.[1];
  async function viewCv(url: string) {
    try { await openCvFile(url); } catch (e) { setMsg({ error: errorMessage(e) }); }
  }
  async function uploadCv(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setMsg({ error: "CV tối đa 5 MB. Chọn tệp nhỏ hơn." });
    setParsing(true);
    setMsg({});
    try {
      const cv = await aiApi.parseCv(file, cvConsent);
      setForm((f) => ({ ...f, skills: [...f.skills, ...cv.parsed.skills.filter((s) => !f.skills.some((x) => x.toLowerCase() === s.toLowerCase()))] }));
      showToast({ text: `Đã tải CV và trích xuất ${cv.parsed.skills.length} kỹ năng. Kiểm tra lại rồi bấm Lưu hồ sơ.` });
    } catch (err) {
      setMsg({ error: errorMessage(err) });
    } finally {
      setParsing(false);
      setCvListKey((k) => k + 1);
      profileApi.getMentee(user.userId).then(setProfile).catch(() => {});
    }
  }
  async function removeCv() {
    if (!cvId) return setDelCv(false);
    setDelBusy(true);
    try {
      await aiApi.deleteCv(cvId);
      setDelCv(false);
      setCvListKey((k) => k + 1);
      showToast({ text: "Đã xoá CV" });
      profileApi.getMentee(user.userId).then(setProfile).catch(() => {});
    } catch (err) {
      setMsg({ error: errorMessage(err) });
      setDelCv(false);
    } finally {
      setDelBusy(false);
    }
  }

  async function deleteData() {
    setDelBusy(true);
    try {
      if (MOCK_PROFILE_DELETE) await mockDeleteProfile(); // TODO backend: DELETE /api/profile/mentee/{id}/data
      setDelData(false);
      showToast({ text: "Chức năng xoá dữ liệu hồ sơ đang chờ backend (chế độ mô phỏng), chưa có dữ liệu nào bị xoá." });
    } finally {
      setDelBusy(false);
    }
  }

  const railItems: RailItem[] = [
    { id: "hh", label: "Thông tin học tập", icon: GraduationCap, dirty: dirtyBy.hh },
    { id: "ks", label: "Kỹ năng", icon: Sparkles, dirty: dirtyBy.ks },
    { id: "pf", label: "Portfolio và CV", icon: Briefcase, dirty: dirtyBy.pf },
    { id: "luuy", label: "Lưu ý khi tìm mentor", icon: Search, dirty: dirtyBy.luuy },
  ];
  const active = useActiveSection(railItems.map((r) => r.id));
  const errorCount = Object.keys(errors).length;
  const locate = (key: string, label: string) => {
    const k = `${key} ${label}`.toLowerCase();
    if (/cv|portfolio|link/.test(k)) return "pf";
    if (/skill|kỹ năng/.test(k)) return "ks";
    if (/pref|lưu ý|sở thích/.test(k)) return "luuy";
    return "hh";
  };

  if (profile === undefined) return <Loading />;

  return (
    <div className="pe-page">
      <PageHeader title="Hồ sơ nghề nghiệp" description="AI dùng thông tin này để gợi ý mentor phù hợp với bạn."
        actions={<ButtonLink href={`/mentees/${user.userId}`} icon={Eye}>Xem hồ sơ công khai</ButtonLink>} />
      <div className="pe-layout pe-layout-aside">
        <SectionRail items={railItems} active={active} />
        <main className="pe-main">
          <FlashAlerts flash={msg} />
          {errorCount > 0 && (
            <div role="alert" className="pe-errsum">
              <TriangleAlert aria-hidden="true" />
              <span><b>Chưa lưu được.</b> Sửa {errorCount} mục dưới đây rồi lưu lại.</span>
            </div>
          )}
          {profile && (
            <section className="pe-section pe-plain">
              <div className="pe-body">
                <AvatarRow userId={user.userId} name={profile.displayName} avatarUrl={profile.avatarUrl} timezone={profile.timezone}
                  onChange={() => profileApi.getMentee(user.userId).then(setProfile).catch(() => {})}
                  onError={(m) => setMsg({ error: m })} onDone={(m) => showToast({ text: m })} />
              </div>
            </section>
          )}

          <EditSection id="hh" icon={GraduationCap} title="Thông tin học tập" defaultOpenMobile
            actions={profile ? <EmbeddingInfo userId={user.userId} refreshKey={indexKey} /> : undefined}>
            <div className="form-grid">
              <Field label="Tên hiển thị" id="e-name" required error={errors.displayName}>
                <Input id="e-name" value={form.displayName} aria-invalid={!!errors.displayName} onChange={onText("displayName")} />
              </Field>
              <Field label="Trình độ hiện tại" id="e-level">
                <Select id="e-level" value={form.currentLevel} onChange={(e) => set("currentLevel", e.target.value as Level)}>
                  <option value="BEGINNER">Mới bắt đầu</option>
                  <option value="INTERMEDIATE">Trung cấp</option>
                  <option value="ADVANCED">Nâng cao</option>
                </Select>
              </Field>
              <Field label="Lĩnh vực muốn học" id="e-domain" required error={errors.domain} className="span-2">
                <DomainSelect id="e-domain" value={form.domain} invalid={!!errors.domain} onChange={(v) => set("domain", v)} />
              </Field>
              <Field label="Mục tiêu học tập" id="e-goal" required error={errors.goal} className="span-2">
                <Textarea id="e-goal" rows={4} value={form.goal} aria-invalid={!!errors.goal} onChange={onText("goal")} className="min-h-[120px]"
                  placeholder="Chuẩn bị phỏng vấn backend Java trong 3 tháng, muốn học system design" />
              </Field>
            </div>
          </EditSection>

          <EditSection id="ks" icon={Sparkles} title="Kỹ năng" description="Gõ tên kỹ năng rồi Enter. Bấm dấu X để xoá.">
            <div className="pe-two">
              <div>
                <div className="pe-sub">Đã có</div>
                <ChipEditor items={form.skills} onChange={(v) => set("skills", v)} label="Kỹ năng đã có" placeholder="+ Thêm kỹ năng" />
              </div>
              <div>
                <div className="pe-sub">Muốn học</div>
                <ChipEditor items={form.wantSkills} onChange={(v) => set("wantSkills", v)} label="Kỹ năng muốn học" placeholder="+ Thêm kỹ năng" />
                {MOCK_WANT_SKILLS && <p className="field-hint mt-2">Danh sách này hiện chỉ lưu trên trình duyệt này và chưa dùng cho gợi ý.</p>}
              </div>
            </div>
          </EditSection>

          <EditSection id="pf" icon={Briefcase} title="Portfolio, dự án và CV">
            <div className="flex flex-col gap-5">
              <LinkEditor links={form.links} onChange={(v) => set("links", v)}
                onRemoved={(l, restore) => showToast({ text: "Đã xoá liên kết", actionLabel: "Hoàn tác", onAction: restore })} />
              <div className="pe-cvbox">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <b>{profile?.cvFileUrl ? "CV đang gắn với hồ sơ" : "Tải CV (PDF, tối đa 5 MB)"}</b>
                    <p className="field-hint">
                      {profile?.cvFileUrl ? "AI dùng CV này để hiểu bạn rõ hơn; mentor bạn gửi yêu cầu xem được file." : "Chưa có CV nào được gắn vào hồ sơ."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="mentee-cv" className={`btn ${parsing ? "pointer-events-none opacity-50" : ""}`}>
                      {parsing ? <span className="spinner" aria-hidden="true" /> : <Upload aria-hidden="true" />}
                      {parsing ? "Đang phân tích CV…" : profile?.cvFileUrl ? "Thay CV" : "Chọn tệp"}
                    </label>
                    <input id="mentee-cv" type="file" accept="application/pdf" className="sr-only" disabled={parsing}
                      onChange={(e) => { uploadCv(e.target.files?.[0]); e.target.value = ""; }} />
                    {profile?.cvFileUrl && <Button variant="ghost" icon={Eye} onClick={() => profile.cvFileUrl && viewCv(profile.cvFileUrl)}>Xem CV</Button>}
                    {cvId && <Button variant="danger-quiet" icon={Trash2} onClick={() => setDelCv(true)}>Xoá CV</Button>}
                  </div>
                </div>
                <CvConsent checked={cvConsent} onChange={setCvConsent} audience="MENTEE" disabled={parsing} />
              </div>
              <MyCvs refreshKey={cvListKey} onDeleted={() => profileApi.getMentee(user.userId).then(setProfile).catch(() => {})} />
            </div>
          </EditSection>

          <EditSection id="luuy" icon={Search} title="Những lưu ý khi tìm mentor" description="Bỏ trống mục nào nghĩa là không giới hạn mục đó.">
            <MenteePreferences value={prefs} onChange={setPrefs} errors={errors} />
          </EditSection>

          {profile && (
            <DangerZone title="Xoá dữ liệu hồ sơ" button="Xoá dữ liệu…" onClick={() => setDelData(true)}
              text="Xoá mục tiêu, kỹ năng, CV và lưu ý khi tìm mentor. Tài khoản và lịch sử phiên học vẫn giữ." />
          )}
        </main>

        <aside className="pe-aside" aria-label="Thông tin thêm">
          {profile && <CompletenessBar completeness={profile.completeness} locate={locate} matchingMin={50} />}
          {profile && profile.completeness.items.length > 0 && (
            <ul className="pe-checklist" aria-label="Các mục hồ sơ">
              {profile.completeness.items.map((i) => (
                <li key={i.key} data-done={i.done}>
                  {i.done ? <span>{i.label}</span> : <a href={`#${locate(i.key, i.label)}`} onClick={(e) => { e.preventDefault(); jumpToSection(locate(i.key, i.label)); }}>{i.label} →</a>}
                </li>
              ))}
            </ul>
          )}
          <section className="pe-section pe-privacy">
            <div className="pe-body">
              <h2><span className="pf-ico"><Lock aria-hidden="true" /></span>Ai thấy gì?</h2>
              <p>Mentor chỉ thấy mục tiêu, kỹ năng và lưu ý khi tìm mentor. CV và liên hệ chỉ hiện sau khi mentor chấp nhận yêu cầu của bạn.</p>
            </div>
          </section>
        </aside>
      </div>

      <SaveBar dirty={dirty} saving={saving} count={dirtyNames.length} onSave={save} onReset={reset} />
      {toast}
      {leaveDialog}

      {delCv && (
        <ConfirmModal title="Xoá CV này?" confirmText="Xoá CV" cancelText="Giữ lại" busy={delBusy} onClose={() => setDelCv(false)} onConfirm={removeCv}>
          <p className="text-ink-muted">File CV bị xoá khỏi MentorHub và gỡ khỏi hồ sơ. Việc này không hoàn tác được.</p>
        </ConfirmModal>
      )}
      {delData && (
        <ConfirmModal title="Xoá dữ liệu hồ sơ?" confirmText="Xoá dữ liệu" busy={delBusy} onClose={() => setDelData(false)} onConfirm={deleteData}>
          <ul className="list-disc pl-5 text-ink-muted">
            <li>Mục tiêu, kỹ năng và liên kết bị xoá</li>
            <li>CV và lưu ý khi tìm mentor bị xoá</li>
            <li>Tài khoản và lịch sử phiên học vẫn giữ</li>
          </ul>
          {MOCK_PROFILE_DELETE && <p className="text-small text-ink-subtle">Chế độ mô phỏng: backend chưa có API xoá dữ liệu hồ sơ nên chưa có dữ liệu nào bị xoá.</p>}
        </ConfirmModal>
      )}
    </div>
  );
}
