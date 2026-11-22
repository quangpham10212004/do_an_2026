"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Check, Clock, History, Sparkles } from "lucide-react";
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, Loading, Progress } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { domainLabel } from "@/features/profile/api";
import type { VerifyHistoryItem, VerifyHistoryOutcome, VerifyResult } from "@/types/verification";
import { verifyApi } from "./api";
import { daysUntil, fmtScore, shortDate, shortDateTime } from "./utils";

const OUTCOME_LABEL: Record<VerifyHistoryOutcome, string> = {
  PASSED: "Đạt",
  FAILED: "Không đạt",
  UNCLEAR: "Chờ xem xét",
  INCOMPLETE: "Không hoàn thành",
};
const OUTCOME_TONE: Record<VerifyHistoryOutcome, "success" | "danger" | "warning" | "neutral"> = {
  PASSED: "success",
  FAILED: "danger",
  UNCLEAR: "warning",
  INCOMPLETE: "neutral",
};

/** Mức điểm thang 5 -> nhãn ngắn. */
const band = (score: number) => (score >= 4 ? "Tốt" : score >= 3.5 ? "Đạt" : score >= 3 ? "Gần đạt" : "Cần cải thiện");

function ScoreRing({ score, pass }: { score: number; pass: number }) {
  const pct = Math.max(0, Math.min(100, (score / 5) * 100));
  const ok = score >= pass;
  return (
    <div className="vf-ring" data-ok={ok} style={{ ["--p" as string]: `${pct}%` }} role="img" aria-label={`Điểm tổng ${fmtScore(score)} trên 5, điểm đạt ${fmtScore(pass)}`}>
      <div className="vf-ring-in"><b>{fmtScore(score)}</b><span>/ 5</span></div>
    </div>
  );
}

