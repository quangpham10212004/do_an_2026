"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { PenLine } from "lucide-react";
import { Alert, Badge, Button, ButtonLink, EmptyState, Loading, PageHeader, Tabs, useDialog } from "@/components/ui";
import { blogApi } from "@/features/learning/blogApi";
import { blogX } from "@/features/socialx/api";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { BlogPostSummary } from "@/types";

type Filter = "all" | "PUBLISHED" | "DRAFT" | "UNPUBLISHED";
const STATUS: Record<string, { label: string; tone: "success" | "neutral" | "warning" }> = {
  PUBLISHED: { label: "Đã đăng", tone: "success" },
  DRAFT: { label: "Nháp", tone: "neutral" },
  UNPUBLISHED: { label: "Bị gỡ", tone: "warning" },
};

function MyBlog() {
  const [tab, setTab] = useState<"posts" | "saved">("posts");
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<BlogPostSummary[] | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [views, setViews] = useState<Record<string, number>>({});
  const [dialog, ask] = useDialog();

  const load = useCallback(() => {
    setItems(undefined);
    (tab === "posts" ? blogApi.myPosts() : blogApi.myBookmarks())
      .then((list) => {
        setItems(list);
        blogX.views(list).then(setViews).catch(() => setViews({}));
      })
      .catch((e: unknown) => { setError(errorMessage(e)); setItems(null); });
  }, [tab]);
  useEffect(load, [load]);

  async function remove(p: BlogPostSummary) {
    if (!(await ask({ title: `Xoá bài "${p.title}"?`, message: "Bình luận và lượt thích của bài cũng bị xoá. Không thể hoàn tác.", confirmText: "Xoá", danger: true }))) return;
    try {
      await blogApi.remove(p.id);
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function unpublish(p: BlogPostSummary) {
    if (!(await ask({ title: "Gỡ đăng bài này?", message: "Bài chuyển về Nháp và không còn hiển thị công khai. Lượt xem, thích và bình luận được giữ lại khi bạn đăng lại.", confirmText: "Gỡ đăng", cancelText: "Giữ lại" }))) return;
    try {
      await blogApi.unpublish(p.id);
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const counts = useMemo(() => {
    const c = { all: 0, PUBLISHED: 0, DRAFT: 0, UNPUBLISHED: 0, likes: 0, views: 0 };
    if (tab === "posts") items?.forEach((p) => {
      c.all++;
      c[p.status]++;
      c.likes += p.likeCount;
      c.views += views[p.id] ?? 0;
    });
    return c;
  }, [items, tab, views]);
  const shown = items && tab === "posts" && filter !== "all" ? items.filter((p) => p.status === filter) : items;

  return (
    <>
      {dialog}
      <PageHeader back={{ href: "/blog", label: "Blog" }} title="Bài của tôi" description="Quản lý bài viết bạn đã đăng và các bài đã lưu."
        actions={<ButtonLink href="/blog/write" variant="primary" icon={PenLine}>Viết bài mới</ButtonLink>} />
      {tab === "posts" && items && (
        <div className="sc-stats">
          <div className="sc-stat"><div className="k">Bài đã đăng</div><div className="v">{counts.PUBLISHED}</div></div>
          <div className="sc-stat"><div className="k">Lượt xem</div><div className="v">{counts.views.toLocaleString("vi-VN")}</div></div>
          <div className="sc-stat"><div className="k">Lượt thích</div><div className="v">{counts.likes}</div></div>
          <div className="sc-stat"><div className="k">Bản nháp</div><div className="v">{counts.DRAFT}</div></div>
        </div>
      )}
      <Tabs className="mb-3" value={tab} onChange={(t) => { setTab(t); setFilter("all"); }} tabs={[{ id: "posts", label: "Bài của tôi" }, { id: "saved", label: "Đã lưu" }]} />
      {tab === "posts" && items && items.length > 0 && (
        <Tabs className="mb-4" value={filter} onChange={setFilter} tabs={[
          { id: "all", label: "Tất cả", count: counts.all },
          { id: "PUBLISHED", label: "Đã đăng", count: counts.PUBLISHED },
          { id: "DRAFT", label: "Nháp", count: counts.DRAFT },
          { id: "UNPUBLISHED", label: "Bị gỡ", count: counts.UNPUBLISHED },
        ]} />
      )}
      <Alert className="mb-4">{error}</Alert>
      {shown === undefined ? <Loading /> : shown === null ? null : shown.length === 0 ? (
        <EmptyState title={tab === "posts" ? "Bạn chưa có bài nào ở mục này" : "Chưa lưu bài nào"}
          action={tab === "posts" ? <ButtonLink href="/blog/write" variant="primary" icon={PenLine}>Viết bài mới</ButtonLink> : undefined} />
      ) : (
        <div className="sc-list">
          {shown.map((p) => {
            const st = STATUS[p.status];
            const editable = tab === "posts";
            return (
              <article key={p.id} className="sc-row">
                <div className="sc-row-cover" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element -- ảnh bìa từ API */}
                  {p.coverUrl && <img src={p.coverUrl} alt="" loading="lazy" />}
                </div>
                <div className="sc-row-main">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link className="title" href={editable && p.status !== "PUBLISHED" ? `/blog/edit/${p.id}` : `/blog/${p.slug}`}>{p.title}</Link>
                    {editable && st && <Badge tone={st.tone}>{st.label}</Badge>}
                  </div>
                  <div className="mt-1 text-small text-ink-muted tabular">
                    {p.publishedAt ? `Đăng ${formatDate(p.publishedAt)}` : "Chưa đăng"}{views[p.id] != null && ` · ${views[p.id].toLocaleString("vi-VN")} lượt xem`} · {p.likeCount} lượt thích · {p.commentCount} bình luận
                    {!editable && ` · ${p.authorName}`}
                  </div>
                  {p.tags.length > 0 && <div className="sc-tags mt-2">{p.tags.map((t) => <span key={t} className="sc-tag">{t}</span>)}</div>}
                </div>
                {editable && (
                  <div className="sc-row-actions">
                    {p.status === "PUBLISHED" && <ButtonLink href={`/blog/${p.slug}`}>Xem</ButtonLink>}
                    <ButtonLink href={`/blog/edit/${p.id}`}>{p.status === "DRAFT" ? "Tiếp tục viết" : p.status === "UNPUBLISHED" ? "Xem lý do" : "Sửa"}</ButtonLink>
                    {p.status === "PUBLISHED" && <Button onClick={() => unpublish(p)} aria-label={`Gỡ đăng: ${p.title}`}>Gỡ đăng</Button>}
                    <Button variant="danger-quiet" onClick={() => remove(p)}>Xoá</Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function MyBlogPage() {
  return (
    <RequireAuth>
      <MyBlog />
    </RequireAuth>
  );
}
