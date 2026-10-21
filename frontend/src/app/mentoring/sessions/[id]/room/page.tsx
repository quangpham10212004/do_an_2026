"use client";

import { useEffect, useRef, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Button, Card, CardBody, Loading, PageHeader } from "@/components/ui";
import { mentoringApi } from "@/features/mentoring/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { MentoringSession, RoomInfo } from "@/types";

/** Phần tối thiểu của Jitsi Meet External API dùng ở trang này (script do chính máy chủ Jitsi phục vụ). */
interface JitsiApi {
  dispose(): void;
  addListener(event: string, listener: () => void): void;
}
type JitsiCtor = new (domain: string, options: Record<string, unknown>) => JitsiApi;
declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiCtor;
  }
}

function loadJitsi(domain: string): Promise<JitsiCtor> {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) return resolve(window.JitsiMeetExternalAPI);
    const s = document.createElement("script");
    s.src = `https://${domain}/external_api.js`;
    s.async = true;
    s.onload = () => (window.JitsiMeetExternalAPI ? resolve(window.JitsiMeetExternalAPI) : reject(new Error("Jitsi API không khả dụng")));
    s.onerror = () => reject(new Error(`Không tải được phòng học từ ${domain}`));
    document.body.appendChild(s);
  });
}

/**
 * Bản chốt v2.0 §6 — phòng học video + chat trong hệ thống (Jitsi Meet tự host). mentoring-service cấp JWT cho đúng hai người tham
 * gia trong khung giờ phòng mở; lần đầu lấy token được ghi vào nhật ký vào phòng (căn cứ xác định vắng mặt).
 */
function Room({ sessionId }: { sessionId: string }) {
  const container = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<MentoringSession | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let api: JitsiApi | null = null;
    let cancelled = false;
    (async () => {
      try {
        const [s, r] = await Promise.all([mentoringApi.session(sessionId), mentoringApi.room(sessionId)]);
        if (cancelled) return;
        setSession(s);
        setRoom(r);
        const Ctor = await loadJitsi(r.domain);
        if (cancelled || !container.current) return;
        api = new Ctor(r.domain, {
          roomName: r.roomName,
          jwt: r.jwt,
          parentNode: container.current,
          width: "100%",
          height: "100%",
          // Jitsi stable-9823 đọc prejoinConfig.enabled; prejoinPageEnabled giữ cho bản cũ. Tên + quyền đã có trong JWT nên bỏ màn "Join meeting".
          configOverwrite: { prejoinConfig: { enabled: false }, prejoinPageEnabled: false, startWithAudioMuted: true },
          interfaceConfigOverwrite: { MOBILE_APP_PROMO: false },
        });
        api.addListener("readyToClose", () => { window.location.href = "/mentoring/sessions"; });
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
      api?.dispose();
    };
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
          <div ref={container} className="h-[70vh] min-h-[420px] w-full overflow-hidden rounded-md bg-surface-sunken" />
          <p className="mt-3 text-small text-ink-muted">
            Phòng học chạy trên máy chủ Jitsi của nền tảng ({room.domain}). Nếu khung trống, hãy mở https://{room.domain} một lần để trình duyệt chấp nhận chứng chỉ rồi tải lại trang.
          </p>
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
