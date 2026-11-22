import { Check } from "lucide-react";
import type { VerifyStage } from "@/types/verification";
import { VERIFY_STEPS, currentStep } from "./utils";

/** Thanh 3 bước của luồng xác thực năng lực, dùng lớp flow-steps có sẵn. */
export function VerifySteps({ stage }: { stage: VerifyStage }) {
  const cur = currentStep(stage);
  return (
    <ol className="flow-steps" style={{ margin: 0 }} aria-label="Các bước xác thực">
      {VERIFY_STEPS.map((s, i) => {
        const n = i + 1;
        const state = n < cur ? "done" : n === cur ? "current" : "todo";
        return (
          <li key={s.title} data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className="flow-dot">{state === "done" ? <Check aria-hidden="true" /> : n}</span>
            <span className="flow-label">
              <span className="block">{s.title}</span>
              <span className="block text-small font-normal text-ink-subtle">{s.desc}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
