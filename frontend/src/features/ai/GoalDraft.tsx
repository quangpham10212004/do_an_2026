"use client";

import { useState } from "react";
import { Check, Plus, Sparkles } from "lucide-react";
import { Alert, Button, ButtonLink, Chip, Chips, Field, Textarea, useDialog } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import { errorMessage } from "@/lib/api";
import type { Conversation } from "@/types";

const MIN_GOAL = 10;
const MAX_GOAL = 3000;

interface GoalDraftProps {
  conversation: Conversation;
  onChange: (conversation: Conversation) => void;
}

/**
 * US-21 (PRD-CV-4) — goal do chatbot tổng hợp là bản nháp có thể sửa: "Dùng mục tiêu này" / "Sửa" / "Bỏ qua".
 * Hồ sơ chỉ thay đổi khi người dùng bấm "Dùng mục tiêu này".
 */
export default function GoalDraft({ conversation, onChange }: GoalDraftProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(conversation.enrichedGoal ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dialog, ask] = useDialog();
  // US-45 (PRD-CV-5) — kỹ năng gợi ý từ CV, mặc định chọn hết; bấm chip để bỏ chọn
  const suggested = conversation.suggestedSkills ?? [];
  const [chosen, setChosen] = useState<string[]>(suggested);
  const toggle = (s: string) => setChosen((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const trimmed = text.trim();
  const valid = trimmed.length >= MIN_GOAL && trimmed.length <= MAX_GOAL;

  async function run(action: () => Promise<Conversation>) {
    setBusy(true);
    setError("");
    try {
      onChange(await action());
      setEditing(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    const ok = await ask({
      title: "Bỏ qua mục tiêu này?",
      message: "Hồ sơ của bạn giữ nguyên mục tiêu hiện tại. Muốn làm lại, hãy tải CV mới.",
      confirmText: "Bỏ qua",
    });
    if (ok) await run(() => aiApi.discardGoal(conversation.id));
  }

  if (conversation.goalStatus === "CONFIRMED") {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">
          {conversation.profileSynced
            ? "Đã dùng mục tiêu này cho hồ sơ (kèm kỹ năng bạn đã chọn). Gợi ý mentor được cập nhật ngay sau đó."
            : "Đã ghi nhận mục tiêu, đang đồng bộ vào hồ sơ. Hệ thống tự thử lại nếu dịch vụ hồ sơ tạm lỗi."}
        </Alert>
        <div className="well flex flex-col gap-2">
          <div className="eyebrow">Mục tiêu đã dùng</div>
          <p className="whitespace-pre-wrap">{conversation.confirmedGoal}</p>
          {(conversation.addedSkills ?? []).length > 0 && (
            <Chips>{conversation.addedSkills.map((s) => <Chip key={s}>{s}</Chip>)}</Chips>
          )}
        </div>
        <div><ButtonLink href="/matching" variant="primary" icon={Sparkles}>Tìm mentor phù hợp</ButtonLink></div>
      </div>
    );
  }

  if (conversation.goalStatus === "DISCARDED") {
    return <Alert tone="info">Bạn đã bỏ qua mục tiêu này, hồ sơ không thay đổi. Tải CV mới nếu muốn làm lại.</Alert>;
  }

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      <Alert tone="info">Đây là bản nháp. Hồ sơ của bạn chưa thay đổi cho tới khi bạn chọn “Dùng mục tiêu này”.</Alert>
      <Alert>{error}</Alert>
      {editing ? (
        <Field label="Mục tiêu đã làm rõ" id="goal-text"
          error={trimmed.length < MIN_GOAL ? `Tối thiểu ${MIN_GOAL} ký tự.` : undefined}
          hint={`${trimmed.length}/${MAX_GOAL} ký tự`}>
          <Textarea id="goal-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_GOAL} disabled={busy} className="min-h-[140px]" />
        </Field>
      ) : (
        <div className="well flex flex-col gap-2">
          <div className="eyebrow">Mục tiêu đã làm rõ · bản nháp</div>
          <p className="whitespace-pre-wrap">{text}</p>
        </div>
      )}
      {suggested.length > 0 && (
        <Field label="Kỹ năng từ CV" hint={`Chọn kỹ năng muốn thêm vào hồ sơ (${chosen.length}/${suggested.length} đã chọn).`}>
          <Chips>
            {suggested.map((s) => (
              <Chip key={s} selected={chosen.includes(s)} onClick={busy ? undefined : () => toggle(s)}>
                {chosen.includes(s) ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                {s}
              </Chip>
            ))}
          </Chips>
        </Field>
      )}
      <div className="form-actions">
        <Button variant="primary" loading={busy} disabled={!valid} onClick={() => run(() => aiApi.confirmGoal(conversation.id, trimmed, chosen))}>
          {busy ? "Đang lưu…" : "Dùng mục tiêu này"}
        </Button>
        {!editing && <Button disabled={busy} onClick={() => setEditing(true)}>Sửa</Button>}
        <Button variant="ghost" disabled={busy} onClick={discard}>Bỏ qua</Button>
      </div>
    </div>
  );
}
