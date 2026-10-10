"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui";

function Alerts({ welcome }: { welcome: string }) {
  const params = useSearchParams();
  const verify = params.get("verify");
  return (
    <>
      {params.get("welcome") && <Alert tone="success">{welcome}</Alert>}
      {params.get("referral") === "invalid" && <Alert tone="warning">Mã giới thiệu không hợp lệ nên chưa được ghi nhận.</Alert>}
      {verify && (
        <Alert tone="info">
          Email xác thực đã được gửi (môi trường demo ghi vào log).{" "}
          <Link href={`/verify-email?token=${verify}`}>Xác thực ngay</Link>.
        </Alert>
      )}
    </>
  );
}

/** Thông báo sau khi đăng ký (?welcome, ?referral=invalid, ?verify=<token>). */
export default function WelcomeAlerts({ welcome, className = "mb-6" }: { welcome: string; className?: string }) {
  return (
    <div className={`${className} flex flex-col gap-2 empty:hidden`}>
      <Suspense>
        <Alerts welcome={welcome} />
      </Suspense>
    </div>
  );
}
