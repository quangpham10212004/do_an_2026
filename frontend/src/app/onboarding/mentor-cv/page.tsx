"use client";

import Link from "next/link";
import { useEffect, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Loader2, Plus, ShieldCheck, Upload, Video, X } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Button, Card, CardBody, CardHeader, Chips, Field, Input, PageHeader } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import CvConsent from "@/features/ai/CvConsent";
import { initialFields } from "@/features/ai/CvReview";
import { errorMessage } from "@/lib/api";
import type { ConfirmedCvFields, Cv } from "@/types";

const STEPS = ["Tải CV", "Xác nhận hồ sơ", "Phỏng vấn AI", "Kết quả"];
const ANALYSIS = [
  "Đã đọc nội dung CV",
  "Rút lĩnh vực, kỹ năng, số năm kinh nghiệm",
  "Tìm dự án và quyết định kỹ thuật nổi bật…",
  "Chuẩn bị chủ đề phỏng vấn theo lĩnh vực",
];
const MAX_BYTES = 5 * 1024 * 1024;

function Steps({ current }: { current: number }) {
  return (
    <ol className="ob-steps" aria-label="Các bước trở thành mentor">
      {STEPS.map((label, i) => {
        const st = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={label} data-state={st} aria-current={st === "current" ? "step" : undefined}>
            <span className="ob-dot">{st === "done" ? <Check aria-hidden="true" /> : i + 1}</span>
            <span className="ob-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Câu hỏi phỏng vấn mẫu: dựa trên dự án đầu tiên trong CV, nếu có. */
function sampleQuestion(f: ConfirmedCvFields): string | null {
  const p = f.projects[0];
  if (!p?.name) return null;
  const tech = p.technologies.length ? ` bằng ${p.technologies.slice(0, 2).join(", ")}` : "";
  return `Bạn ghi từng làm dự án “${p.name}”${tech}. Hãy giải thích một quyết định kỹ thuật quan trọng bạn đã đưa ra, vì sao chọn cách đó và đánh đổi là gì.`;
}

function MentorCv() {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [cv, setCv] = useState<Cv | null>(null);
  const [fields, setFields] = useState<ConfirmedCvFields | null>(null);
  const [newSkill, setNewSkill] = useState("");
  const [years, setYears] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Hiệu ứng tiến độ phân tích (API chỉ trả kết quả một lần khi xong).
  useEffect(() => {
    if (!busy) return;
    setPhase(0);
    const t = setInterval(() => setPhase((p) => Math.min(p + 1, ANALYSIS.length - 1)), 1200);
    return () => clearInterval(t);
  }, [busy]);

  async function upload(f: File | undefined) {
    if (!f) return;
    setError("");
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) { setError("Hiện chỉ nhận CV định dạng PDF có lớp văn bản."); return; }
    if (f.size > MAX_BYTES) { setError("CV quá lớn, tối đa 5 MB."); return; }
    setFile(f);
    setBusy(true);
    try {
      const parsed = await aiApi.parseCv(f, consent);
      const start = initialFields(parsed);
      setCv(parsed);
      setFields(start);
      setYears(start.yearsExperience == null ? "" : String(start.yearsExperience));
    } catch (e) {
      setError(errorMessage(e));
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setCv(null); setFields(null); setFile(null); setError(""); setNewSkill("");
  }

  function addSkill() {
    const s = newSkill.trim();
    if (!fields || !s) return;
    if (!fields.skills.some((x) => x.toLowerCase() === s.toLowerCase()) && fields.skills.length < 30) setFields({ ...fields, skills: [...fields.skills, s] });
    setNewSkill("");
  }
  const onSkillKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSkill(); } };

  async function confirm() {
    if (!cv || !fields) return;
    const y = years.trim() === "" ? null : Number(years);
    if (y !== null && (!Number.isInteger(y) || y < 0 || y > 60)) { setError("Số năm kinh nghiệm phải là số nguyên từ 0 đến 60."); return; }
    setSaving(true);
    setError("");
    try {
      await aiApi.confirmCvFields(cv.id, { ...fields, role: fields.role?.trim() || null, yearsExperience: y });
      router.push("/profile");
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  const step = fields ? 1 : 0;
  return (
    <>
      <Steps current={step} />
      <PageHeader title="Tải CV mentor"
        description="CV là bắt buộc với mentor. AI đọc CV để điền sẵn hồ sơ và đặt câu hỏi phỏng vấn riêng cho bạn, nên bạn phải nói về chính những gì mình đã làm." />
      <div className="mb-4 flex justify-end"><Link href="/dashboard" className="inline-flex min-h-11 items-center text-small font-semibold">Lưu và thoát</Link></div>
      <Alert className="mb-6">{error}</Alert>

      {!fields && !busy && (
        <div className="max-w-[720px]">
          <Card>
            <CardBody className="flex flex-col gap-4">
              <div className="ob-drop" data-over={over}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files?.[0]); }}>
                <span className="ob-drop-ico"><Upload aria-hidden="true" /></span>
                <strong>Kéo thả CV vào đây</strong>
                <span className="text-small text-ink-muted">PDF có lớp văn bản, tối đa 5 MB · bắt buộc</span>
                <label htmlFor="mentor-cv-file" className="btn btn-primary">Chọn tệp từ máy</label>
                <input id="mentor-cv-file" type="file" accept="application/pdf" className="sr-only"
                  onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              <div className="well flex flex-col gap-1 text-small">
                <b>CV của bạn được dùng như thế nào</b>
                <span>• Quản trị viên xem CV gốc để duyệt hồ sơ.</span>
                <span>• AI dùng CV để đặt câu hỏi phỏng vấn sát với bạn và đối chiếu với điều bạn nói.</span>
                <span>• Mentee không thấy CV gốc, chỉ thấy hồ sơ công khai bạn tự chọn.</span>
              </div>
              <CvConsent checked={consent} onChange={setConsent} audience="MENTOR" />
            </CardBody>
          </Card>
        </div>
      )}

      {busy && (
        <div className="max-w-[720px]">
          <Card>
            <CardBody className="flex flex-col gap-4" >
              <div className="flex items-center gap-3">
                <span className="ob-file-ico"><FileText aria-hidden="true" /></span>
                <div className="min-w-0"><b className="break-all">{file?.name}</b><div className="text-small text-ink-muted">{file ? fileSize(file.size) : ""}</div></div>
              </div>
              <ol className="ob-progress" aria-live="polite" aria-label="AI đang phân tích">
                {ANALYSIS.map((t, i) => (
                  <li key={t} data-state={i < phase ? "done" : i === phase ? "current" : "todo"}>
                    <span className="ob-dot">{i < phase ? <Check aria-hidden="true" /> : i === phase ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}</span>
                    {t}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      )}

      {fields && cv && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card>
            <CardHeader title="Thông tin AI rút từ CV" description="Sửa nếu chưa đúng. Phần này điền sẵn vào hồ sơ mentor của bạn." />
            <CardBody className="flex flex-col gap-5">
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <Field label="Lĩnh vực chính" id="mcv-role">
                  <Input id="mcv-role" value={fields.role ?? ""} maxLength={120} placeholder="Ví dụ: Backend Java"
                    onChange={(e) => setFields({ ...fields, role: e.target.value })} />
                </Field>
                <Field label="Số năm kinh nghiệm" id="mcv-years">
                  <Input id="mcv-years" type="number" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)} />
                </Field>
              </div>
              <Field label={`Kỹ năng (${fields.skills.length}/30)`} id="mcv-skill">
                <Chips className="mb-1">
                  {fields.skills.length === 0 && <span className="text-small text-ink-muted">Chưa có kỹ năng nào</span>}
                  {fields.skills.map((s) => (
                    <span className="chip" key={s}>
                      {s}
                      <button type="button" aria-label={`Xoá ${s}`} className="ob-chip-x"
                        onClick={() => setFields({ ...fields, skills: fields.skills.filter((x) => x !== s) })}><X aria-hidden="true" /></button>
                    </span>
                  ))}
                </Chips>
                {fields.skills.length < 30 && (
                  <div className="input-group">
                    <Input id="mcv-skill" value={newSkill} maxLength={60} placeholder="Thêm kỹ năng rồi nhấn Enter" onChange={(e) => setNewSkill(e.target.value)} onKeyDown={onSkillKey} />
                    <Button icon={Plus} onClick={addSkill} disabled={!newSkill.trim()}>Thêm</Button>
                  </div>
                )}
              </Field>
              <div className="well text-small">
                <b>Chủ đề phỏng vấn của bạn</b> sẽ lấy theo lĩnh vực và kỹ năng ở trên{fields.skills.length > 0 && <>: {fields.skills.slice(0, 3).join(", ")}</>}. Sửa thông tin ở đây sẽ đổi câu hỏi phỏng vấn.
              </div>
            </CardBody>
          </Card>

          <div className="flex min-w-0 flex-col gap-6">
            <Card>
              <CardHeader title="Buổi phỏng vấn AI của bạn" actions={<span className="badge badge-accent"><ShieldCheck aria-hidden="true" /> Tạo từ CV</span>} />
              <CardBody className="flex flex-col gap-3 text-small">
                <p>AI phỏng vấn trực tiếp theo từng chủ đề của lĩnh vực: AI hỏi, bạn trả lời bằng giọng nói và hệ thống quay video. Câu hỏi dựa trên điều bạn ghi trong CV, nên không thể chuẩn bị đáp án sẵn.</p>
                {sampleQuestion(fields) && (
                  <div>
                    <div className="eyebrow mb-1">Ví dụ câu hỏi</div>
                    <p className="well">“{sampleQuestion(fields)}”</p>
                  </div>
                )}
                <div>
                  <div className="eyebrow mb-1">Chuẩn bị gì</div>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-ink-muted">
                    <li>Nhớ lại 1–2 dự án bạn thật sự làm và quyết định bạn tự đưa ra.</li>
                    <li>Buổi phỏng vấn tối đa 30 phút, cần micro và nên bật camera. Bị gián đoạn thì tiếp tục được trong 24 giờ.</li>
                  </ul>
                </div>
                <p className="text-ink-muted"><Video aria-hidden="true" className="mr-1 inline size-4" />CV càng đầy đủ, câu hỏi càng sát với bạn. CV quá ngắn có thể khiến AI đặt câu hỏi chung chung.</p>
              </CardBody>
            </Card>
          </div>
          <div className="flex flex-wrap justify-end gap-2 lg:col-span-2">
            <Button onClick={reset} disabled={saving}>Thay CV khác</Button>
            <Button variant="primary" onClick={confirm} loading={saving}>Xác nhận và hoàn thiện hồ sơ mentor</Button>
          </div>
        </div>
      )}
    </>
  );
}

export default function MentorCvPage() {
  return <RequireAuth roles={["MENTOR"]}><MentorCv /></RequireAuth>;
}
