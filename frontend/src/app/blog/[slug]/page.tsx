"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { ArrowLeft, Bookmark, Flag, Heart, MessageSquare, Pencil, Share2, Trash2 } from "lucide-react";
import { Alert, Badge, Button, ButtonLink, EmptyState, FlashAlerts, Loading, Textarea, useDialog, type Flash } from "@/components/ui";
import AuthorAvatar, { authorHref } from "@/features/learning/AuthorAvatar";
import { ROLE_LABELS } from "@/features/learning/BlogCard";
import Markdown, { TableOfContents } from "@/features/learning/Markdown";
import { blogApi } from "@/features/learning/blogApi";
import { blogX } from "@/features/socialx/api";
import { FollowButton } from "@/features/profile/ProfileParts";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import type { BlogAuthor, BlogComment, BlogPostDetail, BlogPostSummary, SessionUser } from "@/types";

function Post({ slug, me }: { slug: string; me: SessionUser }) {
  const [post, setPost] = useState<BlogPostDetail | null | undefined>(undefined);
  const [author, setAuthor] = useState<BlogAuthor | null>(null);
  const [more, setMore] = useState<BlogPostSummary[]>([]);
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [views, setViews] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<BlogComment | null>(null);
  const [flash, setFlash] = useState<Flash>({});
  const [dialog, ask] = useDialog();

  const loadComments = useCallback((id: string) => blogApi.comments(id).then(setComments).catch(() => setComments([])), []);

  useEffect(() => {
    blogApi.bySlug(slug)
      .then((p) => {
        setPost(p);
        blogApi.author(p.authorId).then(setAuthor).catch(() => setAuthor(null));
        blogApi.posts({ author: p.authorId, size: 4 }).then((r) => setMore(r.items.filter((x) => x.id !== p.id).slice(0, 3))).catch(() => setMore([]));
        if (p.status === "PUBLISHED") loadComments(p.id);
        if (p.status === "PUBLISHED" && p.authorId !== me.userId) blogX.recordView(p.id).catch(() => {});
        blogX.views([p]).then((v) => setViews(v[p.id] ?? null)).catch(() => setViews(null));
      })
      .catch((e: unknown) => { setFlash({ error: errorMessage(e) }); setPost(null); });
  }, [slug, loadComments, me.userId]);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setFlash({});
    try {
      await fn();
      if (ok) setFlash({ ok });
    } catch (e) {
      setFlash({ error: errorMessage(e) });
    }
  }

  if (post === undefined) return <Loading />;
  if (!post) return <Alert action={<ButtonLink href="/blog" size="sm">Về Blog</ButtonLink>}>{flash.error || "Không tìm thấy bài viết."}</Alert>;

  const mine = post.authorId === me.userId;
  const published = post.status === "PUBLISHED";
  const profileHref = authorHref(post.authorId, post.authorRole);

  const toggleLike = () => run(async () => {
    const s = await blogApi.like(post.id, !post.liked);
    setPost({ ...post, liked: s.liked, likeCount: s.likeCount });
  });
  const toggleBookmark = () => run(async () => {
    await blogApi.bookmark(post.id, !post.bookmarked);
    setPost({ ...post, bookmarked: !post.bookmarked });
  });
  const share = () => run(async () => {
    await navigator.clipboard.writeText(window.location.href);
  }, "Đã sao chép liên kết bài viết.");
  const submitComment = () => run(async () => {
    await blogApi.comment(post.id, text.trim(), replyTo?.id);
    setText("");
    setReplyTo(null);
    await loadComments(post.id);
    setPost((p) => (p ? { ...p, commentCount: p.commentCount + 1 } : p));
  });
  const report = async (label: string, send: (reason: string) => Promise<unknown>) => {
    const reason = await ask({ title: `Báo cáo ${label}`, message: "Mô tả ngắn vì sao nội dung này vi phạm (tối thiểu 10 ký tự).",
      input: { label: "Lý do", maxLength: 500 }, confirmText: "Gửi báo cáo" });
    if (reason) await run(() => send(reason), "Đã gửi báo cáo, quản trị viên sẽ xem xét.");
  };
  const removeComment = (c: BlogComment) => run(async () => {
    await blogApi.removeComment(c.id);
    await loadComments(post.id);
    setPost((p) => (p ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p));
  });

  return (
    <>
      {dialog}
      <Link href="/blog" className="page-header-back"><ArrowLeft aria-hidden="true" />Blog</Link>
      <div className="sc-read">
        {published && (
          <div className="sc-rail" role="group" aria-label="Tương tác với bài viết">
            <button type="button" className="sc-rail-btn" aria-pressed={post.liked} aria-label={post.liked ? "Bỏ thích bài viết" : "Thích bài viết"} onClick={toggleLike}><Heart aria-hidden="true" /></button>
            <span className="n" aria-label={`${post.likeCount} lượt thích`}>{post.likeCount}</span>
            <a href="#binh-luan" className="sc-rail-btn" aria-label="Đến phần bình luận"><MessageSquare aria-hidden="true" /></a>
            <span className="n" aria-label={`${post.commentCount} bình luận`}>{post.commentCount}</span>
            <button type="button" className="sc-rail-btn" aria-pressed={post.bookmarked} aria-label={post.bookmarked ? "Bỏ lưu bài" : "Lưu bài"} onClick={toggleBookmark}><Bookmark aria-hidden="true" /></button>
            <button type="button" className="sc-rail-btn" aria-label="Chia sẻ: sao chép liên kết" onClick={share}><Share2 aria-hidden="true" /></button>
          </div>
        )}

        <main className="pf-main" style={{ flexBasis: 560 }}>
          <FlashAlerts flash={flash} />
          {post.status === "UNPUBLISHED" && <Alert tone="warning" title="Bài đã bị quản trị viên gỡ">{post.unpublishReason}</Alert>}
          {post.status === "DRAFT" && <Alert tone="info">Đây là bản nháp, chỉ bạn xem được.</Alert>}

          <article className="sc-article">
            {post.coverUrl && (
              <div className="sc-article-cover">
                {/* eslint-disable-next-line @next/next/no-img-element -- ảnh bìa từ API */}
                <img src={post.coverUrl} alt="" />
              </div>
            )}
            <div className="sc-article-body">
              {post.tags.length > 0 && <div className="sc-tags">{post.tags.map((t) => <span key={t} className="sc-tag">{t}</span>)}</div>}
              <h1>{post.title}</h1>
              <div className="sc-byline">
                <Link href={profileHref} aria-label={`Trang cá nhân của ${post.authorName}`}><AuthorAvatar userId={post.authorId} name={post.authorName} size="lg" /></Link>
                <div className="grow">
                  <Link href={profileHref} className="name">{post.authorName}</Link>{" "}
                  <Badge tone="accent" plain>{ROLE_LABELS[post.authorRole] ?? post.authorRole}</Badge>
                  {author && <small className="tabular">{author.postCount} bài viết · {author.followerCount} người theo dõi</small>}
                  <small>{post.publishedAt ? formatDate(post.publishedAt) : "Chưa đăng"} · {post.readingMinutes} phút đọc{views != null && ` · ${views.toLocaleString("vi-VN")} lượt xem`}</small>
                </div>
                {mine ? (
                  <ButtonLink href={`/blog/edit/${post.id}`} icon={Pencil}>Chỉnh sửa</ButtonLink>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <FollowButton userId={post.authorId} self={false} onChange={setAuthor} />
                    <ButtonLink href={profileHref} variant="ghost">Xem trang cá nhân</ButtonLink>
                  </div>
                )}
              </div>
              <Markdown source={post.contentMd} />
              {published && (
                <div className="sc-reactions">
                  <Button icon={Heart} variant={post.liked ? "primary" : "secondary"} aria-pressed={post.liked} onClick={toggleLike}>{post.liked ? "Đã thích" : "Thích"} · {post.likeCount}</Button>
                  <span className="text-small text-ink-muted">Bài viết có ích với bạn?</span>
                  {!mine && <Button variant="ghost" icon={Flag} onClick={() => report("bài viết", (r) => blogApi.reportPost(post.id, r))}>Báo cáo bài viết</Button>}
                </div>
              )}
            </div>
          </article>

          <section className="sc-about" aria-label="Về tác giả">
            <Link href={profileHref} tabIndex={-1} aria-hidden="true"><AuthorAvatar userId={post.authorId} name={post.authorName} size="xl" /></Link>
            <div className="grow">
              <div className="text-small text-ink-subtle">Viết bởi</div>
              <Link href={profileHref} className="font-bold text-ink">{post.authorName}</Link>
              {author && <p className="text-small text-ink-muted tabular">{author.postCount} bài viết · {author.followerCount} người theo dõi</p>}
            </div>
            {!mine && post.authorRole === "MENTOR" && <ButtonLink href={`/mentoring/request/${post.authorId}`}>Gửi yêu cầu mentoring</ButtonLink>}
          </section>

          {published && (
            <section id="binh-luan" className="pf-section">
              <div className="pf-section-head"><h2><span className="pf-ico"><MessageSquare aria-hidden="true" /></span>Bình luận ({post.commentCount})</h2></div>
              <div className="pf-section-body flex flex-col gap-5">
                <form className="sc-comment-form" onSubmit={(e) => { e.preventDefault(); if (text.trim()) submitComment(); }}>
                  <AuthorAvatar userId={me.userId} name={me.fullName ?? "Bạn"} size="sm" />
                  <div className="grow">
                    {replyTo && <div className="text-small text-ink-muted">Đang trả lời {replyTo.authorName} · <button type="button" className="min-h-11 underline" onClick={() => setReplyTo(null)}>Huỷ</button></div>}
                    <Textarea aria-label="Viết bình luận" rows={3} maxLength={2000} placeholder="Chia sẻ suy nghĩ của bạn…" value={text} onChange={(e) => setText(e.target.value)} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-small text-ink-subtle">Hãy bình luận lịch sự và đúng chủ đề</span>
                      <Button type="submit" variant="primary" disabled={!text.trim()}>Gửi</Button>
                    </div>
                  </div>
                </form>
                {comments.length === 0 ? <EmptyState icon={MessageSquare} title="Chưa có bình luận" /> : (
                  <ul className="flex flex-col gap-4">
                    {comments.map((c) => (
                      <li key={c.id} className={`sc-comment ${c.parentId ? "sc-comment--reply" : ""}`}>
                        <AuthorAvatar userId={c.authorId} name={c.authorName} size="sm" />
                        <div className="sc-comment-body">
                          <div className="sc-comment-head">
                            <b>{c.authorName}</b>
                            {c.authorId === post.authorId && <Badge tone="accent" plain>Tác giả</Badge>}
                            <span>{formatDateTime(c.createdAt)}</span>
                          </div>
                          {c.status === "REMOVED" ? <p className="mt-1 text-small italic text-ink-muted">Bình luận đã bị gỡ.</p> : (
                            <>
                              <p className="mt-1 whitespace-pre-wrap break-words">{c.body}</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {!c.parentId && <Button size="sm" variant="ghost" onClick={() => setReplyTo(c)}>Trả lời</Button>}
                                {c.authorId !== me.userId && <Button size="sm" variant="ghost" onClick={() => report("bình luận", (r) => blogApi.reportComment(c.id, r))}>Báo cáo</Button>}
                                {(c.authorId === me.userId || mine) && <Button size="sm" variant="danger-quiet" icon={Trash2} onClick={() => removeComment(c)}>Gỡ</Button>}
                              </div>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </main>

        <aside className="pf-side" aria-label="Bài viết liên quan">
          <TableOfContents source={post.contentMd} />
          {more.length > 0 && (
            <section className="pf-section">
              <div className="pf-section-head"><h2>Bài khác của tác giả</h2></div>
              <div className="pf-section-body sc-side-list">
                {more.map((p) => (
                  <Link key={p.id} href={`/blog/${p.slug}`} className="block min-h-11 text-ink hover:text-accent-ink">
                    <b>{p.title}</b>
                    <div className="text-small text-ink-subtle">{p.publishedAt ? formatDate(p.publishedAt) : "Chưa đăng"} · {p.readingMinutes} phút đọc</div>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <div className="sc-cta">
            <b>Bạn có kinh nghiệm muốn chia sẻ?</b>
            <p>Mentor và mentee đều viết được bài.</p>
            <ButtonLink href="/blog/write" variant="primary">Viết bài</ButtonLink>
          </div>
        </aside>
      </div>
    </>
  );
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const { user } = useAuth();
  return (
    <RequireAuth>
      {user && <Post slug={params.slug} me={user} />}
    </RequireAuth>
  );
}
