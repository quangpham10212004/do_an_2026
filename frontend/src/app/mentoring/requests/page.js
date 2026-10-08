"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead, StatusBadge, useDialog } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import IntroBooker from "@/features/mentoring/IntroBooker";
import { formatDateTime } from "@/lib/format";

/** Khối trạng thái làm quen: buổi đã đặt, quyết định của hai bên và nút chọn tiếp tục/dừng. */
function IntroPanel({ request, isMentor, onChanged, act }) {
  const intro = request.intro;
  const myDecision = isMentor ? request.mentorDecision : request.menteeDecision;
  const otherDecision = isMentor ? request.menteeDecision : request.mentorDecision;
  const otherLabel = isMentor ? "Mentee" : "Mentor";

  if (!intro) {
    return isMentor ? (
      <div className="alert info" style={{ margin: "8px 0 0" }}>
        Bạn đã đồng ý làm quen. Đang chờ mentee đặt một buổi trò chuyện {request.introDurationMinutes} phút.
      </div>
    ) : (
      <div style={{ marginTop: 8 }}>
        <div className="alert info" style={{ marginBottom: 8 }}>
          Mentor đồng ý cho một buổi làm quen {request.introDurationMinutes} phút (miễn phí, chưa chiếm chỗ của mentor). Sau buổi này, cả hai chọn có tiếp tục hay không.
        </div>
        <IntroBooker request={request} onBooked={onChanged} />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div className="small">
        <strong>Buổi làm quen:</strong> {formatDateTime(intro.scheduledAt)} · {request.introDurationMinutes} phút <StatusBadge status={intro.status} />
        {!intro.decisionOpen && <span className="muted"> (đổi lịch hoặc huỷ ở trang <Link href="/mentoring/sessions">Phiên học</Link>)</span>}
      </div>
      {intro.decisionOpen ? (
        <div className="row" style={{ marginTop: 8 }}>
          {myDecision === "CONTINUE" ? (
            <span className="small">Bạn muốn tiếp tục. {otherDecision === "CONTINUE" ? "" : `Đang chờ ${otherLabel.toLowerCase()} quyết định.`}</span>
          ) : (
            <>
              <button className="btn good sm" onClick={() => act(() => mentoringApi.decide(request.id, "CONTINUE"), "Đã ghi nhận: bạn muốn tiếp tục")}>Tiếp tục</button>
              <button className="btn danger sm" onClick={() => act(() => mentoringApi.decide(request.id, "DECLINE"), "Đã dừng sau buổi làm quen")}>Không tiếp tục</button>
            </>
          )}
          {otherDecision === "CONTINUE" && myDecision !== "CONTINUE" && <span className="small muted">{otherLabel} đã muốn tiếp tục.</span>}
        </div>
      ) : (
        <div className="small muted" style={{ marginTop: 4 }}>Sau khi buổi làm quen kết thúc, hai bên sẽ chọn tiếp tục hay không.</div>
      )}
    </div>
  );
}

function Requests({ user }) {
  const [items, setItems] = useState(undefined);
  const [msg, setMsg] = useState({});
  const [dialog, ask] = useDialog();
  const isMentor = user.role === "MENTOR";
  const load = useCallback(() => mentoringApi.requests().then(setItems), []);
  useEffect(() => {
    load();
  }, [load]);

  async function act(fn, ok) {
    setMsg({});
    try {
      await fn();
      setMsg({ ok });
      load();
    } catch (e) {
      setMsg({ error: e.message });
    }
  }

  if (items === undefined) return <Loading />;
  return (
    <>
      <PageHead title="Yêu cầu mentoring" subtitle={isMentor ? "Mentee gửi yêu cầu được bạn hướng dẫn." : "Các yêu cầu bạn đã gửi tới mentor."}>
      {dialog}
        {!isMentor && <Link className="btn" href="/matching">Tìm mentor</Link>}
      </PageHead>
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      <div className="card">
        {items.length === 0 && <Empty>Chưa có yêu cầu nào.</Empty>}
        {items.map((r) => (
          <div className="list-item" key={r.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div className="row" style={{ width: "100%" }}>
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
                    <button className="btn good sm" title="Nhận mentee ngay, chiếm một chỗ" onClick={() => act(() => mentoringApi.respond(r.id, "ACCEPT", ""), "Đã chấp nhận yêu cầu")}>Nhận thẳng</button>
                    <button className="btn secondary sm" title="Hẹn một buổi trò chuyện ngắn trước khi quyết định" onClick={() => act(() => mentoringApi.respond(r.id, "INTRO", ""), "Đã đồng ý buổi làm quen")}>Làm quen trước</button>
                    <button className="btn danger sm" onClick={async () => {
                      const note = await ask({ title: `Từ chối yêu cầu của ${r.menteeName}?`, input: { label: "Lý do (tuỳ chọn)", placeholder: "Mentee sẽ thấy lời nhắn này" }, confirmText: "Từ chối", danger: true });
                      if (note !== null) act(() => mentoringApi.respond(r.id, "REJECT", note), "Đã từ chối yêu cầu");
                    }}>Từ chối</button>
                  </>
                )}
                {!isMentor && ["PENDING", "INTRO"].includes(r.status) && (
                  <button className="btn secondary sm" onClick={async () => (await ask({ title: "Huỷ yêu cầu này?", message: r.status === "INTRO" ? "Buổi làm quen chưa diễn ra (nếu có) cũng sẽ bị huỷ." : undefined, confirmText: "Huỷ yêu cầu", cancelText: "Giữ lại", danger: true })) && act(() => mentoringApi.cancelRequest(r.id), "Đã huỷ yêu cầu")}>Huỷ</button>
                )}
                {!isMentor && r.status === "ACCEPTED" && <Link className="btn sm" href={`/mentors/${r.mentorId}`}>Đặt lịch</Link>}
                {r.status === "ACCEPTED" && (
                  <button className="btn secondary sm" onClick={async () => (await ask({ title: "Kết thúc quan hệ mentoring này?", message: "Mentor sẽ được giải phóng một chỗ. Các gói buổi còn hiệu lực sẽ được đóng và hoàn tiền các buổi chưa dùng. Bạn cần gửi yêu cầu mới nếu muốn học tiếp.", confirmText: "Kết thúc", danger: true })) && act(() => mentoringApi.completeRequest(r.id), "Đã kết thúc mentoring")}>
                    Kết thúc
                  </button>
                )}
              </div>
            </div>
            {r.status === "INTRO" && <IntroPanel request={r} isMentor={isMentor} act={act} onChanged={() => { setMsg({ ok: "Đã đặt buổi làm quen" }); load(); }} />}
          </div>
        ))}
      </div>
    </>
  );
}

export default function RequestsPage() {
  return <RequireAuth roles={["MENTEE", "MENTOR"]}>{(user) => <Requests user={user} />}</RequireAuth>;
}
