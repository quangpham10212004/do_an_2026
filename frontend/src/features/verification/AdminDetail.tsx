"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Film, ListChecks, Mic, Sparkles } from "lucide-react";
import { Alert, Avatar, Badge, Button, ButtonLink, Card, CardBody, Checkbox, Field, Loading, PageHeader, Progress, Textarea } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { domainLabel } from "@/features/profile/api";
import type { VerifyAdminDetail, VerifyDecision } from "@/types/verification";
import { verifyAdminApi } from "./api";
import { CONF_LABEL, REC_LABEL, REC_TONE } from "./AdminQueue";
import { clock, fmtScore, shortDate, shortDateTime } from "./utils";

const STATUS_TEXT = { UNCLEAR: "Chờ quản trị viên xem xét", APPROVED: "Đã duyệt", REJECTED: "Đã từ chối" } as const;
const STATUS_TONE = { UNCLEAR: "warning", APPROVED: "success", REJECTED: "danger" } as const;

const DECISIONS: { id: VerifyDecision; title: string; desc: string; confirm: string }[] = [
  { id: "APPROVE", title: "Duyệt, cấp xác thực", desc: "Kích hoạt lĩnh vực, gắn nhãn \"Mentor mới\" 30 ngày", confirm: "Xác nhận duyệt" },
  { id: "REJECT", title: "Từ chối", desc: "Mentor được phỏng vấn lại sau 7 ngày", confirm: "Xác nhận từ chối" },
];

function Section({ icon: Icon, title, aside, children }: { icon: typeof Sparkles; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="pf-section">
      <div className="pf-section-head">
        <h2><span className="pf-ico"><Icon aria-hidden="true" /></span>{title}</h2>
        {aside && <span className="text-small text-ink-muted">{aside}</span>}
      </div>
      <div className="pf-section-body">{children}</div>
    </section>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "danger" | "warning" }) {
  return (
    <div className="vf-kpi">
      <div className="l">{label}</div>
      <div className="v" style={tone ? { color: tone === "danger" ? "var(--danger)" : "var(--warning)" } : undefined}>{value}</div>
      {hint && <div className="h">{hint}</div>}
    </div>
  );
}

