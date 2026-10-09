"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead, Stars, StatusBadge } from "@/components/ui";
import { DOMAINS, domainLabel, mentorStatusText, profileApi, publicMentorStatusText } from "@/features/profile/api";
import { errorMessage } from "@/lib/api";
import { formatRate } from "@/lib/format";
import type { MentorCard, PageResponse, SessionUser } from "@/types";

const PAGE_SIZE = 12;
const MAX_SKILLS = 6;

function MentorCardView({ m, showStatus }: { m: MentorCard; showStatus: boolean }) {
  const available = m.isAvailable;
  return (
    <div className="card mentor-card">
      <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ marginBottom: 2 }}><Link href={`/mentors/${m.userId}`}>{m.displayName}</Link></h3>
          <div className="muted small">
            {m.yearsExperience} năm KN · <span style={{ whiteSpace: "nowrap" }}>{formatRate(m.hourlyRate)}</span>
          </div>
        </div>
        {m.domain && <span className="badge primary">{domainLabel(m.domain)}</span>}
      </div>
      <div className="small" style={{ margin: "6px 0 10px" }}>
        {m.ratingCount > 0
          ? <><Stars value={m.rating} /> <span className="muted">{Number(m.rating).toFixed(1)} ({m.ratingCount})</span></>
          : <span className="badge new">Mentor mới</span>}
      </div>
      {m.skills?.length > 0 && (
        <div className="chips" style={{ marginBottom: 12 }}>
          {m.skills.slice(0, MAX_SKILLS).map((s) => <span key={s} className="chip">{s}</span>)}
          {m.skills.length > MAX_SKILLS && <span className="chip">+{m.skills.length - MAX_SKILLS}</span>}
        </div>
      )}
      <div className="row between" style={{ marginTop: "auto" }}>
        <div className="row" style={{ gap: 6 }}>
          {showStatus && <StatusBadge status={m.verificationStatus} />}
          {available === false ? (
            <span className={`badge ${m.status === "SUSPENDED" ? "bad" : ""}`}>{(showStatus ? mentorStatusText : publicMentorStatusText)(m.status, m.onLeaveUntil)}</span>
          ) : m.hasCapacity === false ? (
            <span className="badge warn">Đã đủ mentee</span>
          ) : (
            <span className="badge good">Đang nhận mentee</span>
          )}
        </div>
        <Link className="btn secondary sm" href={`/mentors/${m.userId}`}>Xem hồ sơ</Link>
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="row pagination" style={{ justifyContent: "center", marginTop: "1.5rem" }}>
      <button className="btn secondary sm" disabled={page <= 0} onClick={() => onChange(page - 1)}>← Trước</button>
      <span className="small">Trang {page + 1} / {totalPages}</span>
      <button className="btn secondary sm" disabled={page >= totalPages - 1} onClick={() => onChange(page + 1)}>Sau →</button>
    </div>
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
      <PageHead title="Danh sách mentor" subtitle={isAdmin ? "Tra cứu toàn bộ hồ sơ mentor trên hệ thống." : "Duyệt các mentor đã được xác thực qua AI Interview, lọc theo lĩnh vực hoặc tìm theo tên."}>
        {user.role === "MENTEE" && <Link href="/matching" className="btn secondary">Gợi ý bằng AI</Link>}
      </PageHead>

      <form className="row filter-bar" onSubmit={submit} style={{ marginBottom: "1rem" }}>
        <input
          type="search"
          placeholder="Tìm theo tên hoặc giới thiệu..."
          aria-label="Từ khoá"
          value={keyword}
          maxLength={100}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        <select aria-label="Lĩnh vực" value={domain} onChange={(e) => update({ q: keyword.trim(), domain: e.target.value })} style={{ maxWidth: 220 }}>
          <option value="">Mọi lĩnh vực</option>
          {DOMAINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn">Tìm</button>
        {filtered && (
          <button type="button" className="btn ghost" onClick={() => { setKeyword(""); update({ q: "", domain: "" }); }}>Xoá bộ lọc</button>
        )}
        {isAdmin && (
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={includeUnverified} onChange={(e) => update({ all: e.target.checked ? "1" : "" })} />
            Gồm cả mentor chưa xác thực
          </label>
        )}
      </form>

      {data === undefined && <Loading text="Đang tải danh sách mentor..." />}
      {error && (
        <Alert>
          {error || "Không tải được danh sách mentor."}{" "}
          <button className="btn ghost sm" onClick={() => setReloadKey((k) => k + 1)}>Thử lại</button>
        </Alert>
      )}
      {data && (
        <>
          <p className="muted small">
            {data.totalItems > 0 ? `Tìm thấy ${data.totalItems} mentor${filtered ? " phù hợp bộ lọc" : ""}.` : null}
          </p>
          {data.items.length === 0 ? (
            <Empty>
              {filtered ? "Không có mentor nào khớp bộ lọc. Hãy thử từ khoá hoặc lĩnh vực khác." : "Chưa có mentor nào được xác thực."}
              {user.role === "MENTEE" && <> <br /><Link href="/matching">Thử AI Matching</Link> để nhận gợi ý theo hồ sơ của bạn.</>}
            </Empty>
          ) : (
            <div className="grid grid-3">
              {data.items.map((m) => <MentorCardView key={m.userId} m={m} showStatus={isAdmin} />)}
            </div>
          )}
          <Pagination page={data.page} totalPages={data.totalPages} onChange={(p) => { update({ page: p }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
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
