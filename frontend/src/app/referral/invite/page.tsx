"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, Gift, Star } from "lucide-react";
import { Alert, Badge, ButtonLink, Card, CardBody, EmptyState, Loading, initials } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { referralApi, type InviteErrorCode, type InviteInfo } from "@/features/referral/api";

const ERRORS: Record<InviteErrorCode, [string, string]> = {
  NOT_FOUND: ["Mã không tồn tại.", "Kiểm tra lại mã hoặc hỏi người giới thiệu."],
  ALREADY_LEARNED: ["Bạn đã học với mentor này.", "Mã chỉ áp dụng cho người mới với mentor."],
  SELF_REFERRAL: ["Không dùng được mã của chính bạn.", ""],
  NOT_FIRST_SESSION: ["Mã chỉ dùng cho buổi thường đầu tiên.", "Bạn vẫn có thể gửi yêu cầu không kèm mã."],
};

function Invite() {
  const code = (useSearchParams().get("code") ?? "").trim().toUpperCase();
  const { user } = useAuth();
  const [info, setInfo] = useState<InviteInfo | null | undefined>(undefined);

  useEffect(() => {
    if (!code) { setInfo(null); return; }
    setInfo(undefined);
    referralApi.lookupCode(code).then(setInfo).catch(() => setInfo(null));
  }, [code]);

  if (!code) {
    return <EmptyState icon={Gift} title="Chưa có mã giới thiệu" action={<ButtonLink href="/register" variant="primary">Đăng ký tài khoản</ButtonLink>}>
      Mở liên kết bạn bè gửi để xem mentor được giới thiệu.
    </EmptyState>;
  }
  if (info === undefined) return <Loading />;
  if (info === null) return <Alert>Không kiểm tra được mã lúc này. Thử lại sau.</Alert>;

  if (!info.valid || !info.mentor) {
    const [title, hint] = ERRORS[info.errorCode ?? "NOT_FOUND"];
    return (
      <div className="mx-auto flex max-w-[640px] flex-col gap-4">
        <Alert title={title}>{hint}</Alert>
        <ButtonLink href={user ? "/matching" : "/register"} variant="primary">{user ? "Tìm mentor" : "Đăng ký không kèm mã"}</ButtonLink>
      </div>
    );
  }

  const m = info.mentor;
  const cta = user ? `/mentors/${m.id}?ref=${encodeURIComponent(info.code)}` : `/register?ref=${encodeURIComponent(info.code)}`;
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-5">
      <div>
        {info.inviterName && <span className="eyebrow">{info.inviterName} giới thiệu bạn</span>}
        <h1 className="mt-1">Học cùng {m.name}</h1>
      </div>
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="ob-avatar" aria-hidden="true">{initials(m.name)}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{m.name}</strong>
                {m.verified && <Badge tone="success"><BadgeCheck aria-hidden="true" className="size-3.5" /> Xác thực</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 text-small text-ink-muted">
                <span>{m.headline}</span>
                {m.rating != null && <span className="inline-flex items-center gap-1"><Star aria-hidden="true" className="size-3.5" /><b className="text-ink">{m.rating.toFixed(1)}</b> ({m.reviewCount})</span>}
                {m.hourlyRate > 0 && <span>{formatMoney(m.hourlyRate)} / giờ</span>}
              </div>
            </div>
          </div>
          {info.quote && <blockquote className="well text-small">“{info.quote}”{info.inviterName && <> — {info.inviterName}</>}</blockquote>}
          <ButtonLink href={cta} variant="primary" size="lg" block>{user ? "Gửi yêu cầu cho mentor" : "Đăng ký và gửi yêu cầu"}</ButtonLink>
          <p className="text-center text-small text-ink-muted">
            Mã giới thiệu <b className="font-mono text-ink">{info.code}</b> sẽ được áp dụng cho buổi đầu tiên với mentor này.
          </p>
        </CardBody>
      </Card>
      {!user && <p className="text-small text-ink-muted">Đã có tài khoản? <Link href="/login">Đăng nhập</Link></p>}
    </div>
  );
}

export default function InvitePage() {
  return <Suspense fallback={<Loading />}><Invite /></Suspense>;
}
