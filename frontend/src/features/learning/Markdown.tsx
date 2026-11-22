"use client";

import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

export interface TocItem { id: string; text: string; level: 2 | 3 }

function slugify(text: string): string {
  return text
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "muc";
}

/** Bỏ ký tự định dạng inline để lấy chữ thuần của tiêu đề. */
function plain(md: string): string {
  return md.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_~]/g, "").trim();
}

/** Sinh mục lục từ tiêu đề ## và ### của Markdown (bỏ qua khối mã); id duy nhất theo thứ tự xuất hiện. */
export function extractToc(source: string): TocItem[] {
  const items: TocItem[] = [];
  const used = new Map<string, number>();
  let fenced = false;
  for (const line of source.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = plain(m[2]);
    const base = slugify(text);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    items.push({ id: n === 0 ? base : `${base}-${n + 1}`, text, level: m[1].length as 2 | 3 });
  }
  return items;
}

function textOf(node: ReactNode): string {
  return Children.toArray(node).map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : isValidElement(c) ? textOf((c.props as { children?: ReactNode }).children) : "")).join("");
}

/**
 * Render Markdown của bài blog. Không bật HTML thô (react-markdown mặc định bỏ qua) và vẫn sanitize thêm
 * bằng rehype-sanitize; link mở tab mới với rel an toàn. Tiêu đề h2/h3 có id khớp `extractToc` để cuộn tới.
 */
export default function Markdown({ source }: { source: string }) {
  // Cùng thuật toán đặt id với extractToc: duyệt theo thứ tự xuất hiện trong mỗi lần render.
  const toc = extractToc(source);
  let cursor = 0;
  const heading = (Tag: "h2" | "h3") => function Heading({ children }: { children?: ReactNode }) {
    const item = toc[cursor++];
    const id = item && item.text === plain(textOf(children)) ? item.id : undefined;
    return <Tag id={id} className="scroll-mt-24">{children}</Tag>;
  };
  return (
    <div className="blog-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h2: heading("h2"),
          h3: heading("h3"),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">{children}</a>
          ),
          // eslint-disable-next-line @next/next/no-img-element
          img: ({ src, alt }) => <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} loading="lazy" />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

/** Mục lục bài viết; không hiện khi có ít hơn 2 mục. */
export function TableOfContents({ source }: { source: string }) {
  const toc = extractToc(source);
  if (toc.length < 2) return null;
  return (
    <nav className="sc-toc" aria-label="Nội dung bài viết">
      <h2>Nội dung bài viết</h2>
      <ol>
        {toc.map((t) => (
          <li key={t.id} data-level={t.level}><a href={`#${t.id}`}>{t.text}</a></li>
        ))}
      </ol>
    </nav>
  );
}
