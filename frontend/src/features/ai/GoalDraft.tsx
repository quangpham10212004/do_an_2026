"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, useDialog } from "@/components/ui";
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
      <div>
        <Alert type="success">
          {conversation.profileSynced
            ? "Đã dùng mục tiêu này cho hồ sơ (kèm kỹ năng bạn đã chọn); gợi ý mentor được cập nhật ngay sau đó."
            : "Đã ghi nhận mục tiêu, đang đồng bộ vào hồ sơ (hệ thống sẽ tự thử lại nếu dịch vụ hồ sơ tạm lỗi)..."}
        </Alert>
        <div className="card" style={{ background: "var(--surface-2)", boxShadow: "none" }}>
          <strong>Mục tiêu đã dùng</strong>
          <p style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{conversation.confirmedGoal}</p>
          {(conversation.addedSkills ?? []).length > 0 && (
            <div className="chips" style={{ marginTop: 6 }}>{conversation.addedSkills.map((s) => <span key={s} className="chip">{s}</span>)}</div>
          )}
        </div>
        <Link href="/matching" className="btn" style={{ marginTop: "1rem" }}>Tìm mentor phù hợp</Link>
      </div>
    );
  }

  if (conversation.goalStatus === "DISCARDED") {
    return <Alert type="info">Bạn đã bỏ qua mục tiêu này — hồ sơ không thay đổi. Tải CV mới nếu muốn làm lại.</Alert>;
  }

  return (
    <div>
      {dialog}
      <Alert type="info">Đây là bản nháp mục tiêu. Hồ sơ của bạn chưa thay đổi cho tới khi bạn chọn &quot;Dùng mục tiêu này&quot;.</Alert>
      <Alert>{error}</Alert>
      <div className="card" style={{ background: "var(--surface-2)", boxShadow: "none" }}>
        <strong>Mục tiêu đã làm rõ (bản nháp)</strong>
        {editing ? (
          <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_GOAL} disabled={busy} style={{ marginTop: 6, minHeight: 140 }} />
            <div className="hint">{trimmed.length}/{MAX_GOAL} ký tự{trimmed.length < MIN_GOAL ? ` — tối thiểu ${MIN_GOAL} ký tự` : ""}</div>
          </>
        ) : (
          <p style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{text}</p>
        )}
      </div>
      {suggested.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <strong>Kỹ năng từ CV</strong>
          <p className="muted small">Chọn kỹ năng muốn thêm vào hồ sơ ({chosen.length}/{suggested.length} đã chọn).</p>
          <div className="chips">
            {suggested.map((s) => (
              <button key={s} type="button" className={`chip${chosen.includes(s) ? " match" : ""}`} style={{ cursor: "pointer" }} aria-pressed={chosen.includes(s)}
                disabled={busy} onClick={() => toggle(s)}>
                {chosen.includes(s) ? "✓ " : "+ "}{s}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="row" style={{ gap: 8, marginTop: "1rem" }}>
        <button type="button" className="btn" disabled={busy || !valid} onClick={() => run(() => aiApi.confirmGoal(conversation.id, trimmed, chosen))}>
          {busy ? "Đang lưu..." : "Dùng mục tiêu này"}
        </button>
        {!editing && <button type="button" className="btn secondary" disabled={busy} onClick={() => setEditing(true)}>Sửa</button>}
        <button type="button" className="btn ghost" disabled={busy} onClick={discard}>Bỏ qua</button>
      </div>
    </div>
  );
}
