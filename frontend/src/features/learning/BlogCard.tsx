import Link from "next/link";
import { Eye, Heart, MessageSquare, UserCheck, UserPlus } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { formatDate } from "@/lib/format";
import AuthorAvatar, { authorHref } from "./AuthorAvatar";
import type { BlogPostSummary } from "@/types";

export const ROLE_LABELS: Record<string, string> = { MENTOR: "Mentor", MENTEE: "Mentee", ADMIN: "Quản trị" };
const STATUS_LABELS: Record<string, string> = { DRAFT: "Nháp", UNPUBLISHED: "Đã bị gỡ" };

/** Thẻ bài viết: cả thẻ bấm được qua liên kết tiêu đề; tên tác giả là liên kết riêng tới trang cá nhân. */
export default function BlogCard({ post, href, featured, views, following, followBusy, onToggleFollow }: {
  post: BlogPostSummary;
  href?: string;
  featured?: boolean;
  /** Lượt xem (từ blogX.views). */
  views?: number;
  /** Có truyền `onToggleFollow` thì thẻ hiện nút Theo dõi cho tác giả. */
  following?: boolean;
  followBusy?: boolean;
  onToggleFollow?: () => void;
}) {
  return (
    <article className={`sc-post${featured ? " sc-post--feature" : ""}`}>
      <div className="sc-post-cover" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- ảnh bìa từ API */}
        {post.coverUrl && <img src={post.coverUrl} alt="" loading="lazy" />}
      </div>
      <div className="sc-post-body">
        <div className="sc-tags">
          {featured && <span className="sc-tag">Nổi bật</span>}
          {post.tags.slice(0, 3).map((t) => <span key={t} className="sc-tag">{t}</span>)}
          {STATUS_LABELS[post.status] && <Badge tone="warning">{STATUS_LABELS[post.status]}</Badge>}
        </div>
        <h3 className="sc-post-title"><Link href={href ?? `/blog/${post.slug}`}>{post.title}</Link></h3>
        {post.summary && <p className="sc-post-sum">{post.summary}</p>}
        <div className="sc-author">
          <AuthorAvatar userId={post.authorId} name={post.authorName} size="sm" />
          <div className="min-w-0">
            <Link href={authorHref(post.authorId, post.authorRole)}>{post.authorName}</Link>{" "}
            <Badge plain>{ROLE_LABELS[post.authorRole] ?? post.authorRole}</Badge>
            <small>{post.publishedAt ? formatDate(post.publishedAt) : "Chưa đăng"} · {post.readingMinutes} phút đọc</small>
          </div>
          {onToggleFollow && (
            <Button size="sm" variant={following ? "secondary" : "ghost"} icon={following ? UserCheck : UserPlus} loading={followBusy}
              aria-pressed={following} aria-label={`${following ? "Bỏ theo dõi" : "Theo dõi"} ${post.authorName}`} onClick={onToggleFollow}>
              {following ? "Đang theo dõi" : "Theo dõi"}
            </Button>
          )}
        </div>
        <div className="sc-post-foot">
          <span><Heart aria-hidden="true" className="size-4" /><span className="sr-only">Lượt thích: </span>{post.likeCount}</span>
          <span><MessageSquare aria-hidden="true" className="size-4" /><span className="sr-only">Bình luận: </span>{post.commentCount}</span>
          {views != null && <span><Eye aria-hidden="true" className="size-4" /><span className="sr-only">Lượt xem: </span>{views.toLocaleString("vi-VN")}</span>}
        </div>
      </div>
    </article>
  );
}
