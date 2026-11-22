"use client";

import { Check, Database, Filter, ListOrdered, MessageSquareText, Network } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button, Card, Spinner } from "@/components/ui";
import { EXCLUSION_LABELS } from "@/features/matching/api";
import type { ExclusionReason, MatchResult, PipelineWeights } from "@/types";

/** Thời gian mỗi bước hiện ra để người xem kịp đọc (số liệu bên trong là thật, chỉ nhịp hiển thị được giãn). */
const STEP_MS = 800;

const WEIGHT_LABELS: Record<keyof PipelineWeights, string> = {
  similarity: "Tương đồng",
  transition: "Từng chuyển ngách",
  rating: "Đánh giá",
  experience: "Kinh nghiệm",
  scheduleFit: "Khớp lịch",
  responsiveness: "Phản hồi",
};

const pct = (x: number) => Math.round(x * 100);
const ms = (x: number) => `${x < 10 ? x.toFixed(1) : Math.round(x)} ms`;

interface Step {
  title: string;
  hint: string;
  icon: typeof Filter;
  ms?: number;
  detail: (r: MatchResult) => ReactNode;
}

function buildSteps(r: MatchResult | undefined): Step[] {
  const p = r?.pipeline;
  const s = p?.stages;
  return [
    {
      title: "Mã hoá hồ sơ thành vector",
      hint: "Hồ sơ của bạn → embedding",
      icon: Network,
      detail: (res) => res.intent?.mode === "SWITCH" && s?.retrieve.queryText ? (
        <>Chuyển ngách: truy vấn dựng từ <b>mục tiêu mới + kỹ năng nền hiện có</b> của bạn — “{s.retrieve.queryText}” — được mã hoá bằng{" "}
          <b>{s.retrieve.model}</b> thành vector <b>{s.retrieve.dim} chiều</b>.</>
      ) : (
        <>Hồ sơ (lĩnh vực, kỹ năng, mục tiêu) được mã hoá bằng <b>{s?.retrieve.model ?? "mô hình embedding"}</b> thành vector{" "}
          <b>{s?.retrieve.dim ?? 384} chiều</b>. Mỗi mentor đã có vector tương tự, lập sẵn từ hồ sơ.</>
      ),
    },
    {
      title: "Lọc cứng điều kiện",
      hint: "Loại mentor không đủ điều kiện",
      icon: Filter,
      ms: s?.filter.ms,
      detail: (res) => {
        const ex = Object.entries(res.pipeline.excluded) as [ExclusionReason, number][];
        return (
          <>Xét <b>{res.pipeline.considered}</b> mentor → còn <b>{res.pipeline.eligible}</b> thoả điều kiện
            {ex.length > 0 && <> (loại: {ex.map(([k, v]) => `${v} ${EXCLUSION_LABELS[k] || k}`).join(", ")})</>}
            . Lọc trước khi xếp hạng để mentor hợp lệ không bị bỏ sót.</>
        );
      },
    },
    {
      title: "Tìm theo độ tương đồng vector",
      hint: "pgvector · cosine · HNSW",
      icon: Database,
      ms: s?.retrieve.ms,
      detail: (res) => (
        <>Lấy <b>{res.pipeline.retrieved}</b> mentor gần nhất về nội dung (top-K = {res.pipeline.k}).
          {s && s.retrieve.nearest.length > 0 && (
            <> Gần nhất: {s.retrieve.nearest.map((n) => `${n.displayName} (${pct(n.similarity)}%)`).join(", ")}.</>
          )}</>
      ),
    },
    {
      title: "Xếp hạng lại nhiều tín hiệu",
      hint: "Điểm = Σ trọng số × tín hiệu",
      icon: ListOrdered,
      ms: s?.rerank.ms,
      detail: (res) => (
        <>
          Kết hợp {Object.values(res.pipeline.weights).filter((w) => w > 0).length} tín hiệu:{" "}
          {(Object.keys(WEIGHT_LABELS) as (keyof PipelineWeights)[])
            .filter((k) => (res.pipeline.weights[k] ?? 0) > 0)
            .map((k) => `${WEIGHT_LABELS[k]} ${pct(res.pipeline.weights[k] ?? 0)}%`)
            .join(" · ")}
          .
          {s && s.rerank.top.length > 0 && <> Dẫn đầu: <b>{s.rerank.top[0].displayName}</b> ({pct(s.rerank.top[0].finalScore)} điểm).</>}
        </>
      ),
    },
    {
      title: "Giải thích kết quả",
      hint: "Không phải hộp đen",
      icon: MessageSquareText,
      ms: s?.explain.ms,
      detail: (res) => (
        <>Sinh lý do cho từng mentor{s ? ` (${s.explain.reasons} lý do)` : ""} từ kỹ năng trùng, mục tiêu, đánh giá, lịch rảnh.
          Trả <b>{res.pipeline.returned}</b> mentor trong <b>{ms(res.pipeline.tookMs)}</b>.</>
      ),
    },
  ];
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Trình bày pipeline AI Matching. mode "live": các bước chạy lần lượt trong lúc chờ rồi gọi onDone(result);
 * mode "static": hiện đủ 5 bước (xem lại sau khi có kết quả).
 */
export default function PipelineRun({ result, mode, onDone, onReplay }: {
  result?: MatchResult;
  mode: "live" | "static";
  onDone?: (result: MatchResult) => void;
  onReplay?: () => void;
}) {
  const steps = buildSteps(result);
  const [shown, setShown] = useState(mode === "static" ? steps.length : 0);

  useEffect(() => {
    if (mode === "static" || !result) return;
    const delay = prefersReducedMotion() ? 0 : STEP_MS;
    const t = setTimeout(() => (shown < steps.length ? setShown(shown + 1) : onDone?.(result)), delay);
    return () => clearTimeout(t);
  }, [mode, result, shown, steps.length, onDone]);

  return (
    <Card>
      <div className="pipeline" aria-live="polite">
        <div className="pipeline-head">
          <h2 className="text-title-3 font-semibold">{mode === "live" ? "AI đang tìm mentor phù hợp…" : "Cách AI chọn mentor cho bạn"}</h2>
          {mode === "live" && result && <Button size="sm" variant="ghost" onClick={() => onDone?.(result)}>Bỏ qua</Button>}
          {mode === "static" && onReplay && <Button size="sm" variant="ghost" onClick={onReplay}>Chạy lại hiệu ứng</Button>}
        </div>
        <ol className="pipeline-steps">
          {steps.map((step, i) => {
            const done = !!result && i < shown;
            const active = mode === "live" && i === shown;
            const Icon = step.icon;
            return (
              <li key={step.title} className="pipeline-step" data-state={done ? "done" : active ? "active" : "idle"}>
                <span className="pipeline-mark" aria-hidden="true">
                  {done ? <Check /> : active ? <Spinner /> : <Icon />}
                </span>
                <div className="pipeline-body">
                  <div className="pipeline-title">
                    <span>{i + 1}. {step.title}</span>
                    {done && step.ms !== undefined && <span className="pipeline-ms tabular">{ms(step.ms)}</span>}
                  </div>
                  <div className="text-small text-ink-muted">{step.hint}</div>
                  {done && result && <p className="pipeline-detail">{step.detail(result)}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}

/** Dải tóm tắt "AI đã làm gì" ngay trên danh sách kết quả; chi tiết từng bước nằm ở phần mở rộng cuối trang. */
export function PipelineStrip({ result }: { result: MatchResult }) {
  const p = result.pipeline;
  const sec = (p.tookMs / 1000).toFixed(1).replace(".", ",");
  const steps = ["Đọc hồ sơ và CV", `So khớp ${p.considered} mentor`, "Kiểm tra lịch rảnh", "Xếp hạng và giải thích"];
  return (
    <section className="pipe-strip" aria-label="AI đã làm gì">
      <b>AI đã xử lý trong {sec} giây</b>
      {steps.map((t) => <span key={t}><Check aria-hidden="true" />{t}</span>)}
    </section>
  );
}
