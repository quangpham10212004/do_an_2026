"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui";

/** Khoá sessionStorage giữ mã giới thiệu cho tới khi mentee gửi yêu cầu (board RefInvitee, bước 2-3). */
export const REFERRAL_KEY = "mmp.referralCode";

const CODE_RE = /^[A-Za-z0-9_-]{4,32}$/;

/**
 * Đọc ?ref=CODE từ URL, lưu vào sessionStorage và báo cho người xem biết mã giảm giá sẽ được áp dụng.
 * Mã chỉ được kiểm tra hợp lệ ở backend khi gửi yêu cầu (POST /api/mentoring/requests kèm referralCode); FE chỉ ghi nhận.
 */
export default function RefBanner() {
  const [code, setCode] = useState("");
  useEffect(() => {
    let found = "";
    try {
      const q = new URLSearchParams(window.location.search).get("ref")?.trim() ?? "";
      if (CODE_RE.test(q)) {
        found = q.toUpperCase();
        window.sessionStorage.setItem(REFERRAL_KEY, found);
      } else {
        found = window.sessionStorage.getItem(REFERRAL_KEY) ?? "";
      }
    } catch { /* sessionStorage bị chặn: bỏ qua, chỉ mất ghi nhớ mã */ }
    setCode(found);
  }, []);
  if (!code) return null;
  return (
    <Alert tone="success" title="Bạn được giới thiệu" className="mb-4">
      Mã giảm giá sẽ được áp dụng cho buổi học đầu tiên với mentor này. Mã giới thiệu: <b className="font-mono tabular">{code}</b>
    </Alert>
  );
}
