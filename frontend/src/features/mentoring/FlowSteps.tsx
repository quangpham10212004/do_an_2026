import { Check } from "lucide-react";

const STEPS = ["Gửi yêu cầu", "Mentor chấp nhận", "Đặt lịch", "Thanh toán", "Hoàn tất"];

/** Thanh 5 bước của luồng kết nối: step là chỉ số (0–4) của bước đang làm. */
export default function FlowSteps({ step }: { step: 0 | 1 | 2 | 3 | 4 }) {
  return (
    <ol className="flow-steps" aria-label="Các bước kết nối mentor">
      {STEPS.map((label, i) => (
        <li key={label} data-state={i < step ? "done" : i === step ? "current" : "todo"} aria-current={i === step ? "step" : undefined}>
          <span className="flow-dot">{i < step ? <Check aria-hidden="true" /> : i + 1}</span>
          <span className="flow-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}
