"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Alert, Button, Field, Modal } from "@/components/ui";
import { DOMAINS, domainLabel } from "@/features/profile/api";
import { errorMessage } from "@/lib/api";
import type { Uuid } from "@/types";
import { domainsApi, interviewHref } from "./api";

const MAX_CV_BYTES = 5 * 1024 * 1024;

/** Thêm lĩnh vực: chọn lĩnh vực, (tuỳ chọn) tải CV mới, rồi chuyển sang xác thực ở /interview?domain=<id>. */
export default function AddDomainDialog({ mentorId, existing, onClose }: { mentorId: Uuid; existing: string[]; onClose: () => void }) {
  const router = useRouter();
  const fileId = useId();
  const options = DOMAINS.filter(([v]) => !existing.includes(v));
  const [domain, setDomain] = useState(options[0]?.[0] ?? "");
  const [cv, setCv] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (!/\.(pdf|docx)$/i.test(file.name)) return setError("CV phải là PDF hoặc DOCX.");
    if (file.size > MAX_CV_BYTES) return setError("CV tối đa 5 MB.");
    setError(""); setCv(file);
  }

  async function submit() {
    if (!domain) return;
    setBusy(true); setError("");
    try {
      await domainsApi.add(mentorId, { domain, cv });
      router.push(interviewHref(domain));
    } catch (e) {
      setError(errorMessage(e)); setBusy(false);
    }
  }

  return (
    <Modal title="Thêm lĩnh vực mới" onClose={onClose} width={520}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button variant="primary" loading={busy} disabled={!domain} onClick={submit}>Tiếp tục xác thực</Button>
      </>}>
      {options.length === 0 ? (
        <Alert tone="info">Bạn đã có tất cả lĩnh vực hiện có.</Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-small text-ink-muted">Lĩnh vực mới đi qua một buổi phỏng vấn AI riêng. Các lĩnh vực hiện tại vẫn hoạt động bình thường trong lúc chờ.</p>
          {error && <Alert tone="danger">{error}</Alert>}
          <div role="radiogroup" aria-label="Chọn lĩnh vực" className="dom-pick">
            {options.map(([v, l]) => (
              <label key={v}>
                <input type="radio" name="add-domain" value={v} checked={domain === v} onChange={() => setDomain(v)} />
                <span>{l}</span>
              </label>
            ))}
          </div>
          <Field label={`CV cho ${domainLabel(domain)}`} id={fileId} hint="Khuyên dùng: CV mới tập trung vào lĩnh vực này. Bỏ trống để dùng lại CV hiện tại. PDF hoặc DOCX, tối đa 5 MB.">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={fileId} className="btn">
                <Upload aria-hidden="true" />
                {cv ? "Đổi tệp" : "Chọn tệp từ máy"}
              </label>
              <input id={fileId} type="file" accept=".pdf,.docx,application/pdf" className="sr-only" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
              {cv && <span className="min-w-0 truncate text-small">{cv.name}</span>}
            </div>
          </Field>
        </div>
      )}
    </Modal>
  );
}
