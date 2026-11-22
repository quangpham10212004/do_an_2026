"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Pencil, Plus, Trash2, Upload, X, type LucideIcon } from "lucide-react";
import { Avatar, Button, Field, Input, Modal, Progress, Select } from "@/components/ui";
import { COMMON_TIMEZONES, DOMAINS, profileApi } from "@/features/profile/api";
import { matchingApi } from "@/features/matching/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Completeness, IndexStatus, Uuid } from "@/types";

/* Bộ thành phần dùng chung cho trang quản lý hồ sơ (MentorEdit, MenteeEdit): thanh mục, thẻ mục có icon,
   thanh lưu cố định, chip kỹ năng, danh sách liên kết, hộp thoại xác nhận, toast, chặn rời trang. */

/**
 * Cờ mock: backend chưa có API xoá hồ sơ.
 * TODO backend: DELETE /api/profile/mentor/{id} (409 khi còn mentee/phiên đang hoạt động) và
 * DELETE /api/profile/mentee/{id}/data (xoá mục tiêu, kỹ năng, CV, lưu ý tìm mentor).
 * Khi true: giả lập thành công, KHÔNG xoá dữ liệu thật.
 */
export const MOCK_PROFILE_DELETE = true;
export const mockDeleteProfile = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 600));

export const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const isMobile = () => typeof window !== "undefined" && window.matchMedia("(max-width: 899px)").matches;

/* ---------- Mục (section) + thanh mục bên trái ---------- */

const OPEN_EVENT = "pe-open";

export interface RailItem { id: string; label: string; icon: LucideIcon; dirty?: boolean }

/** Mở mục (mobile đang thu gọn) rồi cuộn tới. */
export function jumpToSection(id: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    try { window.history.replaceState(null, "", `#${id}`); } catch { /* bỏ qua */ }
  });
}

