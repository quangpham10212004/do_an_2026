"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { BadgeCheck, ChevronLeft, ChevronRight, Search, SlidersHorizontal, Sparkles, Star, Users, X } from "lucide-react";
import { Alert, Avatar, Badge, Button, ButtonLink, Checkbox, Chip, Chips, EmptyState, Input, Loading, PageHeader, Select, StatusBadge } from "@/components/ui";
import FilterSheet from "@/features/matching/FilterSheet";
import FindMentorTabs from "@/features/matching/FindMentorTabs";
import { findxApi, type MentorExtra } from "@/features/findx/api";
import { DOMAINS, LANGUAGE_LABELS, SESSION_TYPE_LABELS, domainLabel, mentorStatusText, profileApi, publicMentorStatusText } from "@/features/profile/api";
import { errorMessage } from "@/lib/api";
import { formatRate } from "@/lib/format";
import type { LanguageCode, MentorCard, SessionType, SessionUser, TimeOfDay } from "@/types";

const PAGE_SIZE = 12;
const MAX_SKILLS = 6;

/** Màu ảnh bìa thẻ: cố định theo mentor để không nhảy khi tải lại. */
function coverVariant(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 4;
}

function MentorCardView({ m, x, showStatus, canRequest }: { m: MentorCard; x?: MentorExtra; showStatus: boolean; canRequest: boolean }) {
  const open = m.isAvailable !== false && m.hasCapacity !== false;
  const statusText = m.isAvailable === false
    ? (showStatus ? mentorStatusText : publicMentorStatusText)(m.status, m.onLeaveUntil)
    : m.hasCapacity === false ? "Đã đủ mentee"
      : `Đang nhận${x?.slotsLeft ? ` · còn ${x.slotsLeft} chỗ` : ""}${x?.trialMinutes ? ` · học thử ${x.trialMinutes} phút` : ""}`;
  const verified = m.verificationStatus === "APPROVED";
  return (
    <article className="mb-card">
      <div className="mb-cover" data-v={coverVariant(m.userId)} aria-hidden="true" />
      <div className="mb-card-body">
        <div className="mb-ava"><Avatar name={m.displayName} src={m.avatarUrl} size="xl" /></div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/mentors/${m.userId}`} className="mb-name">{m.displayName}</Link>
            {showStatus ? <StatusBadge status={m.verificationStatus} />
              : verified && <span className="mb-verified"><BadgeCheck aria-hidden="true" />Xác thực</span>}
          </div>
          {m.headline && <div className="mt-0.5 line-clamp-2 text-small text-ink-muted">{m.headline}</div>}
        </div>
        <div className="mb-meta">
          {m.ratingCount >= 3 /* US-41 (PRD-REV-5) */
            ? <><b className="mb-rating"><Star aria-hidden="true" />{m.rating.toFixed(1).replace(".", ",")}</b> ({m.ratingCount})</>
            : <Badge tone="accent">Mentor mới</Badge>}
          <span aria-hidden="true">·</span>
          {x && <><span>{x.sessionCount} phiên</span><span aria-hidden="true">·</span></>}
          {m.domain && <><span>{domainLabel(m.domain)}</span><span aria-hidden="true">·</span></>}
          <span>{m.yearsExperience} năm</span>
          <span aria-hidden="true">·</span>
          <b className="text-ink tabular">{formatRate(m.hourlyRate)}</b>
        </div>
        {m.skills?.length > 0 && (
          <Chips>
            {m.skills.slice(0, MAX_SKILLS).map((s) => <Chip key={s}>{s}</Chip>)}
            {m.skills.length > MAX_SKILLS && <Chip>+{m.skills.length - MAX_SKILLS}</Chip>}
          </Chips>
        )}
        <div className="mb-status" data-state={open ? "open" : m.status === "SUSPENDED" ? "danger" : "closed"}>
          <span aria-hidden="true" />{statusText}
        </div>
        <div className="mb-actions">
          <ButtonLink href={`/mentors/${m.userId}`} variant="secondary">Xem hồ sơ</ButtonLink>
          {canRequest && (open
            ? <ButtonLink href={`/mentoring/request/${m.userId}`} variant="primary">Gửi yêu cầu</ButtonLink>
            : <span className="mb-disabled">Chưa nhận</span>)}
        </div>
      </div>
    </article>
  );
}

/** Phân trang dạng số tròn 44px; hiện trang đầu, cuối và lân cận trang hiện tại. */
function PageNav({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  const set = new Set([0, totalPages - 1, page - 1, page, page + 1]);
  const pages = [...set].filter((p) => p >= 0 && p < totalPages).sort((a, b) => a - b);
  return (
    <nav className="mb-pages" aria-label="Phân trang">
      <button type="button" aria-label="Trang trước" disabled={page <= 0} onClick={() => onChange(page - 1)}><ChevronLeft aria-hidden="true" /></button>
      {pages.map((p, i) => (
        <span key={p} className="contents">
          {i > 0 && p - pages[i - 1] > 1 && <span aria-hidden="true" className="mb-gap">…</span>}
          <button type="button" aria-label={`Trang ${p + 1}`} aria-current={p === page ? "page" : undefined} onClick={() => onChange(p)}>{p + 1}</button>
        </span>
      ))}
      <button type="button" aria-label="Trang sau" disabled={page >= totalPages - 1} onClick={() => onChange(page + 1)}><ChevronRight aria-hidden="true" /></button>
    </nav>
  );
}

const DAYS = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const TOD: [TimeOfDay, string][] = [["MORNING", "Sáng"], ["AFTERNOON", "Chiều"], ["EVENING", "Tối"]];
const RATINGS = [4.5, 4];
const SORTS: [string, string][] = [["rating", "Đánh giá cao nhất"], ["price", "Giá thấp nhất"], ["exp", "Nhiều kinh nghiệm nhất"], ["sessions", "Nhiều phiên nhất"]];

type FilterPatch = Partial<{ q: string; domain: string; budget: string; tod: string; days: string; type: string; rating: string; lang: string; open: string; sort: string; all: string; page: number }>;
type Chipdef = [label: string, text: string, clear: FilterPatch];

function MentorBrowser({ user }: { user: SessionUser }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const g = (k: string) => params.get(k) || "";
  const q = g("q");
  const domain = g("domain");
  const budget = Number(g("budget")) || 0;
  const tod = g("tod") as TimeOfDay | "";
  const daysKey = g("days");
  const days = useMemo(() => daysKey.split(",").map(Number).filter((n) => n >= 1 && n <= 7), [daysKey]);
  const type = g("type") as SessionType | "";
  const minRating = Number(g("rating")) || 0;
  const lang = g("lang") as LanguageCode | "";
  const openOnly = g("open") === "1";
  const sort = g("sort") || "rating";
  const page = Math.max(0, Number(params.get("page")) || 0);
  const isAdmin = user.role === "ADMIN";
  const includeUnverified = isAdmin && params.get("all") === "1";

  const [keyword, setKeyword] = useState(q);
  const [budgetText, setBudgetText] = useState(budget ? String(budget) : "");
  const [all, setAll] = useState<MentorCard[] | null | undefined>(undefined);
  const [extras, setExtras] = useState<Record<string, MentorExtra>>({});
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [sheet, setSheet] = useState(false);
  const closeSheet = useCallback(() => setSheet(false), []);

  useEffect(() => setKeyword(q), [q]);
  useEffect(() => setBudgetText(budget ? String(budget) : ""), [budget]);

  useEffect(() => {
    let active = true;
    setAll(undefined);
    setError("");
    profileApi
      .searchMentors({ q, domain, page: 0, size: 100, includeUnverified })
      .then(async (res) => {
        const ex = await findxApi.extras(res.items);
        if (!active) return;
        setExtras(ex);
        setAll(res.items);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(errorMessage(e));
        setAll(null);
      });
    return () => {
      active = false;
    };
  }, [q, domain, includeUnverified, reloadKey]);

  /** Bộ lọc nằm trên URL để giữ trạng thái khi quay lại từ trang hồ sơ mentor. */
  function update(patch: FilterPatch) {
    const cur: Record<string, string | number> = {
      q, domain, budget: budget || "", tod, days: daysKey, type, rating: minRating || "", lang,
      open: openOnly ? "1" : "", sort: sort === "rating" ? "" : sort, all: includeUnverified ? "1" : "",
    };
    const next = { ...cur, page: 0, ...patch };
    const qs = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => {
      if (v !== "" && v !== 0 && v != null) qs.set(k, String(v));
    });
    const s = qs.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    update({ q: keyword.trim(), budget: String(Math.max(0, Number(budgetText) || 0) || "") });
  }

  const result = useMemo(() => {
    if (!all) return [];
    const list = all.filter((m) => {
      const x = extras[m.userId];
      if (budget && m.hourlyRate > budget) return false;
      if (minRating && !(m.ratingCount >= 3 && m.rating >= minRating)) return false;
      if (openOnly && !(m.isAvailable !== false && m.hasCapacity !== false)) return false;
      if (x) {
        if (tod && !x.timeOfDay.includes(tod)) return false;
        if (days.length && !days.some((d) => x.days.includes(d))) return false;
        if (type && !x.sessionTypes.includes(type)) return false;
        if (lang && !x.languages.includes(lang)) return false;
      }
      return true;
    });
    const by: Record<string, (a: MentorCard, b: MentorCard) => number> = {
      rating: (a, b) => b.rating - a.rating,
      price: (a, b) => a.hourlyRate - b.hourlyRate,
      exp: (a, b) => b.yearsExperience - a.yearsExperience,
      sessions: (a, b) => (extras[b.userId]?.sessionCount ?? 0) - (extras[a.userId]?.sessionCount ?? 0),
    };
    return list.sort(by[sort] ?? by.rating);
  }, [all, extras, budget, minRating, openOnly, tod, days, type, lang, sort]);

  const totalPages = Math.max(1, Math.ceil(result.length / PAGE_SIZE));
  const shown = result.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const chips: Chipdef[] = [];
  if (q) chips.push(["Từ khoá", `“${q}”`, { q: "" }]);
  if (domain) chips.push(["Lĩnh vực", domainLabel(domain), { domain: "" }]);
  if (budget) chips.push(["Ngân sách", `≤ ${budget.toLocaleString("vi-VN")} đ`, { budget: "" }]);
  if (tod) chips.push(["Buổi", TOD.find(([v]) => v === tod)?.[1] ?? tod, { tod: "" }]);
  if (days.length) chips.push(["Ngày", days.map((d) => DAYS[d]).join(", "), { days: "" }]);
  if (type) chips.push(["Loại phiên", SESSION_TYPE_LABELS[type], { type: "" }]);
  if (minRating) chips.push(["Đánh giá", `★ ${String(minRating).replace(".", ",")}+`, { rating: "" }]);
  if (lang) chips.push(["Ngôn ngữ", LANGUAGE_LABELS[lang], { lang: "" }]);
  if (openOnly) chips.push(["Còn chỗ", "Còn chỗ", { open: "" }]);
  const filtered = chips.length > 0;
  const clearAll = () => {
    setKeyword(""); setBudgetText("");
    update({ q: "", domain: "", budget: "", tod: "", days: "", type: "", rating: "", lang: "", open: "" });
  };
  const toggleDay = (d: number) => update({ q: keyword.trim(), days: (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]).sort().join(",") });
  const kw = keyword.trim();

  return (
    <>
      <PageHeader
        title={user.role === "MENTEE" ? "Tìm mentor" : "Danh sách mentor"}
        description={isAdmin ? "Tra cứu toàn bộ hồ sơ mentor trên hệ thống." : "Mentor đã qua phỏng vấn AI xác thực năng lực. Lọc theo lĩnh vực, ngân sách, lịch học hoặc tìm theo tên."}
      />
      {user.role === "MENTEE" && <FindMentorTabs current="mentors" />}

      <form className="mb-bar" role="search" onSubmit={submit}>
        <div className="mb-search">
          <Search aria-hidden="true" />
          <input type="search" aria-label="Tìm mentor" placeholder="Tên hoặc giới thiệu" value={keyword} maxLength={100} onChange={(e) => setKeyword(e.target.value)} />
        </div>
        <button type="button" className="mb-filter-btn" aria-haspopup="dialog" aria-expanded={sheet} onClick={() => setSheet(true)}>
          <SlidersHorizontal aria-hidden="true" />Lọc{chips.length > 0 && ` · ${chips.length}`}
        </button>
      </form>

      <div className="pf-grid" style={{ marginTop: 0 }}>
        <aside className="pf-side" aria-label="Bộ lọc" style={{ flexBasis: 240, maxWidth: 280 }}>
          <FilterSheet open={sheet} onClose={closeSheet} onClear={filtered ? clearAll : undefined} always className="mb-sheet">
            <form className="flex flex-col gap-5" onSubmit={(e) => { submit(e); closeSheet(); }}>
              <div className="mb-desk relative">
                <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
                <Input type="search" placeholder="Tìm theo tên hoặc giới thiệu" aria-label="Từ khoá" value={keyword} maxLength={100}
                  onChange={(e) => setKeyword(e.target.value)} className="pl-9" />
              </div>
              <fieldset className="flex flex-col gap-1">
                <legend className="eyebrow mb-1">Lĩnh vực</legend>
                <Chips>
                  <Chip selected={!domain} onClick={() => update({ q: kw, domain: "" })}>Mọi lĩnh vực</Chip>
                  {DOMAINS.map(([v, l]) => <Chip key={v} selected={domain === v} onClick={() => update({ q: kw, domain: v })}>{l}</Chip>)}
                </Chips>
              </fieldset>
              <div className="flex flex-col gap-1">
                <label className="eyebrow mb-1" htmlFor="mb-budget">Ngân sách tối đa (đ / giờ)</label>
                <Input id="mb-budget" type="number" min={0} step={10000} inputMode="numeric" placeholder="Để trống nếu không giới hạn" value={budgetText}
                  onChange={(e) => setBudgetText(e.target.value)} onBlur={() => update({ q: kw, budget: String(Math.max(0, Number(budgetText) || 0) || "") })} />
              </div>
              <fieldset className="flex flex-col gap-1">
                <legend className="eyebrow mb-1">Buổi học</legend>
                <Chips>{TOD.map(([v, l]) => <Chip key={v} selected={tod === v} onClick={() => update({ q: kw, tod: tod === v ? "" : v })}>{l}</Chip>)}</Chips>
              </fieldset>
              <fieldset className="flex flex-col gap-1">
                <legend className="eyebrow mb-1">Ngày học</legend>
                <Chips>{[1, 2, 3, 4, 5, 6, 7].map((d) => <Chip key={d} selected={days.includes(d)} onClick={() => toggleDay(d)}>{DAYS[d]}</Chip>)}</Chips>
              </fieldset>
              <fieldset className="flex flex-col gap-1">
                <legend className="eyebrow mb-1">Loại phiên</legend>
                <Chips>
                  {(Object.keys(SESSION_TYPE_LABELS) as SessionType[]).map((t) => (
                    <Chip key={t} selected={type === t} onClick={() => update({ q: kw, type: type === t ? "" : t })}>{SESSION_TYPE_LABELS[t]}</Chip>
                  ))}
                </Chips>
              </fieldset>
              <fieldset className="flex flex-col gap-1">
                <legend className="eyebrow mb-1">Đánh giá tối thiểu</legend>
                <Chips>{RATINGS.map((r) => <Chip key={r} selected={minRating === r} onClick={() => update({ q: kw, rating: minRating === r ? "" : String(r) })}>★ {String(r).replace(".", ",")}+</Chip>)}</Chips>
              </fieldset>
              <fieldset className="flex flex-col gap-1">
                <legend className="eyebrow mb-1">Ngôn ngữ</legend>
                <Chips>
                  {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((l) => (
                    <Chip key={l} selected={lang === l} onClick={() => update({ q: kw, lang: lang === l ? "" : l })}>{LANGUAGE_LABELS[l]}</Chip>
                  ))}
                </Chips>
              </fieldset>
              <Checkbox label="Chỉ mentor còn chỗ" checked={openOnly} onChange={(e) => update({ q: kw, open: e.target.checked ? "1" : "" })} />
              {isAdmin && (
                <Checkbox label="Gồm cả mentor chưa xác thực" checked={includeUnverified} onChange={(e) => update({ all: e.target.checked ? "1" : "" })} />
              )}
              <Button type="submit" variant="primary" block className="mb-desk-only">Tìm</Button>
              <div className="mb-sheet-foot">
                <Button variant="primary" block onClick={closeSheet}>{all ? `Xem ${result.length} mentor` : "Xem kết quả"}</Button>
              </div>
            </form>
          </FilterSheet>
        </aside>
        <div className="pf-main" style={{ flexBasis: 560 }}>
          {all === undefined && <Loading text="Đang tải danh sách mentor…" />}
          {error && (
            <Alert action={<Button size="sm" variant="ghost" onClick={() => setReloadKey((k) => k + 1)}>Thử lại</Button>}>
              {error || "Không tải được danh sách mentor."}
            </Alert>
          )}
          {all && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="mb-count"><b>{result.length} mentor</b>{filtered ? " phù hợp bộ lọc" : ""}</div>
                <label className="flex items-center gap-2 text-small text-ink-muted">
                  Sắp xếp
                  <Select aria-label="Sắp xếp" value={sort} onChange={(e) => update({ q: kw, sort: e.target.value === "rating" ? "" : e.target.value })} style={{ minHeight: 44 }}>
                    {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select>
                </label>
              </div>
              {filtered && (
                <div className="mb-chips" aria-label="Bộ lọc đang bật">
                  {chips.map(([label, text, clear]) => (
                    <button key={label} type="button" className="find-fchip" aria-label={`Bỏ bộ lọc ${label}: ${text}`}
                      onClick={() => { if ("q" in clear) setKeyword(""); update({ q: kw, ...clear }); }}>{text}<X aria-hidden="true" /></button>
                  ))}
                </div>
              )}
              {shown.length === 0 ? (
                <div className="card mb-empty">
                  <EmptyState icon={Users} title={filtered ? "Không có mentor nào khớp bộ lọc" : "Chưa có mentor nào được xác thực"}
                    action={filtered
                      ? <Button size="sm" variant="primary" onClick={clearAll}>Xoá bộ lọc</Button>
                      : user.role === "MENTEE" && <ButtonLink href="/matching" icon={Sparkles} size="sm">Thử AI Matching</ButtonLink>}>
                    {filtered ? "Thử bỏ bớt ngày học hoặc tăng ngân sách tối đa." : "Mentor xuất hiện ở đây sau khi được quản trị viên duyệt."}
                  </EmptyState>
                </div>
              ) : (
                <div className="mb-grid">
                  {shown.map((m) => <MentorCardView key={m.userId} m={m} x={extras[m.userId]} showStatus={isAdmin} canRequest={user.role === "MENTEE"} />)}
                </div>
              )}
              {totalPages > 1 && (
                <PageNav page={Math.min(page, totalPages - 1)} totalPages={totalPages} onChange={(p) => { update({ q: kw, page: p }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
              )}
            </>
          )}
        </div>
      </div>
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