export default function AdminDetail({ id }: { id: string }) {
  const [d, setD] = useState<VerifyAdminDetail | null>(null);
  const [error, setError] = useState("");
  const [decision, setDecision] = useState<VerifyDecision>("APPROVE");
  const [note, setNote] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    try { setD(await verifyAdminApi.detail(id)); } catch (e) { setError(errorMessage(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (!d) return error ? <Alert>{error}</Alert> : <Loading />;
  const decided = d.status !== "UNCLEAR";
  const opt = DECISIONS.find((x) => x.id === decision)!;
  const needNote = decision === "REJECT";
  const noteMissing = needNote && note.trim().length < 10;
  const hasVideo = d.answers.some((a) => a.videoUrl);
  const near = Math.abs(d.totalScore - d.passScore) <= 0.3;

  async function submit() {
    setBusy(true); setError("");
    try {
      await verifyAdminApi.decide(id, { decision, note: note.trim(), reviewedVideo: reviewed });
      setDone(decision === "APPROVE" ? "Đã duyệt. Lĩnh vực được xác thực và mentor nhận thông báo." : "Đã từ chối. Mentor được phỏng vấn lại sau 7 ngày.");
      await load();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/verification", label: "Duyệt mentor" }}
        title={<span className="flex items-center gap-3"><Avatar name={d.name} size="lg" />{d.name}</span>}
        description={<>{domainLabel(d.domain)} · {d.years} năm · {d.email} · <Badge tone={STATUS_TONE[d.status]}>{STATUS_TEXT[d.status]}</Badge></>}
        actions={<ButtonLink href={d.mentorProfileHref} size="sm">Xem hồ sơ và CV</ButtonLink>}
      />
      <Alert tone="success" className="mb-4">{done}</Alert>
      <Alert>{error}</Alert>

      <div className="vf-kpis">
        <Tile label="Điểm tổng (AI)" value={`${fmtScore(d.totalScore)} / 5`} hint={`Điểm đạt ${fmtScore(d.passScore)}${near ? " · sát ngưỡng" : ""}`} tone={near ? "warning" : undefined} />
        <Tile label="AI đề xuất" value={REC_LABEL[d.ai.recommendation]} hint={CONF_LABEL[d.ai.confidence]} />
        <Tile label="Thời lượng buổi" value={d.durationLabel} hint={`${d.answers.length} chủ đề`} />
        <Tile label="Lần phỏng vấn" value={d.attempt} hint={d.submittedAt ? `Nộp ${shortDateTime(d.submittedAt)}` : undefined} />
      </div>

      <div className="vf-detail-grid">
        <div className="vf-detail-main">
          <Section icon={Sparkles} title="AI chấm và đề xuất" aside={<Badge tone={REC_TONE[d.ai.recommendation]}>{REC_LABEL[d.ai.recommendation]} · {CONF_LABEL[d.ai.confidence]}</Badge>}>
            <div className="grid gap-4">
              {d.criteria.map((c) => (
                <div key={c.key}>
                  <div className="vf-bar-head"><span>{c.label}</span><b className="tabular">{fmtScore(c.score)} / 5</b></div>
                  <Progress value={(c.score / 5) * 100} label={c.label} />
                  <p className="mt-1 text-small text-ink-muted">{c.comment}</p>
                </div>
              ))}
            </div>
            <div className="vf-note"><b>Vì sao AI chuyển ca này cho bạn:</b> {d.ai.reason}</div>
            <p className="mt-2 text-small text-ink-subtle">AI chỉ đề xuất. Giọng vùng miền và chất lượng âm thanh có thể ảnh hưởng văn bản nhận dạng: hãy xem video trước khi quyết định.</p>
          </Section>

          <Section icon={Mic} title="Câu trả lời từng chủ đề" aside={`Video lưu đến ${shortDate(d.keepUntil)}`}>
            <div className="grid gap-3">
              {d.answers.map((a, i) => (
                <details key={a.id} className="vf-ans" open={i === 0}>
                  <summary>
                    <span className="vf-ans-n">{i + 1}</span>
                    <span className="min-w-0 flex-1"><b>{a.topic}</b><span className="block text-small text-ink-muted">{a.question}</span></span>
                    <span className="text-small text-ink-subtle tabular">{clock(a.durationSeconds)}</span>
                  </summary>
                  <div className="vf-ans-body">
                    {a.videoUrl
                      ? <video src={a.videoUrl} controls playsInline className="w-full rounded-md" style={{ aspectRatio: "16 / 9", background: "#0b130d" }} aria-label={`Video trả lời chủ đề ${a.topic}`} />
                      : <div className="vf-ph"><Film aria-hidden="true" />Tệp video của câu này chưa khả dụng.</div>}
                    <h3 className="mt-3 text-small font-semibold">Văn bản (chuyển giọng nói thành chữ)</h3>
                    <p className="vf-trans mt-1">{a.transcript || "Không có văn bản."}</p>
                    {a.note && <div className="vf-note"><b>AI nhận xét:</b> {a.note}</div>}
                  </div>
                </details>
              ))}
            </div>
          </Section>

          <Section icon={ListChecks} title="Thông tin buổi phỏng vấn">
            <dl className="grid gap-2 text-small">
              {[["Nộp bài", shortDateTime(d.submittedAt)], ["Lần phỏng vấn", d.attempt], ["Thời lượng", d.durationLabel], ["Video lưu đến", shortDate(d.keepUntil)]].map(([l, v]) => (
                <div key={l} className="flex flex-wrap justify-between gap-2 border-b border-border pb-2 last:border-0"><dt className="text-ink-muted">{l}</dt><dd className="font-medium">{v}</dd></div>
              ))}
            </dl>
          </Section>
        </div>

        <aside className="vf-detail-side" aria-label="Quyết định">
          <Card>
            <CardBody>
              <h2 className="text-[18px] font-bold">{decided ? "Quyết định đã ghi nhận" : "Quyết định cuối"}</h2>
              {decided ? (
                <div className="mt-3 grid gap-2 text-small">
                  <div><Badge tone={STATUS_TONE[d.status]}>{STATUS_TEXT[d.status]}</Badge></div>
                  {d.decision && <><div className="text-ink-muted">Lúc {shortDateTime(d.decision.decidedAt)}</div><div className="vf-note" style={{ marginTop: 0 }}>{d.decision.note || "Không có nhận xét."}</div></>}
                </div>
              ) : (
                <div className="mt-3 grid gap-4">
                  <div className="vf-decide" role="radiogroup" aria-label="Quyết định">
                    {DECISIONS.map((o) => (
                      <label key={o.id} className="vf-opt">
                        <input type="radio" name="decision" value={o.id} checked={decision === o.id} onChange={() => setDecision(o.id)} />
                        <span><b>{o.title}</b><br /><span className="text-small text-ink-muted">{o.desc}</span></span>
                      </label>
                    ))}
                  </div>
                  <Field label="Nhận xét gửi mentor" id="vf-note" required={needNote} hint={needNote ? "Bắt buộc, tối thiểu 10 ký tự, mentor sẽ đọc được." : "Không bắt buộc."}>
                    <Textarea id="vf-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
                  </Field>
                  <Checkbox checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} label={hasVideo ? "Tôi đã xem video và văn bản các câu trả lời" : "Tôi đã xem văn bản các câu trả lời"} />
                  <Button variant={decision === "REJECT" ? "danger" : "primary"} size="lg" block loading={busy} disabled={!reviewed || noteMissing} onClick={submit}>{opt.confirm}</Button>
                  <p className="text-small text-ink-subtle">Quyết định và việc bạn đã xem câu trả lời hay chưa được ghi vào nhật ký.</p>
                </div>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-small text-ink-muted"><b>Nhãn &quot;Mentor mới&quot;:</b> mentor vừa được duyệt có nhãn 30 ngày, mentee thấy rõ họ chưa có đánh giá. Vi phạm sau đó đi theo hệ thống strike. <Link href="/admin/audit">Xem nhật ký</Link></p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
