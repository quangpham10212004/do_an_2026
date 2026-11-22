"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Heart, MessageSquare, PenLine, UserPlus, UserCheck } from "lucide-react";
import { Button } from "@/components/ui";
import { blogApi } from "@/features/learning/blogApi";
import { formatDateTime } from "@/lib/format";
import type { BlogAuthor, BlogPostSummary } from "@/types";
import type { LucideIcon } from "lucide-react";

export interface ProfileTab { id: string; label: string; count?: number }

/** Thẻ đầu trang cá nhân: ảnh bìa, ảnh đại diện vuông, tên, mô tả, nút hành động và các tab neo. */
export function ProfileHero({ name, avatarUrl, badges, headline, meta, social, actions, tabs, active }: {
  name: string; avatarUrl?: string | null; badges?: ReactNode; headline?: string | null; meta?: ReactNode; social?: ReactNode; actions?: ReactNode;
  tabs: ProfileTab[]; active: string;
}) {
  const initials = name.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div className="pf-card">
      <div className="pf-cover" aria-hidden="true" />
      <div className="pf-body">
        <div className="pf-avatar" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- ảnh đại diện từ API (URL động) */}
          {avatarUrl ? <img src={avatarUrl} alt="" /> : initials}
        </div>
        <h1 className="pf-name">{name}{badges}</h1>
        {headline && <p className="pf-headline">{headline}</p>}
        {meta && <p className="pf-meta">{meta}</p>}
        {social && <div className="pf-social">{social}</div>}
        {actions && <div className="pf-actions">{actions}</div>}
      </div>
      <nav className="pf-tabs" aria-label="Mục hồ sơ">
        {tabs.map((t) => (
          <a key={t.id} href={`#${t.id}`} aria-current={active === t.id ? "true" : undefined}>
            {t.label}{t.count != null && <span className="ml-1 text-small text-ink-subtle">{t.count}</span>}
          </a>
        ))}
      </nav>
    </div>
  );
}

/** Mục có icon trong ô vuông bo góc, tiêu đề đậm và phần thân. */
export function Section({ id, icon: Icon, title, actions, children, foot }: {
  id?: string; icon: LucideIcon; title: ReactNode; actions?: ReactNode; children: ReactNode; foot?: ReactNode;
}) {
  return (
    <section id={id} className="pf-section">
      <div className="pf-section-head">
        <h2><span className="pf-ico"><Icon aria-hidden="true" /></span>{title}</h2>
        {actions}
      </div>
      <div className="pf-section-body">{children}</div>
      {foot}
    </section>
  );
}

/** Nút Theo dõi tác giả blog (dùng chung cho mentor và mentee). Ẩn khi xem chính mình. */
export function FollowButton({ userId, self, onChange }: { userId: string; self: boolean; onChange?: (a: BlogAuthor) => void }) {
  const [author, setAuthor] = useState<BlogAuthor | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    blogApi.author(userId).then(setAuthor).catch(() => setAuthor(null));
  }, [userId]);
  useEffect(() => { if (author) onChange?.(author); }, [author, onChange]);
  if (self || !author) return null;
  const toggle = async () => {
    setBusy(true);
    try {
      await blogApi.follow(userId, !author.following);
      setAuthor({ ...author, following: !author.following, followerCount: author.followerCount + (author.following ? -1 : 1) });
    } catch { /* giữ nguyên trạng thái cũ */ } finally { setBusy(false); }
  };
  return (
    <Button variant={author.following ? "secondary" : "primary"} icon={author.following ? UserCheck : UserPlus} loading={busy} onClick={toggle} aria-pressed={author.following}>
      {author.following ? "Đang theo dõi" : "Theo dõi"}
    </Button>
  );
}

/** Danh sách bài viết gần đây của một người, dùng trong tab "Bài viết" của trang cá nhân. */
export function ProfilePosts({ userId, total, self }: { userId: string; total?: number; self?: boolean }) {
  const [posts, setPosts] = useState<BlogPostSummary[] | null>(null);
  useEffect(() => {
    blogApi.posts({ author: userId, size: 3 }).then((p) => setPosts(p.items)).catch(() => setPosts([]));
  }, [userId]);
  return (
    <Section id="bai-viet" icon={PenLine} title={<>Bài viết{total != null ? ` · ${total}` : ""}</>}
      actions={self ? <Link href="/blog/me" className="text-small text-ink-subtle">Bài của tôi (gồm cả bản nháp)</Link> : undefined}
      foot={posts && posts.length > 0 ? <Link href={`/blog?author=${userId}`} className="pf-section-foot">Xem tất cả bài viết →</Link> : undefined}>
      {posts === null && <p className="text-small text-ink-muted">Đang tải…</p>}
      {posts?.length === 0 && <p className="text-small text-ink-muted">Chưa có bài viết nào.</p>}
      <div className="flex flex-col gap-3">
        {posts?.map((p) => (
          <Link key={p.id} href={`/blog/${p.slug}`} className="pf-post">
            <div className="pf-post-cover">
              {/* eslint-disable-next-line @next/next/no-img-element -- ảnh bìa từ API */}
              {p.coverUrl && <img src={p.coverUrl} alt="" />}
            </div>
            <div className="min-w-0 flex-1" style={{ flexBasis: 240 }}>
              {p.tags[0] && <span className="badge badge-plain badge-accent">{p.tags[0]}</span>}
              <div className="mt-1.5 text-title-3 font-semibold">{p.title}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-subtle">
                <span>{p.publishedAt ? formatDateTime(p.publishedAt) : "Chưa đăng"} · {p.readingMinutes} phút</span>
                <span className="inline-flex items-center gap-1"><Heart aria-hidden="true" className="size-3.5" />{p.likeCount}</span>
                <span className="inline-flex items-center gap-1"><MessageSquare aria-hidden="true" className="size-3.5" />{p.commentCount}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
}
