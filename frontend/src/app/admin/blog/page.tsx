"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { ExternalLink, FileText, Search } from "lucide-react";
import { Alert, Button, ButtonLink, Card, EmptyState, Field, FlashAlerts, Input, Loading, Modal, PageHeader, Table, Tabs, Textarea, useDialog, type Flash } from "@/components/ui";
import { blogApi } from "@/features/learning/blogApi";
import { loadBlogOverview, takedownPost, type BlogOverview, type BlogRow } from "@/features/modx/api";
import { errorMessage } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";

type Tab = "reported" | "published" | "removed";

/** Hộp thoại xem xét bài bị báo cáo: danh sách báo cáo, đọc bài, lý do gỡ, bỏ qua / gỡ. */
function ReviewDialog({ row, onClose, onDone }: { row: BlogRow; onClose: () => void; onDone: (m: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dialog, ask] = useDialog();

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onDone(ok);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <>
      {dialog}
      <Modal title={row.title} onClose={onClose} width={520}
        footer={<>
          <Button disabled={busy} onClick={() => run(() => Promise.all(row.reports.map((r) => blogApi.admin.resolve(r.id))), "Đã bỏ qua báo cáo.")}>Bỏ qua báo cáo</Button>
          <Button variant="danger" loading={busy} onClick={() => {
            if (reason.trim().length < 10) return setError("Lý do gỡ cần tối thiểu 10 ký tự.");
            run(() => takedownPost(row, reason.trim()), "Đã gỡ bài viết.");
          }}>Gỡ bài</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <div className="text-small text-ink-muted">{row.authorName} · {row.reports.length} báo cáo</div>
          <Alert>{error}</Alert>
          <ul className="flex flex-col gap-2">
            {row.reports.map((r) => (
              <li key={r.id} className="rounded-md bg-surface-sunken px-3.5 py-2.5 text-small leading-relaxed">
                <div className="flex items-start justify-between gap-2">
                  <span><b>{r.targetType === "COMMENT" ? "Bình luận" : "Bài viết"}:</b> {r.reason}{r.excerpt && <> &ldquo;{r.excerpt}&rdquo;</>}</span>
                  {r.targetType === "COMMENT" && (
                    <Button size="sm" variant="danger-quiet" disabled={busy} onClick={async () => {
                      if (await ask({ title: "Gỡ bình luận này?", message: r.excerpt, confirmText: "Gỡ bình luận", danger: true })) {
                        run(() => blogApi.admin.removeComment(r.targetId), "Đã gỡ bình luận.");
                      }
                    }}>Gỡ bình luận</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {row.slug && <ButtonLink variant="ghost" size="sm" icon={ExternalLink} href={`/blog/${row.slug}`} target="_blank">Đọc bài đầy đủ</ButtonLink>}
          <Field label="Lý do gỡ" hint="Gửi tới tác giả, tối thiểu 10 ký tự." id="takedown-reason">
            <Textarea id="takedown-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="adm-callout">Sau khi gỡ, tác giả thấy lý do và không thể đăng lại bài này.</div>
        </div>
      </Modal>
    </>
  );
}

function ReasonDialog({ row, onClose }: { row: BlogRow; onClose: () => void }) {
  return (
    <Modal title="Lý do gỡ bài" onClose={onClose} width={440} footer={<Button onClick={onClose}>Đóng</Button>}>
      <div className="flex flex-col gap-2 text-small">
        <b>{row.title}</b>
        <span className="text-ink-muted">{row.authorName}{row.removedAt && ` · gỡ ${formatDateTime(row.removedAt)}`}</span>
        <p className="adm-quote">{row.removeReason || "Không có lý do được ghi lại."}</p>
      </div>
    </Modal>
  );
}

const fmtViews = (n: number) => n.toLocaleString("vi-VN");

function BlogModeration() {
  const [data, setData] = useState<BlogOverview | null>(null);
  const [flash, setFlash] = useState<Flash>({});
  const [tab, setTab] = useState<Tab>("reported");
  const [q, setQ] = useState("");
  const [review, setReview] = useState<BlogRow | null>(null);
  const [reason, setReason] = useState<BlogRow | null>(null);

  const load = useCallback(() => {
    loadBlogOverview().then((d) => { setData(d); if (d.error) setFlash({ error: d.error }); });
  }, []);
  useEffect(load, [load]);

  const counts = useMemo(() => ({
    reported: data?.rows.filter((r) => r.status === "PUBLISHED" && r.reports.length).length ?? 0,
    published: data?.rows.filter((r) => r.status === "PUBLISHED").length ?? 0,
    removed: data?.rows.filter((r) => r.status === "REMOVED").length ?? 0,
  }), [data]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.rows ?? [])
      .filter((r) => (tab === "reported" ? r.status === "PUBLISHED" && r.reports.length > 0 : tab === "published" ? r.status === "PUBLISHED" : r.status === "REMOVED"))
      .filter((r) => !needle || `${r.title} ${r.authorName}`.toLowerCase().includes(needle));
  }, [data, tab, q]);

  return (
    <>
      {review && <ReviewDialog row={review} onClose={() => setReview(null)} onDone={(m) => { setReview(null); setFlash({ ok: m }); load(); }} />}
      {reason && <ReasonDialog row={reason} onClose={() => setReason(null)} />}
      <PageHeader title="Kiểm duyệt blog" description="Xem bài đã đăng, xử lý báo cáo và gỡ bài vi phạm. Tác giả không thể đăng lại bài đã bị gỡ." />
      {data && (
        <div className="adm-kpis mb-4">
          <div className="adm-kpi"><div className="l">Bài đã đăng</div><div className="v">{data.published}</div></div>
          <div className="adm-kpi" style={data.pendingReports ? { background: "var(--warning-soft, #fdf3df)" } : undefined}><div className="l">Có báo cáo chờ xử lý</div><div className="v">{data.pendingReports}</div></div>
          <div className="adm-kpi"><div className="l">Đã gỡ tháng này</div><div className="v">{data.removedThisMonth}</div></div>
          <div className="adm-kpi"><div className="l">Tác giả hoạt động</div><div className="v">{data.activeAuthors}</div></div>
        </div>
      )}
      <FlashAlerts flash={flash} className="mb-4" />
      <div className="adm-toolbar">
        <div className="grow">
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <Input aria-label="Tìm bài" placeholder="Tìm tiêu đề hoặc tác giả" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: "reported", label: "Có báo cáo", count: counts.reported },
          { id: "published", label: "Đã đăng", count: counts.published },
          { id: "removed", label: "Đã gỡ", count: counts.removed },
        ]} />
      </div>
      {!data ? <Loading /> : shown.length === 0 ? <EmptyState icon={FileText} title="Không có bài viết nào" /> : (
        <Card>
          <Table>
            <thead><tr><th>Bài viết</th><th>Tác giả</th><th>Lượt xem</th><th>Báo cáo</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={`align-top ${r.reports.length ? "adm-row-hot" : ""}`}>
                  <td className="min-w-[240px]">
                    <b>{r.title}</b>
                    <div className="text-small text-ink-muted">
                      {r.status === "REMOVED" ? `Gỡ ${formatDate(r.removedAt)}${r.removeReason ? ` · ${r.removeReason}` : ""}` : r.publishedAt ? `Đăng ${formatDate(r.publishedAt)}` : "Chưa rõ ngày đăng"}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">{r.authorName}</td>
                  <td className="whitespace-nowrap tabular">{r.status === "REMOVED" ? "—" : fmtViews(r.views)}</td>
                  <td>{r.reports.length ? <span className={`adm-pill ${r.reports.length >= 3 ? "danger" : "warning"}`}>{r.reports.length} báo cáo</span> : <span className="text-small text-ink-muted">{r.status === "REMOVED" ? "—" : "Không"}</span>}</td>
                  <td><span className={`adm-pill ${r.status === "REMOVED" ? "danger" : "success"}`}>{r.status === "REMOVED" ? "Đã gỡ" : "Đã đăng"}</span></td>
                  <td className="actions">
                    {r.status === "REMOVED" ? <Button size="sm" onClick={() => setReason(r)}>Xem lý do</Button>
                      : r.reports.length ? <Button size="sm" variant="primary" onClick={() => setReview(r)}>Xem xét</Button>
                        : r.slug ? <ButtonLink size="sm" href={`/blog/${r.slug}`}>Xem</ButtonLink> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}

export default function AdminBlogPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <BlogModeration />
    </RequireAuth>
  );
}
