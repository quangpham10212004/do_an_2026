"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Card, CardBody, Loading, PageHeader } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import { JitsiEmbed } from "@/features/jitsi/JitsiEmbed";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Round2Room } from "@/types";

/**
 * Phòng phỏng vấn vòng 2 của mentor (khách). Token do ai-service xin mentoring-service; chỉ cấp trong khung giờ phòng mở
 * (trước giờ bắt đầu 10 phút). Lần đầu lấy token được ghi vào nhật ký vào phòng — căn cứ xác định vắng mặt.
 */
function MentorRoom() {
  const [room, setRoom] = useState<Round2Room | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    aiApi.round2Room().then(setRoom).catch((e) => {
      setError(e instanceof ApiError && e.code === "ROOM_CLOSED"
        ? "Phòng chưa mở. Hãy quay lại trong vòng 10 phút trước giờ bắt đầu buổi phỏng vấn."
        : errorMessage(e));
    });
  }, []);

  if (error) {
    return (
      <>
        <PageHeader title="Phòng phỏng vấn" back={{ href: "/interview", label: "AI Interview" }} />
        <Alert>{error}</Alert>
      </>
    );
  }
  if (!room) return <Loading />;
  return (
    <>
      <PageHeader title="Phỏng vấn vòng 2" description={`Phỏng vấn trực tiếp với quản trị viên · phòng mở từ ${formatDateTime(room.opensAt)}`}
        back={{ href: "/interview", label: "AI Interview" }} />
      <Card><CardBody><JitsiEmbed domain={room.domain} roomName={room.roomName} jwt={room.jwt} onClose={() => { window.location.href = "/interview"; }} /></CardBody></Card>
    </>
  );
}

export default function MentorRoomPage() {
  return (
    <RequireAuth roles={["MENTOR"]}>
      <MentorRoom />
    </RequireAuth>
  );
}
