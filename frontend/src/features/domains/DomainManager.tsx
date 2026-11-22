"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Layers, Pause, Pencil, Play, Plus, Server, Star, Trash2 } from "lucide-react";
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader, Field, Input, Loading, useDialog } from "@/components/ui";
import { domainLabel } from "@/features/profile/api";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { MentorDomain, MentorDomainsResponse, Uuid } from "@/types";
import { MAX_MENTOR_DOMAINS } from "@/types";
import { domainsApi, interviewHref, type DomainView } from "./api";

export function useMentorDomains(mentorId: Uuid) {
  const [data, setData] = useState<MentorDomainsResponse | null | undefined>(undefined);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    domainsApi.list(mentorId).then((d) => { setData(d); setError(""); }).catch((e) => { setData(null); setError(errorMessage(e)); });
  }, [mentorId]);
  useEffect(reload, [reload]);
  return { data, setData, error, setError, reload };
}

const money = (v: number) => `${v.toLocaleString("vi-VN")} đ / giờ`;

function StateBadge({ d }: { d: MentorDomain }) {
  if (d.state === "VERIFIED") return <Badge tone="success">Đã xác thực{d.verifiedAt ? ` ${formatDate(d.verifiedAt)}` : ""}</Badge>;
  if (d.state === "PENDING") return <Badge tone="warning">Đang xác thực</Badge>;
  return <Badge tone="danger">Chưa đạt</Badge>;
}

