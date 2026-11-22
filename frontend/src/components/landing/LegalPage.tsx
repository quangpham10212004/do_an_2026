import type { ReactNode } from "react";
import { Alert } from "@/components/ui";

export interface LegalSection { title: string; body: ReactNode }

/** Khung trang pháp lý (điều khoản, chính sách bảo mật). Nội dung là bản nháp. */
export default function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: LegalSection[] }) {
  return (
    <article className="legal">
      <h1>{title}</h1>
      <div className="legal-meta">Cập nhật lần cuối: 11/2026</div>
      <Alert tone="warning" title="Bản nháp" className="legal-draft">
        Nội dung dưới đây là bản nháp phục vụ đồ án, chưa được tư vấn pháp lý và sẽ được rà soát trước khi vận hành thật.
      </Alert>
      <p>{intro}</p>
      {sections.map((s, i) => (
        <section key={s.title}>
          <h2>{i + 1}. {s.title}</h2>
          {s.body}
        </section>
      ))}
    </article>
  );
}
