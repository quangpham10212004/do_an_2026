"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FileText, Upload } from "lucide-react";
import { Alert, Button, Checkbox, Input, Loading } from "@/components/ui";
import { DOMAINS, domainLabel } from "@/features/profile/api";
import { errorMessage } from "@/lib/api";
import type { Uuid } from "@/types";
import { MAX_MENTOR_DOMAINS } from "@/types";
import { DOMAIN_BLURB, VERIFY_PARTS, domainsApi, interviewHref, type DomainCv } from "./api";
import { useMentorDomains } from "./DomainManager";

const MAX_CV_BYTES = 5 * 1024 * 1024;
const STEP_KEY = "mmp.domains.add.step";
const STEPS = ["Chọn lĩnh vực", "CV mới", "Xác nhận", "Quy trình", "Bắt đầu"];

function readSaved(): { step: number; domain: string; source: "reuse" | "new" } {
  try {
    const raw = window.sessionStorage.getItem(STEP_KEY);
    if (raw) return { step: 0, domain: "", source: "new", ...JSON.parse(raw) };
  } catch { /* bỏ qua */ }
  return { step: 0, domain: "", source: "new" };
}

/** Trang 5 bước thêm lĩnh vực. CV (tệp) không lưu được qua sessionStorage nên chỉ nhớ bước, lĩnh vực và nguồn CV. */
export default function AddDomainFlow({ mentorId }: { mentorId: Uuid }) {
  const router = useRouter();
  const fileId = useId();
  const { data, error: loadError, reload } = useMentorDomains(mentorId);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [domain, setDomain] = useState("");
  const [source, setSource] = useState<"reuse" | "new">("new");
  const [cv, setCv] = useState<File | null>(null);
  const [cvs, setCvs] = useState<DomainCv[]>([]);
  const [query, setQuery] = useState("");
  const [consent, setConsent] = useState(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suggest, setSuggest] = useState<string | null>(null);
  const [suggested, setSuggested] = useState(false);
  const head = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const s = readSaved();
    setStep(s.step); setDomain(s.domain); setSource(s.source); setReady(true);
    domainsApi.cvs(mentorId).then(setCvs).catch(() => setCvs([]));
  }, [mentorId]);

  useEffect(() => {
    if (!ready) return;
    try { window.sessionStorage.setItem(STEP_KEY, JSON.stringify({ step, domain, source })); } catch { /* bỏ qua */ }
    head.current?.focus();
  }, [ready, step, domain, source]);

  const existing = useMemo(() => data?.domains.map((d) => d.domain) ?? [], [data]);
  const max = data?.max || MAX_MENTOR_DOMAINS;
  const full = existing.length >= max;
  const shown = DOMAINS.filter(([v, l]) => (v + l).toLowerCase().includes(query.trim().toLowerCase()));
  const name = domainLabel(domain);
  const existingCv = cvs[0];

  if (!ready || data === undefined) return <Loading />;
  if (!data) return <Alert title="Không tải được danh sách lĩnh vực" action={<Button onClick={reload}>Thử lại</Button>}>{loadError}</Alert>;
  if (full) return <Alert tone="info" title={`Bạn đã đạt tối đa ${max} lĩnh vực`}>Gỡ một lĩnh vực ở <Link href="/profile/domains" className="underline">trang quản lý</Link> để thêm lĩnh vực khác.</Alert>;

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (!/\.(pdf|docx)$/i.test(file.name)) return setError("CV phải là PDF hoặc DOCX.");
    if (file.size > MAX_CV_BYTES) return setError("CV tối đa 5 MB.");
    setError(""); setCv(file); setSource("new");
  }

  function go(n: number) { setError(""); setStep(n); }

  async function start() {
    setBusy(true); setError("");
    try {
      await domainsApi.add(mentorId, { domain, cv: source === "new" ? cv : null });
      try { window.sessionStorage.removeItem(STEP_KEY); } catch { /* bỏ qua */ }
      router.push(interviewHref(domain));
    } catch (e) {
      setError(errorMessage(e)); setBusy(false);
    }
  }

  async function sendSuggest() {
    if (!suggest?.trim()) return;
    try { await domainsApi.suggest(suggest.trim()); setSuggested(true); setSuggest(null); } catch (e) { setError(errorMessage(e)); }
  }

  const cvLabel = source === "reuse" ? (existingCv?.name ?? "CV hiện tại") : cv ? cv.name : "Chưa tải CV mới";
  const canNext2 = source === "reuse" || !!cv;

  return (
    <div className="da-wrap">
      <ol className="flow-steps" aria-label="Các bước thêm lĩnh vực">
        {STEPS.map((s, i) => {
          const state = i < step ? "done" : i === step ? "current" : "todo";
          return (
            <li key={s} data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <span className="flow-dot">{state === "done" ? <Check aria-hidden="true" /> : i + 1}</span>
              <span className="flow-label">{s}</span>
            </li>
          );
        })}
      </ol>

      <div className="da-eyebrow">Bước {step + 1} · {STEPS[step]}{step > 0 && domain ? ` · ${name}` : ""}</div>
      <h2 ref={head} tabIndex={-1} className="sr-only">Bước {step + 1}: {STEPS[step]}</h2>
      <p className="text-small text-ink-muted" style={{ marginTop: 6 }}>
        Lĩnh vực mới đi qua một buổi phỏng vấn AI riêng. Các lĩnh vực hiện tại vẫn hoạt động bình thường trong lúc chờ.
      </p>
      <div style={{ height: 16 }} />
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}

      {step === 0 && (
        <div className="da-card">
          <Input aria-label="Tìm lĩnh vực" placeholder="Tìm lĩnh vực" value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 360 }} />
          <div role="radiogroup" aria-label="Lĩnh vực" className="da-grid">
            {shown.map(([v, l]) => {
              const has = existing.includes(v);
              return has ? (
                <div key={v} className="da-opt" data-disabled="true">
                  <b>{l}</b><span className="da-tag"><Check size={12} aria-hidden="true" /> Bạn đã có</span>
                </div>
              ) : (
                <label key={v} className="da-opt">
                  <input type="radio" name="dom" value={v} checked={domain === v} onChange={() => setDomain(v)} />
                  <b>{l}</b><small>{DOMAIN_BLURB[v]}</small>
                  {domain === v && <span className="da-tag">Đã chọn</span>}
                </label>
              );
            })}
          </div>
          {shown.length === 0 && <p className="text-small text-ink-muted">Không có lĩnh vực khớp “{query}”.</p>}
          <div className="text-small text-ink-muted">
            Không thấy lĩnh vực của bạn?{" "}
            {suggested ? <b>Đã nhận đề xuất, cảm ơn bạn.</b> : suggest === null
              ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSuggest("")}>Đề xuất lĩnh vực mới</button>
              : (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Input aria-label="Tên lĩnh vực đề xuất" value={suggest} onChange={(e) => setSuggest(e.target.value)} style={{ maxWidth: 220 }} />
                  <Button size="sm" variant="primary" onClick={sendSuggest} disabled={!suggest.trim()}>Gửi</Button>
                </span>
              )}
          </div>
          {domain && (
            <div className="da-box">
              <b>Những gì cần làm cho {name}</b>
              <span>• CV tập trung vào lĩnh vực này</span>
              <span>• Phỏng vấn AI trực tiếp tối đa {VERIFY_PARTS.minutes} phút, trả lời bằng giọng nói và quay video</span>
              <span>• AI chấm điểm; chưa rõ ràng thì quản trị viên xem xét</span>
            </div>
          )}
          <div className="da-nav" style={{ justifyContent: "flex-end" }}>
            <Button variant="primary" disabled={!domain} onClick={() => go(1)}>Tiếp tục</Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="da-two">
          <div className="da-card">
            <div role="radiogroup" aria-label="Nguồn CV" className="dom-pick">
              <label>
                <input type="radio" name="cv" checked={source === "reuse"} onChange={() => setSource("reuse")} />
                <span><b>Dùng lại CV hiện tại</b><br /><small className="text-ink-muted">{existingCv?.name ?? "CV đã có"} · AI đọc lại theo lĩnh vực {name}</small></span>
              </label>
              <label>
                <input type="radio" name="cv" checked={source === "new"} onChange={() => setSource("new")} />
                <span><b>Tải CV mới tập trung vào {name}</b> <span className="badge badge-accent">Khuyên dùng</span><br /><small className="text-ink-muted">Giúp AI đặt câu hỏi phỏng vấn sát với kinh nghiệm của bạn</small></span>
              </label>
            </div>
            {source === "new" && (
              <div className="da-drop" data-over={over}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); pickFile(e.dataTransfer.files?.[0]); }}>
                <b>{cv ? cv.name : "Kéo thả CV mới vào đây"}</b>
                <span className="text-small text-ink-muted">PDF hoặc DOCX, tối đa 5 MB</span>
                <label htmlFor={fileId} className="btn btn-primary" style={{ marginTop: 8 }}><Upload aria-hidden="true" />{cv ? "Đổi tệp" : "Chọn tệp từ máy"}</label>
                <input id={fileId} type="file" accept=".pdf,.docx,application/pdf" className="sr-only" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
            )}
            <div className="da-box da-box-warn">
              <span><b>CV hiện tại</b> có thể chưa nêu đủ kỹ năng của {name}. Nên tải CV mới nếu bạn có thêm kinh nghiệm ở lĩnh vực này.</span>
            </div>
            <div className="da-nav">
              <Button onClick={() => go(0)}>Quay lại</Button>
              <Button variant="primary" disabled={!canNext2} onClick={() => go(2)}>Tiếp tục</Button>
            </div>
          </div>
          <div className="da-card">
            <h2 className="text-h3">CV đã có của bạn</h2>
            {cvs.map((c) => (
              <div key={c.name} className="da-file">
                <span className="pf-ico" aria-hidden="true"><FileText /></span>
                <div className="min-w-0 flex-1"><b>{c.name}</b><div className="text-small text-ink-muted">{domainLabel(c.domain)} · {c.note}</div></div>
              </div>
            ))}
            <p className="text-small text-ink-muted">Mỗi lĩnh vực giữ CV riêng. CV mới không thay CV hiện có và không ảnh hưởng việc bạn đang dạy.</p>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="da-card">
          <h2 className="text-h3">Xác nhận thông tin</h2>
          <dl className="da-summary">
            <div><dt>Lĩnh vực</dt><dd>{name}</dd></div>
            <div><dt>CV dùng để xác thực</dt><dd>{cvLabel}</dd></div>
            <div><dt>Lĩnh vực hiện có</dt><dd>{existing.map(domainLabel).join(", ") || "Chưa có"}</dd></div>
            <div><dt>Số lĩnh vực sau khi thêm</dt><dd>{existing.length + 1} / {max}</dd></div>
          </dl>
          <div className="da-nav">
            <Button onClick={() => go(1)}>Quay lại</Button>
            <Button variant="primary" onClick={() => go(3)}>Xác nhận và tiếp tục</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="da-two">
          <div className="da-card">
            <h2 className="text-h3">Buổi phỏng vấn {name}</h2>
            <div className="da-nums">
              <div><b>{VERIFY_PARTS.topics}</b><span>chủ đề</span></div>
              <div><b>{VERIFY_PARTS.minutes}&apos;</b><span>tối đa</span></div>
              <div><b>{VERIFY_PARTS.passScore}</b><span>điểm đạt / 5</span></div>
            </div>
            <ol className="da-timeline">
              <li><span><b>Phỏng vấn AI trực tiếp</b><small>AI hỏi theo từng chủ đề, bạn trả lời bằng giọng nói và quay video. Bị gián đoạn thì tiếp tục được trong 24 giờ.</small></span></li>
              <li><span><b>AI chấm điểm</b><small>Đạt thì tự cấp xác thực, không đạt thì báo điểm cần cải thiện và ngày được phỏng vấn lại.</small></span></li>
              <li><span><b>Admin xem xét</b><small>Chỉ khi AI chưa kết luận chắc chắn, thường 1–3 ngày làm việc.</small></span></li>
            </ol>
            <div className="da-nav">
              <Button onClick={() => go(2)}>Quay lại</Button>
              <Button variant="primary" onClick={() => go(4)}>Tiếp tục</Button>
            </div>
          </div>
          <div className="grid gap-4">
            <div className="da-card">
              <h2 className="text-h3">Khi được duyệt</h2>
              <div className="da-box">
                <span>• Nhãn <b>{name}</b> hiện trên hồ sơ công khai, kèm nhãn “mới” 30 ngày.</span>
                <span>• Bạn xuất hiện trong gợi ý cho mentee quan tâm {name}.</span>
                <span>• Đặt mức phí và lịch rảnh riêng cho lĩnh vực này.</span>
              </div>
            </div>
            <div className="da-box da-box-danger"><span><b>Khi không được duyệt:</b> chỉ lĩnh vực này bị từ chối, bạn phỏng vấn lại sau 7 ngày. Các lĩnh vực khác không bị ảnh hưởng.</span></div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="da-card">
          <h2 className="text-h3">Sẵn sàng bắt đầu {name}</h2>
          <p className="text-small text-ink-muted">Bạn sẽ chuyển sang phòng phỏng vấn AI trực tiếp. Hãy chuẩn bị micro và camera, ngồi nơi yên tĩnh.</p>
          <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} label="Tôi đồng ý ghi hình, lưu trữ và phân tích buổi phỏng vấn của lĩnh vực này." />
          <div className="da-nav">
            <Button onClick={() => go(3)} disabled={busy}>Quay lại</Button>
            <Button variant="primary" loading={busy} disabled={!consent} onClick={start}>Chuyển tới phỏng vấn</Button>
          </div>
        </div>
      )}
    </div>
  );
}
