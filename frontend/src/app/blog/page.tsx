"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { PenLine, Search, X } from "lucide-react";
import { Alert, Button, ButtonLink, Chip, Chips, EmptyState, Input, Loading, Pagination, Tabs } from "@/components/ui";
import AuthorAvatar, { authorHref } from "@/features/learning/AuthorAvatar";
import BlogCard, { ROLE_LABELS } from "@/features/learning/BlogCard";
import { blogApi } from "@/features/learning/blogApi";
import { blogX } from "@/features/socialx/api";
import { FollowButton } from "@/features/profile/ProfileParts";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/api";
import type { BlogAuthor, BlogPostPage, BlogTag } from "@/types";

const PAGE_SIZE = 10;
/** Tab "Phổ biến": lấy một lô lớn rồi sắp theo lượt xem (backend dự kiến: GET /posts?sort=popular). */
const POPULAR_POOL = 50;
type Tab = "latest" | "popular" | "following";

function BlogHome({ meId }: { meId: string }) {
  const params = useSearchParams();
  const [author, setAuthor] = useState(params.get("author") ?? "");
  const [tab, setTab] = useState<Tab>("latest");
  const [tag, setTag] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [tags, setTags] = useState<BlogTag[]>([]);
  const [following, setFollowing] = useState<BlogAuthor[]>([]);
  // undefined = đang tải, null = lỗi
  const [data, setData] = useState<BlogPostPage | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [showAllTags, setShowAllTags] = useState(false);
  const [views, setViews] = useState<Record<string, number>>({});
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const [authorInfo, setAuthorInfo] = useState<Record<string, BlogAuthor>>({});

  useEffect(() => {
    blogApi.tags().then(setTags).catch(() => setTags([]));
  }, []);

  useEffect(() => {
    blogApi.myFollowing()
      .then((list) => { setFollowing(list); setFollowedIds(new Set(list.map((a) => a.authorId))); })
      .catch(() => setFollowing([]));
  }, [tab]);

  useEffect(() => {
    let active = true;
    setData(undefined);
    const hideUnlisted = (d: BlogPostPage): BlogPostPage => d; // server đã loại bài UNLISTED của người khác
    const load = async (): Promise<{ page: BlogPostPage; views: Record<string, number> }> => {
      if (tab === "popular") {
        const pool = hideUnlisted(await blogApi.posts({ tag, q: query, author: author || undefined, page: 0, size: POPULAR_POOL }));
        const v = await blogX.views(pool.items).catch(() => ({} as Record<string, number>));
        const sorted = [...pool.items].sort((a, b) => (v[b.id] ?? 0) - (v[a.id] ?? 0));
        return { page: { ...pool, items: sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), page, size: PAGE_SIZE, total: sorted.length }, views: v };
      }
      const res = hideUnlisted(await (tab === "following" ? blogApi.feed(page, PAGE_SIZE) : blogApi.posts({ tag, q: query, author: author || undefined, page, size: PAGE_SIZE })));
      return { page: res, views: await blogX.views(res.items).catch(() => ({} as Record<string, number>)) };
    };
    load().then((r) => { if (active) { setViews(r.views); setData(r.page); } }).catch((e: unknown) => {
      if (!active) return;
      setError(errorMessage(e));
      setData(null);
    });
    return () => { active = false; };
  }, [tab, tag, query, page, author, meId]);

  async function toggleFollow(authorId: string) {
    const on = !followedIds.has(authorId);
    setFollowBusy(authorId);
    try {
      await blogApi.follow(authorId, on);
      setFollowedIds((cur) => { const n = new Set(cur); if (on) n.add(authorId); else n.delete(authorId); return n; });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setFollowBusy(null);
    }
  }

  const shownTags = showAllTags ? tags : tags.slice(0, 8);
  // Gợi ý tác giả: lấy từ chính các bài đang hiển thị (API chưa có danh sách gợi ý riêng).
  const suggested = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; role: string }>();
    data?.items.forEach((p) => {
      if (p.authorId !== meId && !seen.has(p.authorId)) seen.set(p.authorId, { id: p.authorId, name: p.authorName, role: p.authorRole });
    });
    return Array.from(seen.values()).slice(0, 4);
  }, [data, meId]);
  useEffect(() => {
    suggested.forEach((a) => {
      if (!authorInfo[a.id]) blogApi.author(a.id).then((info) => setAuthorInfo((cur) => ({ ...cur, [a.id]: info }))).catch(() => {});
    });
  }, [suggested, authorInfo]);
  const featured = tab === "latest" && page === 0 && !tag && !query && !author;

  return (
    <>
      <section className="sc-hero">
        <div className="min-w-0">
          <h1>Blog cộng đồng MentorHub</h1>
          <p>Kinh nghiệm học và làm nghề từ mentor và mentee.</p>
        </div>
        <form className="sc-search" role="search" onSubmit={(e) => { e.preventDefault(); setTab("latest"); setPage(0); setQuery(q.trim()); }}>
          <Input aria-label="Tìm bài viết" placeholder="Tìm theo tiêu đề hoặc nội dung" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit" icon={Search}>Tìm</Button>
        </form>
      </section>

      <div className="sc-filter">
        <Tabs value={tab} onChange={(t) => { setTab(t); setPage(0); }} tabs={[
          { id: "latest", label: "Mới nhất" },
          { id: "popular", label: "Phổ biến" },
          { id: "following", label: "Đang theo dõi" },
        ]} />
        {tab !== "following" && author && (
          <Chips>
            <Chip selected onClick={() => { setAuthor(""); setPage(0); }}>Lọc theo một tác giả <X aria-hidden="true" className="size-3.5" /><span className="sr-only">Bỏ lọc</span></Chip>
          </Chips>
        )}
        {tab !== "following" && tags.length > 0 && (
          <Chips>
            <Chip selected={tag === ""} onClick={() => { setTag(""); setPage(0); }}>Tất cả</Chip>
            {shownTags.map((t) => (
              <Chip key={t.slug} selected={tag === t.slug} onClick={() => { setTag(t.slug); setPage(0); }}>{t.name} · {t.postCount}</Chip>
            ))}
            {tags.length > 8 && <Button size="sm" variant="ghost" onClick={() => setShowAllTags(!showAllTags)}>{showAllTags ? "Thu gọn" : "Xem thêm"}</Button>}
          </Chips>
        )}
      </div>

      <div className="pf-grid">
        <main className="pf-main">
          {tab === "following" && following.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Tác giả đang theo dõi">
              {following.map((a) => (
                <li key={a.authorId}>
                  <Link href={authorHref(a.authorId, a.authorRole)} className="pf-service flex min-h-11 items-center gap-2 !px-3 !py-2 text-small">
                    <AuthorAvatar userId={a.authorId} name={a.authorName} size="sm" />
                    <span className="font-medium text-ink">{a.authorName}</span>
                    <span className="text-ink-muted tabular">{a.followerCount} theo dõi</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {data === undefined ? <Loading /> : data === null ? <Alert>{error}</Alert> : data.items.length === 0 ? (
            <EmptyState title={tab === "following" ? "Bạn chưa theo dõi tác giả nào" : "Chưa có bài viết nào"}
              action={tab === "following" ? <Button onClick={() => setTab("latest")}>Khám phá tác giả</Button> : undefined}>
              {tab === "following" ? "Theo dõi để thấy bài mới của họ ở đây." : "Hãy là người đầu tiên chia sẻ."}
            </EmptyState>
          ) : (
            <>
              <div className="sc-posts">
                {data.items.map((p, i) => <BlogCard key={p.id} post={p} featured={featured && i === 0} views={views[p.id]}
                  following={followedIds.has(p.authorId)} followBusy={followBusy === p.authorId}
                  onToggleFollow={p.authorId === meId ? undefined : () => toggleFollow(p.authorId)} />)}
              </div>
              <Pagination page={data.page} totalPages={Math.ceil(data.total / data.size)} onChange={setPage} summary={`${data.total} bài viết`} />
            </>
          )}
        </main>

        <aside className="pf-side" aria-label="Gợi ý">
          {suggested.length > 0 && (
            <section className="pf-section">
              <div className="pf-section-head"><h2>Tác giả nên theo dõi</h2></div>
              <div className="pf-section-body sc-side-list">
                {suggested.map((a) => (
                  <div key={a.id} className="sc-side-row">
                    <AuthorAvatar userId={a.id} name={a.name} size="sm" />
                    <div className="grow">
                      <Link href={authorHref(a.id, a.role)}>{a.name}</Link>
                      <small>{ROLE_LABELS[a.role] ?? a.role}{authorInfo[a.id] && ` · ${authorInfo[a.id].postCount} bài · ${authorInfo[a.id].followerCount} người theo dõi`}</small>
                    </div>
                    <FollowButton userId={a.id} self={a.id === meId} />
                  </div>
                ))}
              </div>
            </section>
          )}
          {tags.length > 0 && (
            <section className="pf-section">
              <div className="pf-section-head"><h2>Tag phổ biến</h2></div>
              <div className="pf-section-body">
                <Chips>
                  {tags.slice(0, 8).map((t) => (
                    <Chip key={t.slug} selected={tag === t.slug} onClick={() => { if (tab === "following") setTab("latest"); setTag(t.slug); setPage(0); }}>{t.name} · {t.postCount}</Chip>
                  ))}
                </Chips>
              </div>
            </section>
          )}
          <div className="sc-cta">
            <b>Bạn có kinh nghiệm muốn chia sẻ?</b>
            <p>Mentor và mentee đều viết được bài.</p>
            <ButtonLink href="/blog/write" variant="primary" icon={PenLine}>Viết bài</ButtonLink>
          </div>
        </aside>
      </div>
    </>
  );
}

function BlogGate() {
  const { user } = useAuth();
  return user ? <BlogHome meId={user.userId} /> : null;
}

export default function BlogPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<Loading />}>
        <BlogGate />
      </Suspense>
    </RequireAuth>
  );
}
