"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Copy, Facebook, Gift, Lock, Mail, MessageCircle, Send, Share2, Star } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, Field, Input, Loading, PageHeader, Textarea, initials } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { referralApi, type ReferralOverview, type ReferralMentor } from "@/features/referral/api";

function defaultMessage(m: ReferralMentor) {
  return `Mình học với ${m.mentorName} trên MentorHub, thầy/cô chỉ rất kỹ và dễ hiểu. Bạn thử xem nhé: ${m.shareUrl}`;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function SharePanel({ mentor, ov }: { mentor: ReferralMentor; ov: ReferralOverview }) {
  const [message, setMessage] = useState(() => defaultMessage(mentor));
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const ok = await copy(mentor.shareUrl);
    setCopied(ok);
    setNotice(ok ? "Đã sao chép liên kết." : "Không sao chép được. Hãy chọn liên kết và sao chép thủ công.");
  }

  /** Zalo/Messenger không có URL chia sẻ công khai ổn định: sao chép lời nhắn để dán vào ứng dụng. */
  async function copyMessage(app: string) {
    const ok = await copy(message);
    setNotice(ok ? `Đã sao chép lời nhắn. Mở ${app} và dán để gửi.` : "Không sao chép được lời nhắn.");
  }

  const enc = encodeURIComponent;
  return (
    <Card>
      <CardHeader title={`Giới thiệu ${mentor.mentorName}`} />
      <CardBody className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="ob-avatar" aria-hidden="true">{initials(mentor.mentorName)}</span>
          <div className="min-w-0">
            <strong>{mentor.mentorName}</strong>
            <div className="flex flex-wrap items-center gap-2 text-small text-ink-muted">
              {mentor.headline && <span>{mentor.headline}</span>}
              {mentor.rating != null && <span className="inline-flex items-center gap-1"><Star aria-hidden="true" className="size-3.5" />{mentor.rating.toFixed(1)}</span>}
            </div>
          </div>
        </div>
        <Alert tone="info">
          <b>Phần thưởng của bạn:</b> mã giảm giá {formatMoney(ov.reward)} khi bạn bè đặt buổi đầu tiên và buổi học hoàn thành, sau {ov.pendingDays} ngày không hoàn tiền.
        </Alert>
        <Field label="Liên kết giới thiệu" id="rf-link" hint={<>Hoặc gửi mã: <b className="font-mono text-ink">{mentor.code}</b></>}>
          <div className="input-group">
            <Input id="rf-link" readOnly value={mentor.shareUrl} className="font-mono text-small" onFocus={(e) => e.target.select()} />
            <Button variant="primary" icon={copied ? Check : Copy} onClick={copyLink}>{copied ? "Đã sao chép" : "Sao chép"}</Button>
          </div>
        </Field>
        <Field label="Lời nhắn (có thể sửa)" id="rf-msg">
          <Textarea id="rf-msg" rows={3} value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <div>
          <div className="field-label mb-2">Gửi qua</div>
          <div className="flex flex-wrap gap-2">
            <Button icon={MessageCircle} onClick={() => copyMessage("Zalo")}>Zalo</Button>
            <Button icon={Send} onClick={() => copyMessage("Messenger")}>Messenger</Button>
            <ButtonLink icon={Facebook} href={`https://www.facebook.com/sharer/sharer.php?u=${enc(mentor.shareUrl)}`} target="_blank" rel="noopener noreferrer">Facebook</ButtonLink>
            <ButtonLink icon={Mail} href={`mailto:?subject=${enc(`Giới thiệu mentor ${mentor.mentorName}`)}&body=${enc(message)}`}>Email</ButtonLink>
          </div>
        </div>
        <div aria-live="polite" className="min-h-6 text-small text-ink-muted">{notice}</div>
      </CardBody>
    </Card>
  );
}

function Share() {
  const params = useSearchParams();
  const [ov, setOv] = useState<ReferralOverview | null | undefined>(undefined);
  const [picked, setPicked] = useState<string | null>(params.get("mentor"));

  useEffect(() => {
    referralApi.overview().then((o) => {
      setOv(o);
      setPicked((cur) => (cur && o.codes.some((c) => c.mentorId === cur) ? cur : o.codes[0]?.mentorId ?? null));
    }).catch(() => setOv(null));
  }, []);

  if (ov === undefined) return <Loading />;
  if (!ov) return <Alert>Không tải được danh sách mentor để giới thiệu. Thử lại sau.</Alert>;
  const mentor = ov.codes.find((c) => c.mentorId === picked) ?? null;

  return (
    <>
      <PageHeader back={{ href: "/referral", label: "Giới thiệu bạn bè" }} title="Chia sẻ mentor"
        description="Chọn mentor bạn muốn giới thiệu, rồi gửi liên kết hoặc mã cho bạn bè." />
      {ov.codes.length === 0 ? (
        <EmptyState icon={Gift} title="Chưa có mentor để giới thiệu"
          action={<ButtonLink href="/matching" variant="primary">Tìm mentor</ButtonLink>}>
          Học xong ít nhất một buổi trả phí với một mentor để nhận mã giới thiệu riêng của mentor đó.
        </EmptyState>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Card>
            <CardHeader title="Mentor bạn đã học" description="Chọn một mentor." />
            <CardBody>
              <div role="radiogroup" aria-label="Chọn mentor để giới thiệu" className="flex flex-col gap-2">
                {ov.codes.map((c) => (
                  <label key={c.mentorId} className="rf-opt" data-checked={picked === c.mentorId}>
                    <input type="radio" name="rf-mentor" checked={picked === c.mentorId} onChange={() => setPicked(c.mentorId)} />
                    <span className="ob-avatar" aria-hidden="true">{initials(c.mentorName)}</span>
                    <span className="min-w-0 flex-1">
                      <b>{c.mentorName}</b>
                      <span className="block text-small text-ink-muted">
                        {[c.headline, c.sessionsLearned ? `bạn đã học ${c.sessionsLearned} buổi` : ""].filter(Boolean).join(" · ")}
                      </span>
                      <span className="block text-small text-ink-muted">{c.usedCount ? `${c.usedCount} người đã dùng` : "Chưa ai dùng"}</span>
                    </span>
                  </label>
                ))}
                {ov.locked.map((l) => (
                  <div key={l.mentorId} className="rf-opt" data-disabled="true">
                    <Lock aria-hidden="true" className="size-5 flex-none text-ink-subtle" />
                    <span className="min-w-0 flex-1">
                      <b>{l.mentorName}</b>
                      <span className="block text-small text-ink-muted">Học xong một buổi trả phí với mentor này để mở mã giới thiệu.</span>
                    </span>
                    <ButtonLink size="sm" href={`/mentors/${l.mentorId}`}>Đặt buổi học</ButtonLink>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
          {mentor ? <SharePanel key={mentor.mentorId} mentor={mentor} ov={ov} /> : (
            <EmptyState icon={Share2} title="Chọn một mentor">Chọn mentor ở bên trái để lấy liên kết giới thiệu.</EmptyState>
          )}
        </div>
      )}
    </>
  );
}

export default function ReferralSharePage() {
  return (
    <RequireAuth roles={["MENTEE"]}>
      <Suspense fallback={<Loading />}>
        <Share />
      </Suspense>
    </RequireAuth>
  );
}
