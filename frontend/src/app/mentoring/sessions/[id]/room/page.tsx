"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Timer, UserX } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Button, ButtonLink, Loading, useDialog } from "@/components/ui";
import { JitsiEmbed } from "@/features/jitsi/JitsiEmbed";
import { mentoringApi } from "@/features/mentoring/api";
import RoomPanel from "@/features/sesx/RoomPanel";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { MentoringSession, RoomInfo } from "@/types";

function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Đồng hồ "đã học / tổng" — tính từ giờ bắt đầu của phiên (không âm trước giờ học). */
function SessionTimer({ session }: { session: MentoringSession }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.min(Math.max(0, (now - new Date(session.scheduledAt).getTime()) / 1000), session.durationMinutes * 60);
  return (
    <div className="ses-timer" role="timer" aria-label={`Đã học ${mmss(elapsed)} trên ${session.durationMinutes} phút`}>
      <Timer aria-hidden="true" />
      {mmss(elapsed)} / {mmss(session.durationMinutes * 60)}
    </div>
  );
}

/**
 * Bản chốt v2.0 §6 — phòng học video + chat trong hệ thống (Jitsi Meet tự host). mentoring-service cấp JWT cho đúng hai người tham
 * gia trong khung giờ phòng mở; lần đầu lấy token được ghi vào nhật ký vào phòng (căn cứ xác định vắng mặt).
 */
function Room({ sessionId, myName }: { sessionId: string; myName: string }) {
  const [session, setSession] = useState<MentoringSession | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, ask] = useDialog();

  useEffect(() => {
    Promise.all([mentoringApi.session(sessionId), mentoringApi.room(sessionId)])
      .then(([s, r]) => { setSession(s); setRoom(r); })
      .catch((e) => setError(errorMessage(e)));
  }, [sessionId]);

  async function reportAbsent() {
    setBusy(true);
    setNotice("");
    try {
      await mentoringApi.reportAbsent(sessionId);
      setNotice("Đã báo bên kia vắng mặt. Kết luận cuối cùng dựa trên nhật ký vào phòng khi buổi kết thúc.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !room) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/mentoring/sessions" className="inline-flex min-h-[44px] items-center gap-1.5 text-small"><ArrowLeft className="size-4" aria-hidden="true" />Phiên học</Link>
        <Alert>{error}</Alert>
      </div>
    );
  }
  if (!room || !session) return <Loading />;

  async function leave() {
    if (!session) return;
    const elapsedMin = Math.max(0, Math.floor((Date.now() - new Date(session.scheduledAt).getTime()) / 60000));
    const ok = await ask({
      title: "Kết thúc buổi học bây giờ?",
      message: `Mới học ${Math.min(elapsedMin, session.durationMinutes)} phút trên ${session.durationMinutes} phút. Sau khi kết thúc, cả hai bên xác nhận buổi học đã diễn ra để học phí được chuyển cho mentor.`,
      confirmText: "Kết thúc và xác nhận",
      cancelText: "Tiếp tục học",
    });
    if (ok) window.location.href = "/mentoring/sessions";
  }

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      <header className="ses-room-bar">
        <Link href="/mentoring/sessions" aria-label="Rời phòng, về danh sách phiên học"><ArrowLeft className="size-4" aria-hidden="true" />Rời phòng</Link>
        <div className="ses-room-title">
          <b>{session.topic || "Phiên mentoring"} · {session.mentorName} và {session.menteeName}</b>
          <span>{formatDateTime(session.scheduledAt)} · {session.durationMinutes} phút · chat có sẵn trong phòng</span>
        </div>
        <SessionTimer session={session} />
        <button type="button" className="ses-end" onClick={leave}>Kết thúc buổi học</button>
      </header>

      {notice && <Alert tone="info">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="ses-room-cols">
        <div className="ses-room-video">
          <div className="ses-room-stage">
            <JitsiEmbed domain={room.domain} roomName={room.roomName} jwt={room.jwt} onClose={() => { window.location.href = "/mentoring/sessions"; }} />
          </div>
          <div className="ses-sec">
            <div className="ses-sec-body flex flex-wrap items-center justify-between gap-3" style={{ paddingTop: 16 }}>
              <div className="ses-presence" aria-label="Trạng thái phòng">
                <span className="ses-pill" data-on="true">Bạn đã vào phòng</span>
                <span className="ses-pill">Bên kia chờ tối đa {room.graceMinutes} phút</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={`/mentoring/sessions/${sessionId}/notes`} icon={FileText}>Mở ghi chú toàn trang</ButtonLink>
                <Button icon={UserX} loading={busy} onClick={reportAbsent}>Bên kia chưa vào ({room.graceMinutes} phút)</Button>
              </div>
            </div>
          </div>
        </div>
        <div className="ses-room-aside"><RoomPanel sessionId={sessionId} myName={myName} /></div>
      </div>
    </div>
  );
}

export default function RoomPage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth roles={["MENTEE", "MENTOR"]}>
      {(user) => <Room sessionId={params.id} myName={user.fullName ?? "Bạn"} />}
    </RequireAuth>
  );
}
