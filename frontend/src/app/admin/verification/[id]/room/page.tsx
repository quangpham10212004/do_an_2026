"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Card, CardBody, Loading, PageHeader } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import { JitsiEmbed } from "@/features/jitsi/JitsiEmbed";
import { ApiError, errorMessage } from "@/lib/api";
import type { Round2Room } from "@/types";

/** Phòng phỏng vấn vòng 2 của admin (moderator). Buổi không giới hạn thời lượng; chấm phiếu ở trang chi tiết đợt sau khi xong. */
function AdminRoom({ id }: { id: string }) {
  const [room, setRoom] = useState<Round2Room | null>(null);
  const [error, setError] = useState("");
  const back = { href: `/admin/verification/${id}`, label: "Chi tiết đợt" };

  useEffect(() => {
    aiApi.round2Room(id).then(setRoom).catch((e) => {
      setError(e instanceof ApiError && e.code === "ROOM_CLOSED"
        ? "Phòng chưa mở. Phòng mở trước giờ bắt đầu 10 phút."
        : errorMessage(e));
    });
  }, [id]);

  if (error) {
    return (
      <>
        <PageHeader title="Phòng phỏng vấn" back={back} />
        <Alert>{error}</Alert>
      </>
    );
  }
  if (!room) return <Loading />;
  return (
    <>
      <PageHeader title="Phỏng vấn vòng 2" description="Bạn là moderator. Hỏi ít nhất một câu cho mỗi tiêu chí rồi chấm phiếu ở trang chi tiết đợt." back={back} />
      <Card><CardBody><JitsiEmbed domain={room.domain} roomName={room.roomName} jwt={room.jwt} onClose={() => { window.location.href = back.href; }} /></CardBody></Card>
    </>
  );
}

export default function AdminRoomPage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <AdminRoom id={params.id} />
    </RequireAuth>
  );
}
