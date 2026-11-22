import type { PipelineWeights } from "@/types";

const pct = (x: number) => Math.round(x * 100);

export const PART_META: { key: keyof PipelineWeights; label: string }[] = [
  { key: "similarity", label: "Tương đồng hồ sơ" },
  { key: "transition", label: "Từng chuyển ngách" },
  { key: "rating", label: "Đánh giá" },
  { key: "experience", label: "Kinh nghiệm" },
  { key: "scheduleFit", label: "Khớp lịch" },
  { key: "responsiveness", label: "Phản hồi nhanh" },
];

interface Scored {
  finalScore: number;
  newMentor: boolean;
  scoreParts: Partial<Record<keyof PipelineWeights, number>>;
}

/** US-35 — các phần điểm do matching-service trả về (scoreParts), cộng lại đúng bằng finalScore. Bỏ phần không áp dụng (vd. transition ở chế độ thường). */
function scoreParts(m: Scored) {
  return PART_META
    .filter((p) => p.key !== "transition" || (m.scoreParts?.transition ?? 0) > 0)
    .map((p) => ({
      ...p,
      label: p.key === "rating" && m.newMentor ? "Đánh giá (trung vị nền tảng)" : p.label,
      value: m.scoreParts?.[p.key] ?? 0,
    }));
}

export default function ScoreBreakdown({ m }: { m: Scored }) {
  const parts = scoreParts(m);
  const summary = parts.map((p) => `${p.label} ${pct(p.value)}`).join(", ");
  return (
    <div className="flex flex-col gap-2">
      <div className="meter" role="img" aria-label={`Điểm phù hợp ${pct(m.finalScore)}%: ${summary}`}>
        {parts.map((p) => <span key={p.key} style={{ width: `${p.value * 100}%` }} />)}
      </div>
      <div className="legend">
        {parts.map((p) => (
          <span key={p.key}><i />{p.label} <span className="tabular">+{pct(p.value)}</span></span>
        ))}
      </div>
      <p className="text-[12px] text-ink-subtle">Điểm AI gồm {parts.length} thành phần; thiết kế rút gọn còn 4 tiêu chí (Kỹ năng, Mục tiêu, Lịch rảnh, Ngân sách) khi backend trả điểm theo nhóm đó.</p>
    </div>
  );
}