function DomainItem({ d, busy, canSetPrimary, onPrimary, onRemove, onRate, onAccepting }: {
  d: DomainView; busy: boolean; canSetPrimary: boolean; onPrimary: () => void; onRemove: () => void;
  onRate: (rate: number) => Promise<boolean>; onAccepting: (accepting: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [rate, setRate] = useState("");
  const name = domainLabel(d.domain);
  const accepting = d.accepting !== false;
  const retryLater = d.retryAt && new Date(d.retryAt).getTime() > Date.now();
  return (
    <article className="dom-item" data-state={d.state} data-primary={d.primary} aria-label={`Lĩnh vực ${name}`}>
      <div className="dom-head">
        {d.state === "REJECTED" && d.testScore != null
          ? <span className="pf-ico dom-ico-fail" style={{ width: 52, height: 52, borderRadius: 14 }} aria-hidden="true">{d.testScore}%</span>
          : <span className={`pf-ico${d.state === "PENDING" ? " dom-ico-wait" : ""}`} style={{ width: 52, height: 52, borderRadius: 14 }} aria-hidden="true">{d.state === "PENDING" ? <Server /> : <Layers />}</span>}
        <div className="min-w-0 flex-1">
          <div className="dom-title">
            <h2>{name}</h2>
            {d.primary && <Badge tone="accent">Lĩnh vực chính</Badge>}
            <StateBadge d={d} />
          </div>
          {d.summary && <div className="dom-sub">{d.summary}</div>}
        </div>
      </div>

      {d.state === "VERIFIED" && (
        <div className="dom-stats">
          <div className="dom-stat"><div className="dom-stat-label">Mức phí</div><b>{d.hourlyRate ? money(d.hourlyRate) : "Chưa đặt"}</b></div>
          <div className="dom-stat"><div className="dom-stat-label">Phiên đã dạy</div><b>{d.sessionsTaught ?? 0}</b></div>
          <div className="dom-stat"><div className="dom-stat-label">Đánh giá</div><b>{d.rating ? `★ ${d.rating.toFixed(1)}` : "Chưa có"}</b></div>
          <div className="dom-stat"><div className="dom-stat-label">Đang nhận</div><b>{accepting ? `Có${d.slotsLeft != null ? ` · còn ${d.slotsLeft} chỗ` : ""}` : "Tạm ngưng"}</b></div>
        </div>
      )}

      {d.state === "VERIFIED" && editing && (
        <form className="dom-rate-edit" onSubmit={async (e) => {
          e.preventDefault();
          if (await onRate(Number(rate.replace(/\D/g, "")))) setEditing(false);
        }}>
          <Field label={`Mức phí ${name} (đ / giờ)`} hint="Mức phí, lịch rảnh và số chỗ đặt riêng từng lĩnh vực." className="flex-1">
            <Input inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} autoFocus />
          </Field>
          <Button type="submit" variant="primary" disabled={busy || !rate.trim()}>Lưu</Button>
          <Button onClick={() => setEditing(false)} disabled={busy}>Huỷ</Button>
        </form>
      )}

      {d.state === "PENDING" && (
        <>
          {d.steps && (
            <ol className="dom-steps" aria-label={`Các bước xác thực ${name}`}>
              {d.steps.map((s, i) => (
                <li key={s.key} className="dom-step" data-state={s.state}>
                  <span className="dom-step-dot" aria-hidden="true">{s.state === "DONE" ? <Check /> : i + 1}</span>
                  <span><b>{s.label}</b><span className="dom-step-note">{s.note}</span></span>
                </li>
              ))}
            </ol>
          )}
          <div className="dom-note">Lĩnh vực này chưa hiện công khai và chưa nằm trong gợi ý cho mentee. Các lĩnh vực đã xác thực vẫn hoạt động bình thường.</div>
        </>
      )}

      {d.state === "REJECTED" && (
        <div className="dom-note">
          {d.testScore != null && <b>Điểm phỏng vấn {d.testScore}%. </b>}
          {d.rejectedReason || "Lĩnh vực này chưa đạt yêu cầu xác thực."}{" "}
          {d.retryAt && (retryLater ? `Bạn làm lại được từ ${formatDate(d.retryAt)}.` : "Bạn có thể làm lại ngay.")}
        </div>
      )}

      <div className="dom-actions">
        {d.state === "VERIFIED" && !editing && (
          <Button icon={Pencil} disabled={busy} onClick={() => { setRate(String(d.hourlyRate ?? "")); setEditing(true); }} aria-label={`Sửa mức phí ${name}`}>Sửa mức phí</Button>
        )}
        {d.state === "VERIFIED" && (
          <Button icon={accepting ? Pause : Play} disabled={busy} onClick={() => onAccepting(!accepting)} aria-label={`${accepting ? "Tạm ngưng nhận" : "Nhận lại"} lĩnh vực ${name}`}>
            {accepting ? "Tạm ngưng nhận lĩnh vực này" : "Nhận mentee trở lại"}
          </Button>
        )}
        {d.state === "VERIFIED" && !d.primary && canSetPrimary && (
          <Button icon={Star} disabled={busy} onClick={onPrimary} aria-label={`Đặt ${name} làm lĩnh vực chính`}>Đặt làm chính</Button>
        )}
        {d.state === "PENDING" && <ButtonLink href={interviewHref(d.domain)} variant="primary">Tiếp tục xác thực</ButtonLink>}
        {d.state === "REJECTED" && (retryLater
          ? <Button variant="primary" disabled>Phỏng vấn lại · mở {formatDate(d.retryAt)}</Button>
          : <ButtonLink href={interviewHref(d.domain)} variant="primary">Phỏng vấn lại</ButtonLink>)}
        {!d.primary && (
          <Button variant="danger-quiet" icon={Trash2} disabled={busy} onClick={onRemove} aria-label={`${d.state === "VERIFIED" ? "Gỡ" : "Huỷ"} lĩnh vực ${name}`}>
            {d.state === "VERIFIED" ? "Gỡ lĩnh vực" : "Huỷ thêm lĩnh vực này"}
          </Button>
        )}
      </div>
    </article>
  );
}

/** Trang quản lý: danh sách, đặt chính, gỡ, thêm mới. */
export default function DomainManager({ mentorId }: { mentorId: Uuid }) {
  const { data, setData, error, setError, reload } = useMentorDomains(mentorId);
  const [busy, setBusy] = useState(false);
  const [dialog, ask] = useDialog();

  if (data === undefined) return <Loading />;
  if (!data) return <Alert title="Không tải được danh sách lĩnh vực" action={<Button onClick={reload}>Thử lại</Button>}>{error}</Alert>;

  const max = data.max || MAX_MENTOR_DOMAINS;
  const left = max - data.domains.length;
  const verifiedCount = data.domains.filter((d) => d.state === "VERIFIED").length;

  async function run(action: () => Promise<MentorDomainsResponse>) {
    setBusy(true); setError("");
    try { setData(await action()); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  async function remove(d: MentorDomain) {
    const name = domainLabel(d.domain);
    const ok = await ask({
      title: d.state === "VERIFIED" ? `Gỡ lĩnh vực ${name}?` : `Huỷ thêm lĩnh vực ${name}?`,
      message: d.state === "VERIFIED"
        ? "Nhãn lĩnh vực sẽ biến mất khỏi hồ sơ công khai và bạn không còn trong gợi ý cho lĩnh vực này. Muốn quay lại phải xác thực lại."
        : "Tiến độ xác thực của lĩnh vực này sẽ bị xoá. Các lĩnh vực khác không bị ảnh hưởng.",
      confirmText: d.state === "VERIFIED" ? "Gỡ lĩnh vực" : "Huỷ thêm",
      cancelText: "Giữ lại",
      danger: true,
    });
    if (ok) run(() => domainsApi.remove(mentorId, d.domain));
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      {dialog}
      <div className="flex min-w-0 flex-col gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="dom-list">
          {data.domains.map((d) => (
            <DomainItem key={d.domain} d={d as DomainView} busy={busy} canSetPrimary={verifiedCount > 1}
              onRate={async (rate) => { setBusy(true); setError(""); try { setData(await domainsApi.update(mentorId, d.domain, { hourlyRate: rate })); return true; } catch (e) { setError(errorMessage(e)); return false; } finally { setBusy(false); } }}
              onAccepting={(accepting) => run(() => domainsApi.update(mentorId, d.domain, { accepting }))}
              onPrimary={() => run(() => domainsApi.setPrimary(mentorId, d.domain))} onRemove={() => remove(d)} />
          ))}
        </div>
        <Link href={left > 0 ? "/profile/domains/add" : "#"} className="dom-add dom-add-link" aria-disabled={left <= 0} tabIndex={left <= 0 ? -1 : undefined}
          onClick={(e) => { if (left <= 0) e.preventDefault(); }} aria-label="Thêm một lĩnh vực mới">
          <Plus aria-hidden="true" />
          <span className="flex-1">
            <b>Thêm một lĩnh vực mới</b>
            <span className="block text-small text-ink-muted">
              {left > 0 ? `Tải CV mới và phỏng vấn AI riêng cho lĩnh vực đó. Còn thêm được ${left} lĩnh vực nữa (tối đa ${max}).` : `Bạn đã đạt tối đa ${max} lĩnh vực. Gỡ một lĩnh vực để thêm lĩnh vực khác.`}
            </span>
          </span>
          {left > 0 && <span className="btn btn-primary">Bắt đầu</span>}
        </Link>
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader title="Cách hoạt động" />
          <CardBody>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-small text-ink-muted">
              <li>Mỗi lĩnh vực có CV và một buổi phỏng vấn AI riêng (tối đa 30 phút).</li>
              <li>Lĩnh vực cũ <b>không bị ảnh hưởng</b> khi bạn thêm lĩnh vực mới.</li>
              <li>Chỉ lĩnh vực đã xác thực mới hiện trên hồ sơ và trong gợi ý.</li>
              <li>Mức phí, lịch rảnh và số chỗ có thể đặt riêng cho từng lĩnh vực.</li>
              <li>Tối đa {max} lĩnh vực; một trong số đó là lĩnh vực chính.</li>
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Mentee thấy gì" />
          <CardBody>
            <p className="text-small text-ink-muted">
              Hồ sơ hiện nhãn các lĩnh vực đã xác thực
              {data.domains.filter((d) => d.state === "VERIFIED").map((d) => <Badge key={d.domain} tone="accent">{domainLabel(d.domain)}</Badge>)}
              {" "}và khi đặt lịch, mentee chọn lĩnh vực muốn học. Đánh giá được tính theo từng lĩnh vực.
            </p>
          </CardBody>
        </Card>
        <section className="dom-warn" aria-label="Lưu ý">
          <b>Lưu ý:</b> nếu một lĩnh vực bị từ chối, các lĩnh vực đã xác thực khác vẫn hoạt động. Vi phạm nghiêm trọng (gian lận khi phỏng vấn) có thể ảnh hưởng đến toàn bộ tài khoản.
        </section>
      </aside>

    </div>
  );
}

/** Thẻ gọn "Lĩnh vực của tôi" cho trang /profile (nhánh mentor). */
export function DomainsSummaryCard({ mentorId }: { mentorId: Uuid }) {
  const { data } = useMentorDomains(mentorId);
  return (
    <Card>
      <CardHeader title="Lĩnh vực của tôi" actions={<Link href="/profile/domains" className="btn btn-sm">Quản lý</Link>} />
      <CardBody>
        {data === undefined ? <Loading /> : !data ? (
          <p className="text-small text-ink-muted">Chưa tải được danh sách lĩnh vực.</p>
        ) : (
          <>
            <ul className="dom-summary" aria-label="Lĩnh vực của tôi">
              {data.domains.map((d) => (
                <li key={d.domain}>
                  <b>{domainLabel(d.domain)}</b>
                  {d.primary && <Badge tone="accent">Chính</Badge>}
                  {d.state === "VERIFIED" ? <Badge tone="success">Đã xác thực</Badge> : d.state === "PENDING" ? <Badge tone="warning">Đang xác thực</Badge> : <Badge tone="danger">Chưa đạt</Badge>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-small text-ink-muted">Có thể có tối đa {data.max} lĩnh vực, mỗi lĩnh vực xác thực riêng.</p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
