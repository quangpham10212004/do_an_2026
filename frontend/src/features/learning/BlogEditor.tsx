"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bold, Check, Code, Heading2, ImagePlus, Italic, Link2, X } from "lucide-react";
import { Alert, Button, Field, FlashAlerts, Input, Loading, PageHeader, Segmented, Textarea, useDialog, type Flash } from "@/components/ui";
import Markdown from "@/features/learning/Markdown";
import { blogApi } from "@/features/learning/blogApi";
import { blogX, type BlogVisibility, type LocalDraft } from "@/features/socialx/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { BlogPostDetail } from "@/types";

const MIN_CONTENT = 300;
const MIN_TITLE = 10;
const MAX_TAGS = 5;
/** Tự lưu nháp sau khi ngừng gõ chừng này mili giây. */
const AUTOSAVE_MS = 3000;

/** Soạn / sửa bài Markdown. `postId` có giá trị = sửa bài của mình. */
export default function BlogEditor({ postId }: { postId?: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<boolean | null>(postId ? null : true);
  const [post, setPost] = useState<BlogPostDetail | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [cover, setCover] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<BlogVisibility>("PUBLIC");
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [autosavedAt, setAutosavedAt] = useState<string | null>(null);
  const [restorable, setRestorable] = useState<LocalDraft | null>(null);
  const [flash, setFlash] = useState<Flash>({});
  const [dialog, ask] = useDialog();
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Chỉ tự lưu sau khi người dùng đã sửa gì đó, để không ghi đè nháp cũ ngay khi vừa mở trang. */
  const dirty = useRef(false);

  useEffect(() => {
    const local = blogX.loadDraft(postId);
    if (local && (local.title || local.contentMd)) setRestorable(local);
    if (postId) blogX.getVisibility(postId).then(setVisibility).catch(() => {});
  }, [postId]);

  useEffect(() => {
    if (!postId) return;
    blogApi.forEdit(postId).then((p) => {
      setPost(p);
      setTitle(p.title);
      setSummary(p.summary);
      setContent(p.contentMd);
      setCover(p.coverUrl ?? "");
      setTags(p.tags.join(", "));
      setLoaded(true);
    }).catch((e: unknown) => { setFlash({ error: errorMessage(e) }); setLoaded(false); });
  }, [postId]);

  // Tự lưu nháp vào trình duyệt (localStorage); chưa cần API.
  useEffect(() => {
    if (!dirty.current || loaded !== true || post?.status === "UNPUBLISHED") return;
    const timer = setTimeout(() => {
      if (!title && !content) return;
      setAutosavedAt(blogX.saveDraft(postId, { title, summary, contentMd: content, coverUrl: cover, tags, visibility }));
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [title, summary, content, cover, tags, visibility, postId, loaded, post?.status]);

  /** Bọc setter để đánh dấu "đã sửa" cho cơ chế tự lưu. */
  const edit = <T,>(set: (v: T) => void) => (v: T) => { dirty.current = true; set(v); };

  function restore() {
    if (!restorable) return;
    dirty.current = true;
    setTitle(restorable.title);
    setSummary(restorable.summary);
    setContent(restorable.contentMd);
    setCover(restorable.coverUrl);
    setTags(restorable.tags);
    setVisibility(restorable.visibility);
    setRestorable(null);
    setFlash({ ok: "Đã khôi phục bản nháp tự lưu." });
  }

  function dropLocal() {
    blogX.clearDraft(postId);
    setRestorable(null);
  }

  async function pickCover(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setFlash({});
    try {
      const { url } = await blogX.uploadCover(file);
      edit(setCover)(url);
    } catch (e) {
      setFlash({ error: errorMessage(e) });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
  const body = () => ({
    title: title.trim(),
    summary: summary.trim(),
    contentMd: content,
    coverUrl: cover.trim() || null,
    tags: tagList,
    visibility,
  });

  async function save(publish: boolean) {
    setBusy(true);
    setFlash({});
    try {
      let saved = postId ? await blogApi.update(postId, body()) : await blogApi.create(body());
      if (publish && saved.status !== "PUBLISHED") saved = await blogApi.publish(saved.id);
      blogX.clearDraft(postId);
      dirty.current = false;
      setAutosavedAt(null);
      if (publish) router.push(`/blog/${saved.slug}`);
      else {
        setPost(saved);
        setFlash({ ok: "Đã lưu nháp." });
        if (!postId) router.replace(`/blog/edit/${saved.id}`);
      }
    } catch (e) {
      setFlash({ error: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    if (!postId) return;
    if (!(await ask({ title: "Gỡ đăng bài này?", message: "Bài chuyển về Nháp và không còn hiển thị công khai. Lượt xem, thích và bình luận được giữ lại khi bạn đăng lại.", confirmText: "Gỡ đăng", cancelText: "Giữ lại" }))) return;
    setBusy(true);
    try {
      setPost(await blogApi.unpublish(postId));
      setFlash({ ok: "Đã gỡ đăng. Bài chuyển về Nháp." });
    } catch (e) {
      setFlash({ error: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (!postId) return;
    if (!(await ask({ title: "Xoá bài nháp này?", message: "Bài sẽ bị xoá và không thể hoàn tác.", confirmText: "Xoá", danger: true }))) return;
    try {
      await blogApi.remove(postId);
      blogX.clearDraft(postId);
      router.push("/blog/me");
    } catch (e) {
      setFlash({ error: errorMessage(e) });
    }
  }

  /** Bọc đoạn đang chọn (hoặc chèn mẫu) bằng cú pháp Markdown. */
  function format(before: string, after: string, placeholder: string) {
    const el = area.current;
    const start = el?.selectionStart ?? content.length;
    const end = el?.selectionEnd ?? content.length;
    const picked = content.slice(start, end) || placeholder;
    edit(setContent)(content.slice(0, start) + before + picked + after + content.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + before.length, start + before.length + picked.length);
    });
  }

  if (loaded === null) return <Loading />;
  if (loaded === false) return <Alert>{flash.error || "Không tìm thấy bài viết."}</Alert>;

  const takenDown = post?.status === "UNPUBLISHED";
  const published = post?.status === "PUBLISHED";
  const checks: [boolean, string][] = [
    [title.trim().length >= MIN_TITLE, `Tiêu đề từ ${MIN_TITLE} ký tự`],
    [content.length >= MIN_CONTENT, `Nội dung từ ${MIN_CONTENT} ký tự`],
    [tagList.length >= 1 && tagList.length <= MAX_TAGS, `Có từ 1 đến ${MAX_TAGS} tag`],
    [!!cover.trim(), "Có ảnh bìa (không bắt buộc)"],
  ];
  const tools: [string, typeof Bold, () => void][] = [
    ["In đậm", Bold, () => format("**", "**", "chữ đậm")],
    ["In nghiêng", Italic, () => format("_", "_", "chữ nghiêng")],
    ["Tiêu đề", Heading2, () => format("\n## ", "\n", "Tiêu đề")],
    ["Khối mã", Code, () => format("\n```\n", "\n```\n", "mã")],
    ["Chèn liên kết", Link2, () => format("[", "](https://)", "chữ liên kết")],
  ];

  return (
    <>
      {dialog}
      <PageHeader back={{ href: "/blog/me", label: "Bài của tôi" }} title={postId ? "Chỉnh sửa bài viết" : "Viết bài mới"}
        description="Viết bằng Markdown: tiêu đề #, danh sách -, khối mã ```, link [chữ](url)."
        actions={
          <div className="flex flex-wrap gap-2">
            {published && <Button disabled={busy} onClick={unpublish}>Gỡ đăng</Button>}
            {postId && !published && <Button variant="danger-quiet" disabled={busy} onClick={discard}>Xoá nháp</Button>}
            {!published && <Button disabled={busy || takenDown} onClick={() => save(false)}>Lưu nháp</Button>}
            <Button variant="primary" loading={busy} disabled={busy || takenDown} onClick={() => save(true)}>{published ? "Lưu thay đổi" : "Đăng bài"}</Button>
          </div>
        } />
      <FlashAlerts flash={flash} className="mb-4" />
      {restorable && (
        <Alert tone="info" title="Có bản nháp tự lưu trên trình duyệt này" className="mb-4"
          action={<span className="flex gap-2"><Button size="sm" onClick={restore}>Khôi phục</Button><Button size="sm" variant="ghost" onClick={dropLocal}>Bỏ qua</Button></span>}>
          Lưu lúc {formatDateTime(restorable.savedAt)}{restorable.title ? ` · ${restorable.title}` : ""}.
        </Alert>
      )}
      {takenDown && <Alert tone="warning" title="Bài đã bị quản trị viên gỡ" className="mb-4">{post?.unpublishReason} Bạn không thể đăng lại bài này.</Alert>}
      <div className="pf-grid !mt-0">
        <main className="pf-main">
          <section className="pf-section">
            <div className="pf-section-body !pt-6 flex flex-col gap-4">
              <Field label="Tiêu đề" id="b-title" required hint="10–150 ký tự">
                <Input id="b-title" value={title} maxLength={150} onChange={(e) => edit(setTitle)(e.target.value)} />
                <div className="sc-count tabular">{title.length} / 150</div>
              </Field>
              <Field label="Tag" id="b-tags" hint={`Tối đa ${MAX_TAGS} tag, cách nhau bằng dấu phẩy. Ví dụ: Java, Spring Boot`}>
                <Input id="b-tags" value={tags} onChange={(e) => edit(setTags)(e.target.value)} />
                {tagList.length > 0 && <div className="sc-tags mt-2" aria-label="Tag đã nhập">{tagList.map((t, i) => <span key={`${t}-${i}`} className="sc-tag">{t}</span>)}</div>}
              </Field>
              <Field label="Tóm tắt" id="b-summary" hint="Bỏ trống để tự lấy từ nội dung"><Textarea id="b-summary" rows={3} maxLength={300} value={summary} onChange={(e) => edit(setSummary)(e.target.value)} /></Field>
              <Field label="Ảnh bìa" id="b-cover" hint="Không bắt buộc. Tải ảnh PNG, JPG, WebP (tối đa 5 MB) hoặc dán URL.">
                {cover && (
                  <div className="sc-cover-pick">
                    {/* eslint-disable-next-line @next/next/no-img-element -- xem trước ảnh bìa (data URL hoặc URL ngoài) */}
                    <img src={cover} alt="Ảnh bìa đã chọn" />
                    <Button size="sm" icon={X} onClick={() => edit(setCover)("")}>Xoá ảnh</Button>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" tabIndex={-1} aria-label="Chọn ảnh bìa từ máy"
                    onChange={(e) => pickCover(e.target.files?.[0])} />
                  <Button icon={ImagePlus} loading={uploading} onClick={() => fileInput.current?.click()}>{cover ? "Đổi ảnh" : "Tải ảnh từ máy"}</Button>
                  <Input id="b-cover" type="url" aria-label="URL ảnh bìa" className="min-w-0 flex-1 basis-[200px]" placeholder="hoặc dán URL https://…"
                    value={cover.startsWith("data:") ? "" : cover} onChange={(e) => edit(setCover)(e.target.value)} />
                </div>
              </Field>
            </div>
          </section>

          <section className="pf-section">
            <div className="pf-section-head">
              <div className="sc-toolbar" role="toolbar" aria-label="Định dạng Markdown">
                {tools.map(([label, Icon, act]) => (
                  <button key={label} type="button" className="sc-tool" aria-label={label} title={label} disabled={mode !== "write"} onClick={act}><Icon aria-hidden="true" /></button>
                ))}
              </div>
              <Segmented value={mode} onChange={setMode} options={[{ id: "write", label: "Viết" }, { id: "preview", label: "Xem trước" }]} />
            </div>
            <div className="pf-section-body">
              {mode === "write"
                ? <Textarea ref={area} aria-label="Nội dung Markdown" rows={18} maxLength={50000} className="font-mono" value={content} onChange={(e) => edit(setContent)(e.target.value)} />
                : content.trim() ? <Markdown source={content} /> : <p className="text-ink-muted">Chưa có nội dung để xem trước.</p>}
              <div className="mt-2 flex flex-wrap justify-between gap-2 text-small text-ink-subtle">
                <span className="tabular">{content.length.toLocaleString("vi-VN")} ký tự · cần tối thiểu {MIN_CONTENT} để đăng</span>
                <span role="status" className="sc-saved">
                  {autosavedAt ? `Đã tự lưu nháp lúc ${new Date(autosavedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : "Hỗ trợ Markdown"}
                </span>
              </div>
            </div>
          </section>
        </main>

        <aside className="pf-side" aria-label="Hướng dẫn đăng bài">
          <section className="pf-section">
            <div className="pf-section-head"><h2>Trước khi đăng</h2></div>
            <div className="pf-section-body">
              <ul className="sc-check">
                {checks.map(([ok, label]) => (
                  <li key={label} data-ok={ok}>
                    <span className="dot" aria-hidden="true"><Check /></span>
                    <span>{label}<span className="sr-only">{ok ? " — đã đạt" : " — chưa đạt"}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <section className="pf-section">
            <div className="pf-section-head"><h2>Hiển thị</h2></div>
            <div className="pf-section-body">
              <Segmented value={visibility} onChange={edit(setVisibility)} options={[{ id: "PUBLIC", label: "Công khai trên Blog" }, { id: "UNLISTED", label: "Chỉ người có liên kết" }]} />
              <p className="mt-2 text-small text-ink-muted">
                {visibility === "PUBLIC" ? "Bài hiện trong danh sách Blog và kết quả tìm kiếm." : "Bài không hiện trong danh sách Blog; ai có liên kết vẫn đọc được."}
              </p>
            </div>
          </section>
          <div className="sc-note"><b>Bài bị gỡ?</b> Nếu quản trị viên gỡ bài, bạn thấy lý do ở đầu trang chỉnh sửa và không thể đăng lại bài đó.</div>
        </aside>
      </div>
    </>
  );
}