export function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join("|");
  useEffect(() => {
    const els = key.split("|").map((i) => document.getElementById(i)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver((entries) => {
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActive(hit.target.id);
    }, { rootMargin: "-90px 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [key]);
  return active;
}

export function SectionRail({ items, active }: { items: RailItem[]; active: string }) {
  return (
    <nav className="pe-rail" aria-label="Các mục hồ sơ">
      {items.map((it) => (
        <a key={it.id} href={`#${it.id}`} aria-current={active === it.id ? "true" : undefined}
          onClick={(e) => { e.preventDefault(); jumpToSection(it.id); }}>
          <it.icon aria-hidden="true" />
          <span className="pe-rail-label">{it.label}</span>
          {it.dirty && <span className="pe-dot" role="img" aria-label="Có thay đổi chưa lưu" />}
        </a>
      ))}
    </nav>
  );
}

/** Thẻ mục: icon trong ô bo góc + tiêu đề; trên mobile là accordion (bấm tiêu đề để mở/thu gọn). */
export function EditSection({ id, icon: Icon, title, description, actions, children, defaultOpenMobile }: {
  id: string; icon: LucideIcon; title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; defaultOpenMobile?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  useEffect(() => {
    if (isMobile() && window.location.hash.slice(1) !== id && !defaultOpenMobile) setOpen(false);
    const onOpen = (e: Event) => { if ((e as CustomEvent<string>).detail === id) setOpen(true); };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [id, defaultOpenMobile]);
  return (
    <section id={id} className="pe-section" data-open={open}>
      <div className="pe-head">
        <div className="min-w-0 flex-1">
          <h2>
            <button type="button" className="pe-head-btn" aria-expanded={open} aria-controls={bodyId}
              onClick={() => { if (isMobile()) setOpen((o) => !o); }}>
              <span className="pf-ico"><Icon aria-hidden="true" /></span>
              <span className="pe-head-title">{title}</span>
              <ChevronDown aria-hidden="true" className="pe-chev" />
            </button>
          </h2>
          {description && <p className="pe-head-desc">{description}</p>}
        </div>
        {actions && <div className="pe-head-actions">{actions}</div>}
      </div>
      <div className="pe-body" id={bodyId}>{children}</div>
    </section>
  );
}

/* ---------- Thanh lưu cố định ---------- */

export function SaveBar({ dirty, saving, onSave, onReset, count, disabledReason }: {
  dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void; count: number; disabledReason?: string;
}) {
  return (
    <div className="pe-savebar" role="region" aria-label="Lưu hồ sơ">
      <div className="pe-savebar-in">
        <span className="pe-savebar-state" role="status" data-dirty={dirty}>
          <span className="pe-dot" aria-hidden="true" />
          {dirty ? `Có thay đổi chưa lưu${count ? ` (${count} mục)` : ""}` : "Mọi thay đổi đã được lưu"}
        </span>
        <Button variant="ghost" disabled={!dirty || saving} onClick={onReset}>Huỷ thay đổi</Button>
        <Button variant="primary" loading={saving} disabled={!dirty} onClick={onSave} title={disabledReason}>Lưu hồ sơ</Button>
      </div>
    </div>
  );
}

/* ---------- Toast ---------- */

export interface ToastOptions { text: string; actionLabel?: string; onAction?: () => void }

export function useToast(): [ReactNode, (t: ToastOptions) => void] {
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback((t: ToastOptions) => {
    clearTimeout(timer.current);
    setToast(t);
    timer.current = setTimeout(() => setToast(null), 7000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = toast ? (
    <div className="pe-toast" role="status">
      <span>{toast.text}</span>
      {toast.actionLabel && (
        <button type="button" onClick={() => { toast.onAction?.(); setToast(null); }}>{toast.actionLabel}</button>
      )}
      <button type="button" className="pe-toast-x" aria-label="Đóng thông báo" onClick={() => setToast(null)}><X aria-hidden="true" /></button>
    </div>
  ) : null;
  return [node, show];
}

/* ---------- Hộp thoại xác nhận (ProfileDialogs) ---------- */

export function ConfirmModal({ title, icon: Icon = AlertTriangle, tone = "danger", children, confirmText, cancelText = "Huỷ", onConfirm, onClose, busy, confirmDisabled, hideCancel }: {
  title: ReactNode; icon?: LucideIcon; tone?: "danger" | "warning"; children?: ReactNode; confirmText: string; cancelText?: string;
  onConfirm: () => void; onClose: () => void; busy?: boolean; confirmDisabled?: boolean; hideCancel?: boolean;
}) {
  return (
    <Modal onClose={onClose} width={480}
      title={<span className="pe-dlg-title"><span className="pe-dlg-ico" data-tone={tone}><Icon aria-hidden="true" /></span>{title}</span>}
      footer={<>
        {!hideCancel && <Button variant="ghost" onClick={onClose}>{cancelText}</Button>}
        <Button variant={tone === "danger" ? "danger" : "primary"} loading={busy} disabled={confirmDisabled} onClick={onConfirm}>{confirmText}</Button>
      </>}>
      {children}
    </Modal>
  );
}

/** Chặn rời trang khi còn thay đổi chưa lưu: tải lại/đóng tab (trình duyệt hỏi) và bấm liên kết nội bộ (hộp thoại). */
export function useLeaveGuard(dirty: boolean, sectionNames: string[], save: () => Promise<boolean>): ReactNode {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!dirty) return undefined;
    const onBefore = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setTarget(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", onBefore);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBefore);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  if (!target) return null;
  const go = () => { const t = target; setTarget(null); router.push(t); };
  return (
    <ConfirmModal tone="warning" title="Bạn có thay đổi chưa lưu" confirmText="Lưu và rời đi" cancelText="Bỏ thay đổi" busy={busy}
      onClose={() => setTarget(null)}
      onConfirm={async () => { setBusy(true); const ok = await save(); setBusy(false); if (ok) go(); else setTarget(null); }}>
      <p className="text-ink-muted">
        {sectionNames.length ? `Đã sửa ${sectionNames.length} mục: ${sectionNames.join(", ")}. ` : ""}Rời trang bây giờ sẽ mất các thay đổi này.
      </p>
      <div>
        <Button variant="ghost" size="sm" onClick={go}>Rời đi, bỏ thay đổi</Button>
        <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>Ở lại trang</Button>
      </div>
    </ConfirmModal>
  );
}

/* ---------- Chip kỹ năng (thêm bằng Enter, xoá bằng nút X) ---------- */

export function ChipEditor({ items, onChange, label, placeholder, suggestions = [] }: {
  items: string[]; onChange: (next: string[]) => void; label: string; placeholder?: string; suggestions?: string[];
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    const next = [...items];
    for (const p of parts) if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
    if (next.length !== items.length) onChange(next);
    setText("");
  };
  const left = suggestions.filter((s) => !items.some((x) => x.toLowerCase() === s.toLowerCase())).slice(0, 6);
  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 ? (
        <ul className="pe-chips" aria-label={label}>
          {items.map((s) => (
            <li key={s} className="pe-chip">
              {s}
              <button type="button" aria-label={`Xoá ${s}`} onClick={() => onChange(items.filter((x) => x !== s))}><X aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-small text-ink-muted">Chưa có mục nào.</p>}
      <div className="pe-addrow">
        <Input aria-label={`Thêm ${label.toLowerCase()}`} value={text} placeholder={placeholder} maxLength={60}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(text); } }} />
        <Button icon={Plus} disabled={!text.trim()} onClick={() => add(text)}>Thêm</Button>
      </div>
      {left.length > 0 && (
        <div className="pe-suggest">
          <span>Gợi ý:</span>
          {left.map((s) => <button key={s} type="button" onClick={() => add(s)}>{s}</button>)}
        </div>
      )}
    </div>
  );
}

/* ---------- Liên kết (portfolio / dự án) ---------- */

export function normalizeLink(raw: string): string | null {
  const t = raw.trim();
  if (!t || /\s/.test(t)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
    return withScheme;
  } catch { return null; }
}
const shortLink = (l: string) => l.replace(/^https?:\/\//i, "").replace(/\/$/, "");

export function LinkEditor({ links, onChange, onRemoved }: { links: string[]; onChange: (next: string[]) => void; onRemoved?: (link: string, restore: () => void) => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | undefined>();
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [draftErr, setDraftErr] = useState<string | undefined>();
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);

  const add = () => {
    const n = normalizeLink(text);
    if (!n) return setErr("Nhập liên kết hợp lệ, ví dụ https://github.com/ten-ban.");
    if (links.includes(n)) return setErr("Liên kết này đã có trong danh sách.");
    onChange([...links, n]);
    setText("");
    setErr(undefined);
  };
  const saveEdit = () => {
    if (editIdx === null) return;
    const n = normalizeLink(draft);
    if (!n) return setDraftErr("Nhập liên kết hợp lệ, ví dụ https://github.com/ten-ban.");
    if (links.some((l, i) => l === n && i !== editIdx)) return setDraftErr("Liên kết này đã có trong danh sách.");
    onChange(links.map((l, i) => (i === editIdx ? n : l)));
    setEditIdx(null);
  };
  const remove = (i: number) => {
    const prev = links;
    onChange(links.filter((_, j) => j !== i));
    setEditIdx(null);
    setConfirmIdx(null);
    onRemoved?.(links[i], () => onChange(prev));
  };

  return (
    <div className="flex flex-col gap-3">
      {links.length === 0 && <p className="text-small text-ink-muted">Chưa có liên kết nào. Thêm GitHub, portfolio hoặc bài viết tiêu biểu.</p>}
      {links.map((l, i) => (
        <div key={l} className="pe-linkrow">
          <a href={l} target="_blank" rel="noopener noreferrer" className="pe-linktext">{shortLink(l)}</a>
          <Button variant="ghost" iconOnly icon={Pencil} label={`Sửa liên kết ${shortLink(l)}`} onClick={() => { setEditIdx(i); setDraft(l); setDraftErr(undefined); }} />
        </div>
      ))}
      <Field error={err}>
        <div className="pe-addrow">
          <Input aria-label="Thêm liên kết" inputMode="url" placeholder="https://…" value={text} maxLength={300}
            onChange={(e) => { setText(e.target.value); setErr(undefined); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <Button icon={Plus} disabled={!text.trim()} onClick={add}>Thêm liên kết</Button>
        </div>
      </Field>

      {editIdx !== null && confirmIdx === null && (
        <Modal title="Sửa liên kết" onClose={() => setEditIdx(null)} width={480}
          footer={<>
            <Button variant="danger-quiet" icon={Trash2} className="mr-auto" onClick={() => setConfirmIdx(editIdx)}>Xoá liên kết</Button>
            <Button variant="ghost" onClick={() => setEditIdx(null)}>Huỷ</Button>
            <Button variant="primary" onClick={saveEdit}>Lưu liên kết</Button>
          </>}>
          <Field label="Liên kết" id="pe-link-edit" error={draftErr}>
            <Input id="pe-link-edit" autoFocus value={draft} maxLength={300} onChange={(e) => { setDraft(e.target.value); setDraftErr(undefined); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveEdit(); } }} />
          </Field>
        </Modal>
      )}
      {confirmIdx !== null && links[confirmIdx] !== undefined && (
        <ConfirmModal title={`Xoá liên kết ${cap(shortLink(links[confirmIdx]), 40)}?`} confirmText="Xoá liên kết" cancelText="Giữ lại"
          onClose={() => setConfirmIdx(null)} onConfirm={() => remove(confirmIdx)}>
          <p className="text-ink-muted">Liên kết sẽ bị gỡ khỏi hồ sơ sau khi bạn bấm Lưu hồ sơ.</p>
        </ConfirmModal>
      )}
    </div>
  );
}

/* ---------- Ảnh đại diện (+ múi giờ tuỳ chọn) ---------- */

export function AvatarRow({ userId, name, avatarUrl, timezone, onChange, onError, onDone }: {
  userId: Uuid; name?: string | null; avatarUrl: string | null; timezone?: string; onChange: () => void; onError: (m: string) => void; onDone: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [tz, setTz] = useState(timezone ?? "");
  const fileId = useId();
  useEffect(() => { if (timezone) setTz(timezone); }, [timezone]);
  const known = COMMON_TIMEZONES.some(([v]) => v === tz);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); onDone(ok); onChange(); } catch (e) { onError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="pe-avatar-row">
      <Avatar name={name} src={avatarUrl} size="xl" />
      <div className="min-w-0 flex-1">
        <b>Ảnh đại diện</b>
        <p className="field-hint">JPG hoặc PNG, tối đa 2 MB. Hiện trên hồ sơ và tin nhắn.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <label htmlFor={fileId} className={`btn ${busy ? "pointer-events-none opacity-50" : ""}`}>
            <Upload aria-hidden="true" />{avatarUrl ? "Đổi ảnh" : "Tải ảnh lên"}
          </label>
          <input id={fileId} type="file" accept="image/jpeg,image/png" className="sr-only" disabled={busy} onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > 2 * 1024 * 1024) return onError("Ảnh đại diện tối đa 2 MB. Chọn ảnh nhỏ hơn.");
            run(() => profileApi.uploadAvatar(userId, f), "Đã cập nhật ảnh đại diện.");
          }} />
          {avatarUrl && <Button variant="ghost" icon={Trash2} disabled={busy} onClick={() => run(() => profileApi.deleteAvatar(userId), "Đã gỡ ảnh đại diện.")}>Gỡ ảnh</Button>}
        </div>
        {timezone !== undefined && (
          <div className="mt-3 flex flex-col gap-1">
            <label className="field-label" htmlFor={`${fileId}-tz`}>Múi giờ</label>
            <div className="input-group">
              <Select id={`${fileId}-tz`} value={known ? tz : "__other"} onChange={(e) => e.target.value !== "__other" && setTz(e.target.value)}>
                {COMMON_TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                {!known && <option value="__other">{tz}</option>}
              </Select>
              <Button disabled={busy || tz === timezone} onClick={() => run(() => profileApi.saveTimezone(userId, tz), "Đã đổi múi giờ.")}>Lưu múi giờ</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Vùng nguy hiểm (xoá hồ sơ / xoá dữ liệu). */
export function DangerZone({ title, text, button, onClick }: { title: string; text: string; button: string; onClick: () => void }) {
  return (
    <section className="pe-danger">
      <div className="min-w-0 flex-1"><b>{title}</b><p>{text}</p></div>
      <Button variant="danger-quiet" onClick={onClick}>{button}</Button>
    </section>
  );
}

/* ---------- Dùng chung giữa hai trang ---------- */

export function DomainSelect({ id, value, onChange, invalid }: { id: string; value: string; onChange: (value: string) => void; invalid?: boolean }) {
  const known = DOMAINS.some(([v]) => v === value);
  return (
    <Select id={id} value={known || !value ? value : "__other"} aria-invalid={invalid} onChange={(e) => onChange(e.target.value === "__other" ? value : e.target.value)}>
      <option value="">Chọn lĩnh vực</option>
      {DOMAINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      {!known && value && <option value="__other">{value}</option>}
    </Select>
  );
}

/**
 * Trạng thái chỉ mục embedding do matching-service sở hữu. Chỉ mục là nhất quán cuối cùng: sau khi lưu
 * (đổi `refreshKey`) ta hỏi lại vài lần cho tới khi vector khớp nội dung mới.
 */
export function EmbeddingInfo({ userId, refreshKey }: { userId: string; refreshKey?: unknown }) {
  const [index, setIndex] = useState<IndexStatus | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = (attemptsLeft: number): Promise<void> =>
      matchingApi.indexStatus(userId).then((res) => {
        if (cancelled) return;
        setIndex(res);
        if (res.status === "PENDING" && attemptsLeft > 0) timer = setTimeout(() => poll(attemptsLeft - 1), 2000);
      }).catch(() => { if (!cancelled) setIndex(null); });
    poll(5);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [userId, refreshKey]);
  if (index === undefined) return null;
  return (
    <span className="text-small text-ink-subtle">
      Chỉ mục gợi ý: {index === null ? "chưa lấy được trạng thái" : index.status === "PENDING" ? "đang cập nhật…" : `cập nhật lúc ${formatDateTime(index.indexedAt)}`}
    </span>
  );
}

/** Thanh hoàn thiện hồ sơ + mục còn thiếu đầu tiên (link tới mục tương ứng). */
export function CompletenessBar({ completeness, locate, matchingMin }: { completeness: Completeness; locate: (key: string, label: string) => string; matchingMin?: number }) {
  const done = completeness.items.filter((i) => i.done).length;
  const missing = completeness.items.filter((i) => !i.done);
  return (
    <section className="pe-complete" aria-label="Mức hoàn thiện hồ sơ">
      <div className="pe-complete-top">
        <b>Hồ sơ hoàn thiện {completeness.score}%</b>
        <span>{done}/{completeness.items.length} mục</span>
      </div>
      <Progress value={completeness.score} label="Mức hoàn thiện hồ sơ" />
      {missing.length > 0 ? (
        <a href={`#${locate(missing[0].key, missing[0].label)}`} onClick={(e) => { e.preventDefault(); jumpToSection(locate(missing[0].key, missing[0].label)); }}>
          Còn thiếu: {missing[0].label.charAt(0).toLowerCase() + missing[0].label.slice(1)}{missing.length > 1 ? ` và ${missing.length - 1} mục khác` : ""} →
        </a>
      ) : <span className="text-small text-ink-muted">Hồ sơ đã đầy đủ.</span>}
      {matchingMin !== undefined && completeness.score < matchingMin && <span className="text-small text-ink-muted">Cần từ {matchingMin}% để dùng AI Matching.</span>}
    </section>
  );
}