function Banner({ r }: { r: VerifyResult }) {
  if (r.outcome === "PASSED") {
    return (
      <div className="vf-lead">
        <span className="vf-badge" data-tone="accent"><Check aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2>Bạn đã đạt và được xác thực lĩnh vực {domainLabel(r.domain)}</h2>
          <div className="text-small text-ink-muted mt-0.5">
            {r.decidedBy === "ADMIN" ? "Quản trị viên đã duyệt." : "Hệ thống chấm tự động."} Hồ sơ của bạn đã vào danh sách gợi ý cho mentee.
          </div>
        </div>
      </div>
    );
  }
  if (r.outcome === "FAILED") {
    return (
      <div className="vf-lead">
        <span className="vf-badge" data-tone="danger"><Ban aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2>Lần phỏng vấn này chưa đạt</h2>
          <div className="text-small text-ink-muted mt-0.5">Điểm đạt là {fmtScore(r.passScore)} / 5. Xem các điểm cần cải thiện bên dưới.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="vf-lead">
      <span className="vf-badge" data-tone="warning"><Clock aria-hidden="true" /></span>
      <div className="min-w-0">
        <h2>Kết quả đang chờ quản trị viên xem xét</h2>
        <div className="text-small text-ink-muted mt-0.5">AI chưa thể kết luận chắc chắn. Điểm dưới đây là điểm tạm tính, bạn sẽ nhận thông báo khi có quyết định.</div>
      </div>
    </div>
  );
}

function ResultCard({ r }: { r: VerifyResult }) {
  const retryOpen = !r.retryAt || new Date(r.retryAt).getTime() <= Date.now();
  return (
    <div className="grid gap-4">
      <div className="vf-card" data-tone={r.outcome === "PASSED" ? "accent" : r.outcome === "FAILED" ? "danger" : "soft-warning"}>
        <Banner r={r} />
        <div className="vf-result-top">
          <ScoreRing score={r.totalScore} pass={r.passScore} />
          <div className="min-w-0">
            <div className="vf-eyebrow">Điểm tổng</div>
            <div className="text-title-2 font-bold tabular">{fmtScore(r.totalScore)} / 5 <span className="text-small font-normal text-ink-muted">· {band(r.totalScore)}</span></div>
            <p className="mt-1.5 text-small leading-relaxed text-ink-muted">{r.summary}</p>
            <div className="mt-1.5 text-small text-ink-subtle">Lĩnh vực {domainLabel(r.domain)} · nộp lúc {shortDateTime(r.submittedAt)}</div>
          </div>
        </div>
        {r.adminNote && <div className="vf-note"><b>Nhận xét của quản trị viên:</b> {r.adminNote}</div>}
      </div>

      <Card>
        <CardHeader title="Điểm từng tiêu chí" description="Thang 5, điểm đạt tính trên điểm trung bình các tiêu chí" />
        <CardBody>
          <ul className="vf-criteria">
            {r.criteria.map((c) => (
              <li key={c.key}>
                <div className="vf-bar-head"><span>{c.label}</span><b className="tabular">{fmtScore(c.score)} / 5</b></div>
                <Progress value={(c.score / 5) * 100} label={c.label} />
                <p className="mt-1.5 text-small text-ink-muted">{c.comment}</p>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {r.outcome === "FAILED" && (
        <Card>
          <CardHeader title="Điểm cần cải thiện" />
          <CardBody>
            {r.improvements.length > 0 ? (
              <ul className="vf-list" style={{ marginTop: 0 }}>{r.improvements.map((t) => <li key={t}>{t}</li>)}</ul>
            ) : <p className="text-small text-ink-muted">Chưa có gợi ý cụ thể.</p>}
            <div className="vf-note">
              {retryOpen ? "Bạn có thể phỏng vấn lại ngay bây giờ." : <>Bạn được phỏng vấn lại sau <b>{daysUntil(r.retryAt)} ngày</b> (từ {shortDate(r.retryAt)}).</>}
            </div>
          </CardBody>
        </Card>
      )}

      <div className="flex flex-wrap gap-2.5">
        <ButtonLink href="/interview" size="lg" variant={r.outcome === "PASSED" ? "secondary" : "primary"}>Về trang xác thực</ButtonLink>
        {r.outcome === "PASSED" && <ButtonLink href="/profile" size="lg" variant="primary" icon={Sparkles}>Thiết lập lịch rảnh và mức phí</ButtonLink>}
        {r.outcome === "FAILED" && !retryOpen && <Button size="lg" disabled>Phỏng vấn lại · mở ngày {shortDate(r.retryAt)}</Button>}
      </div>
    </div>
  );
}

function HistoryList({ items, activeId }: { items: VerifyHistoryItem[]; activeId: string }) {
  if (items.length === 0) return <EmptyState icon={History} title="Chưa có lần phỏng vấn nào">Các lần phỏng vấn của bạn sẽ hiện ở đây.</EmptyState>;
  return (
    <ul className="vf-history" aria-label="Lịch sử các lần phỏng vấn">
      {items.map((h) => {
        const inner = (
          <>
            <div className="min-w-0">
              <div className="font-semibold">{domainLabel(h.domain)}</div>
              <div className="text-small text-ink-muted">{shortDateTime(h.at)}</div>
            </div>
            <div className="vf-history-right">
              {h.totalScore != null && <b className="tabular">{fmtScore(h.totalScore)}</b>}
              <Badge tone={OUTCOME_TONE[h.outcome]}>{OUTCOME_LABEL[h.outcome]}</Badge>
            </div>
          </>
        );
        return (
          <li key={h.id} data-active={h.id === activeId}>
            {h.outcome === "INCOMPLETE"
              ? <div className="vf-history-row" aria-disabled="true">{inner}</div>
              : <Link href={`/interview/result?id=${encodeURIComponent(h.id)}`} className="vf-history-row" aria-current={h.id === activeId ? "true" : undefined}>{inner}</Link>}
          </li>
        );
      })}
    </ul>
  );
}

export default function ResultView() {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null | undefined>(undefined);
  const [history, setHistory] = useState<VerifyHistoryItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { setId(new URLSearchParams(window.location.search).get("id") ?? ""); }, []);

  const load = useCallback(async (rid: string) => {
    setError("");
    try {
      const [h, r] = await Promise.all([
        verifyApi.history().catch(() => [] as VerifyHistoryItem[]),
        rid ? verifyApi.result(rid) : Promise.resolve(null),
      ]);
      setHistory(h);
      if (r) { setResult(r); return; }
      // không có id: mở kết quả gần nhất (nếu có)
      const latest = h.find((x) => x.outcome !== "INCOMPLETE");
      if (latest) { router.replace(`/interview/result?id=${encodeURIComponent(latest.id)}`); setId(latest.id); } else setResult(null);
    } catch (e) { setError(errorMessage(e)); setResult(null); }
  }, [router]);

  useEffect(() => { if (id !== null) void load(id); }, [id, load]);

  if (id === null || result === undefined) return <Loading />;

  return (
    <div className="vf-wrap">
      <header className="page-header">
        <div className="min-w-0">
          <h1>Kết quả phỏng vấn</h1>
          <p className="page-header-desc max-w-[740px]">Điểm từng tiêu chí, nhận xét của AI và lịch sử các lần phỏng vấn của bạn.</p>
        </div>
        <div className="page-header-actions"><ButtonLink href="/interview" size="sm">Về trang xác thực</ButtonLink></div>
      </header>
      <Alert>{error}</Alert>
      <div className="vf-result-grid">
        <div className="min-w-0">
          {result
            ? <ResultCard r={result} />
            : <Card><CardBody><EmptyState icon={History} title="Chưa có kết quả" action={<ButtonLink href="/interview" variant="primary" size="sm">Bắt đầu phỏng vấn</ButtonLink>}>Bạn chưa hoàn thành buổi phỏng vấn nào.</EmptyState></CardBody></Card>}
        </div>
        <aside className="min-w-0">
          <Card>
            <CardHeader title="Lịch sử phỏng vấn" description="Các lần bạn đã phỏng vấn" />
            <CardBody>{history ? <HistoryList items={history} activeId={result?.id ?? ""} /> : <Loading />}</CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
