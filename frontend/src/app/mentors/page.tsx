"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Search, Sparkles, Users } from "lucide-react";
import { Alert, Avatar, Badge, Button, ButtonLink, Checkbox, Chip, Chips, EmptyState, Input, Loading, PageHeader, Pagination, Select, Stars, StatusBadge } from "@/components/ui";
import { DOMAINS, domainLabel, mentorStatusText, profileApi, publicMentorStatusText } from "@/features/profile/api";
import { errorMessage } from "@/lib/api";
import { formatRate } from "@/lib/format";
import type { MentorCard, PageResponse, SessionUser } from "@/types";

const PAGE_SIZE = 12;
const MAX_SKILLS = 6;

function MentorCardView({ m, showStatus }: { m: MentorCard; showStatus: boolean }) {
  const available = m.isAvailable;
  return (
    <Link href={`/mentors/${m.userId}`} className="card flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <Avatar name={m.displayName} src={m.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-title-3 font-semibold text-ink">{m.displayName}</div>
          {m.headline && <div className="line-clamp-2 text-small text-ink-muted">{m.headline}</div>}
          <div className="mt-1">
            {m.ratingCount >= 3 /* US-41 (PRD-REV-5) */
              ? <Stars value={m.rating} count={m.ratingCount} />
              : <Badge tone="accent">Mentor mới</Badge>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-small text-ink-muted">
        {m.domain && <span>{domainLabel(m.domain)}</span>}
        <span>{m.yearsExperience} năm kinh nghiệm</span>
        <span className="font-medium text-ink tabular">{formatRate(m.hourlyRate)}</span>
      </div>
      {m.skills?.length > 0 && (
        <Chips>
          {m.skills.slice(0, MAX_SKILLS).map((s) => <Chip key={s}>{s}</Chip>)}
          {m.skills.length > MAX_SKILLS && <Chip>+{m.skills.length - MAX_SKILLS}</Chip>}
        </Chips>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {showStatus && <StatusBadge status={m.verificationStatus} />}
        {available === false ? (
          <Badge tone={m.status === "SUSPENDED" ? "danger" : "neutral"}>{(showStatus ? mentorStatusText : publicMentorStatusText)(m.status, m.onLeaveUntil)}</Badge>
        ) : m.hasCapacity === false ? (
          <Badge tone="warning">Đã đủ mentee</Badge>
        ) : (
          <Badge tone="success">Đang nhận mentee</Badge>
        )}
      </div>
    </Link>
  );
}

type FilterPatch = Partial<{ q: string; domain: string; page: number; all: string }>;

function MentorBrowser({ user }: { user: SessionUser }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") || "";
  const domain = params.get("domain") || "";
  const page = Math.max(0, Number(params.get("page")) || 0);
  const isAdmin = user.role === "ADMIN";
  const includeUnverified = isAdmin && params.get("all") === "1";

  const [keyword, setKeyword] = useState(q);
  const [data, setData] = useState<PageResponse<MentorCard> | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => setKeyword(q), [q]);

  useEffect(() => {
    let active = true;
    setData(undefined);
    setError("");
    profileApi
      .searchMentors({ q, domain, page, size: PAGE_SIZE, includeUnverified })
      .then((res) => active && setData(res))
      .catch((e: unknown) => {
        if (!active) return;
        setError(errorMessage(e));
        setData(null);
      });
    return () => {
      active = false;
    };
  }, [q, domain, page, includeUnverified, reloadKey]);

  /** Bộ lọc nằm trên URL để giữ trạng thái khi quay lại từ trang hồ sơ mentor. */
  function update(patch: FilterPatch) {
    const next = { q, domain, page: 0, all: includeUnverified ? "1" : "", ...patch };
    const qs = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => {
      if (v !== "" && v !== 0 && v != null) qs.set(k, String(v));
    });
    const s = qs.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    update({ q: keyword.trim() });
  }

  const filtered = q || domain;

  return (
    <>
      <PageHeader
        title="Danh sách mentor"
        description={isAdmin ? "Tra cứu toàn bộ hồ sơ mentor trên hệ thống." : "Mentor đã được xác thực qua AI Interview. Lọc theo lĩnh vực hoặc tìm theo tên."}
        actions={user.role === "MENTEE" && <ButtonLink href="/matching" icon={Sparkles}>Gợi ý bằng AI</ButtonLink>}
      />

      <form className="mb-6 flex flex-wrap items-center gap-2" onSubmit={submit}>
        <div className="relative w-full max-w-[360px]">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
          <Input type="search" placeholder="Tìm theo tên hoặc giới thiệu" aria-label="Từ khoá" value={keyword} maxLength={100}
            onChange={(e) => setKeyword(e.target.value)} className="pl-9" />
        </div>
        <Select aria-label="Lĩnh vực" value={domain} onChange={(e) => update({ q: keyword.trim(), domain: e.target.value })} className="w-auto min-w-[200px]">
          <option value="">Mọi lĩnh vực</option>
          {DOMAINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Button type="submit" variant="primary">Tìm</Button>
        {filtered && (
          <Button variant="ghost" onClick={() => { setKeyword(""); update({ q: "", domain: "" }); }}>Xoá bộ lọc</Button>
        )}
        {isAdmin && (
          <Checkbox className="ml-2" label="Gồm cả mentor chưa xác thực" checked={includeUnverified} onChange={(e) => update({ all: e.target.checked ? "1" : "" })} />
        )}
      </form>

      {data === undefined && <Loading text="Đang tải danh sách mentor…" />}
      {error && (
        <Alert action={<Button size="sm" variant="ghost" onClick={() => setReloadKey((k) => k + 1)}>Thử lại</Button>}>
          {error || "Không tải được danh sách mentor."}
        </Alert>
      )}
      {data && (
        <>
          {data.items.length === 0 ? (
            <div className="card">
              <EmptyState icon={Users} title={filtered ? "Không có mentor nào khớp bộ lọc" : "Chưa có mentor nào được xác thực"}
                action={user.role === "MENTEE" && <ButtonLink href="/matching" icon={Sparkles} size="sm">Thử AI Matching</ButtonLink>}>
                {filtered ? "Thử từ khoá hoặc lĩnh vực khác." : "Mentor xuất hiện ở đây sau khi được quản trị viên duyệt."}
              </EmptyState>
            </div>
          ) : (
            <>
              <p className="mb-3 text-small text-ink-muted">Tìm thấy {data.totalItems} mentor{filtered ? " phù hợp bộ lọc" : ""}.</p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {data.items.map((m) => <MentorCardView key={m.userId} m={m} showStatus={isAdmin} />)}
              </div>
            </>
          )}
          {data.totalPages > 1 && (
            <div className="card mt-6">
              <Pagination page={data.page} totalPages={data.totalPages} onChange={(p) => { update({ page: p }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function MentorsPage() {
  return (
    <RequireAuth>
      {(user) => (
        <Suspense fallback={<Loading />}>
          <MentorBrowser user={user} />
        </Suspense>
      )}
    </RequireAuth>
  );
}
