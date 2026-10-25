"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui";
import { errorMessage } from "@/lib/api";

/** Phần tối thiểu của Jitsi Meet External API dùng ở đây (script do chính máy chủ Jitsi phục vụ). */
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
    s.onerror = () => reject(new Error(`Không tải được phòng từ ${domain}`));
    document.body.appendChild(s);
  });
}

/**
 * Khung Jitsi Meet (tự host) dùng chung cho phòng học (/mentoring/sessions/[id]/room) và phòng phỏng vấn xác thực mentor
 * (/interview/room, /admin/verification/[id]/room). JWT do mentoring-service ký nên tên + quyền moderator đã nằm trong token
 * và bỏ màn "Join meeting".
 */
export function JitsiEmbed({ domain, roomName, jwt, onClose }: { domain: string; roomName: string; jwt: string; onClose?: () => void }) {
  const container = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState("");
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let api: JitsiApi | null = null;
    let cancelled = false;
    (async () => {
      try {
        const Ctor = await loadJitsi(domain);
        if (cancelled || !container.current) return;
        api = new Ctor(domain, {
          roomName,
          jwt,
          parentNode: container.current,
          width: "100%",
          height: "100%",
          // Jitsi stable-9823 đọc prejoinConfig.enabled; prejoinPageEnabled giữ cho bản cũ.
          configOverwrite: { prejoinConfig: { enabled: false }, prejoinPageEnabled: false, startWithAudioMuted: true },
          interfaceConfigOverwrite: { MOBILE_APP_PROMO: false },
        });
        api.addListener("readyToClose", () => onCloseRef.current?.());
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
      api?.dispose();
    };
  }, [domain, roomName, jwt]);

  return (
    <>
      {error && <Alert className="mb-4">{error}</Alert>}
      <div ref={container} className="h-[70vh] min-h-[420px] w-full overflow-hidden rounded-md bg-surface-sunken" />
      <p className="mt-3 text-small text-ink-muted">
        Phòng chạy trên máy chủ Jitsi của nền tảng ({domain}). Nếu khung trống, hãy mở https://{domain} một lần để trình duyệt chấp nhận chứng chỉ rồi tải lại trang.
      </p>
    </>
  );
}
