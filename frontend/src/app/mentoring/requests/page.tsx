"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead, StatusBadge, useDialog, Flash } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { MentoringRequest, SessionUser } from "@/types";

function Requests({ user }: { user: SessionUser }) {
  const [items, setItems] = useState<MentoringRequest[] | undefined>(undefined);
  const [msg, setMsg] = useState<Flash>({});
  const [dialog, ask] = useDialog();
  const isMentor = user.role === "MENTOR";
  const load = useCallback(
    () => mentoringApi.requests().then(setItems).catch((e) => { setItems((cur) => cur ?? []); setMsg({ error: errorMessage(e) }); }),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setMsg({});
    try {
      await fn();
      setMsg({ ok });
      load();
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    }
  }

  if (items === undefined) return <Loading />;
  return (
    <>
      <PageHead title="Yêu cầu mentoring" subtitle={isMentor ? "Mentee gửi yêu cầu được bạn hướng dẫn." : "Các yêu cầu bạn đã gửi tới mentor."}>
      {dialog}
        {!isMentor && <Link className="btn" href="/mentors">Tìm mentor</Link>}
      </PageHead>
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      <div className="card">
        {items.length === 0 && (
          <Empty>
            Chưa có yêu cầu nào.
            {!isMentor && <> <Link href="/mentors">Duyệt danh sách mentor</Link> hoặc dùng <Link href="/matching">AI Matching</Link> để bắt đầu.</>}
          </Empty>
        )}
        {items.map((r) => (
          <div className="list-item" key={r.id}>
            <div style={{ flex: 1 }}>
              <div className="row">
                <strong>{isMentor ? r.menteeName : <Link href={`/mentors/${r.mentorId}`}>{r.mentorName}</Link>}</strong>
                <StatusBadge status={r.status} />
                <span className="muted small">{formatDateTime(r.createdAt)}</span>
              </div>
              {r.message && <div className="small">“{r.message}”</div>}
              {r.responseNote && <div className="small muted">Phản hồi: {r.responseNote}</div>}
            </div>
            <div className="row">
              {isMentor && r.status === "PENDING" && (
                <>
                  <button className="btn good sm" onClick={() => act(() => mentoringApi.respond(r.id, "ACCEPT", ""), "Đã chấp nhận yêu cầu")}>Chấp nhận</button>
                  <button className="btn danger sm" onClick={async () => {
                    const note = await ask({ title: `Từ chối yêu cầu của ${r.menteeName}?`, input: { label: "Lý do (tuỳ chọn)", placeholder: "Mentee sẽ thấy lời nhắn này" }, confirmText: "Từ chối", danger: true });
                    if (note !== null) act(() => mentoringApi.respond(r.id, "REJECT", note), "Đã từ chối yêu cầu");
                  }}>Từ chối</button>
                </>
              )}
              {!isMentor && r.status === "PENDING" && (
                <button className="btn secondary sm" onClick={() => act(() => mentoringApi.cancelRequest(r.id), "Đã huỷ yêu cầu")}>Huỷ</button>
              )}
              {!isMentor && r.status === "ACCEPTED" && <Link className="btn sm" href={`/mentors/${r.mentorId}`}>Đặt lịch</Link>}
              {r.status === "ACCEPTED" && (
                <button className="btn secondary sm" onClick={async () => (await ask({ title: "Kết thúc quan hệ mentoring này?", message: "Mentor sẽ được giải phóng một chỗ. Bạn cần gửi yêu cầu mới nếu muốn học tiếp.", confirmText: "Kết thúc", danger: true })) && act(() => mentoringApi.completeRequest(r.id), "Đã kết thúc mentoring")}>
                  Kết thúc
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function RequestsPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{(user) => <Requests user={user} />}</RequireAuth>;
}
