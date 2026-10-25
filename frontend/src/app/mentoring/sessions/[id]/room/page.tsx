"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Button, Card, CardBody, Loading, PageHeader } from "@/components/ui";
import { JitsiEmbed } from "@/features/jitsi/JitsiEmbed";
import { mentoringApi } from "@/features/mentoring/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { MentoringSession, RoomInfo } from "@/types";

/**
 * Bản chốt v2.0 §6 — phòng học video + chat trong hệ thống (Jitsi Meet tự host). mentoring-service cấp JWT cho đúng hai người tham
 * gia trong khung giờ phòng mở; lần đầu lấy token được ghi vào nhật ký vào phòng (căn cứ xác định vắng mặt).
 */
function Room({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<MentoringSession | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

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
      <>
        <PageHeader title="Phòng học" back={{ href: "/mentoring/sessions", label: "Phiên học" }} />
        <Alert>{error}</Alert>
      </>
    );
  }
  if (!room || !session) return <Loading />;

  return (
    <>
      <PageHeader title="Phòng học" description={`${formatDateTime(session.scheduledAt)} · ${session.durationMinutes} phút · chat có sẵn trong phòng`}
        back={{ href: "/mentoring/sessions", label: "Phiên học" }}
        actions={<Button size="sm" loading={busy} onClick={reportAbsent}>Bên kia chưa vào ({room.graceMinutes} phút)</Button>} />
      {notice && <Alert tone="info" className="mb-4">{notice}</Alert>}
      {error && <Alert className="mb-4">{error}</Alert>}
      <Card>
        <CardBody>
          <JitsiEmbed domain={room.domain} roomName={room.roomName} jwt={room.jwt} onClose={() => { window.location.href = "/mentoring/sessions"; }} />
        </CardBody>
      </Card>
    </>
  );
}

export default function RoomPage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth roles={["MENTEE", "MENTOR"]}>
      <Room sessionId={params.id} />
    </RequireAuth>
  );
}
