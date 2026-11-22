"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, FileWarning, Info, Lock, ShieldCheck } from "lucide-react";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui";
import { classifyUploadError, formatSize, onbxApi, type CvInsight } from "./api";
import { ApiError, errorMessage } from "@/lib/api";

/** Chip "Độ đầy đủ CV 70%". */
export function CompletenessChip({ percent }: { percent: number }) {
  const tone = percent >= 70 ? "badge-success" : percent >= 40 ? "badge-warning" : "badge-danger";
  return <span className={`badge ${tone} ob-complete`} title="Độ đầy đủ CV">Độ đầy đủ CV: {percent}%</span>;
}

/** Khối "CV chưa nói về…". */
export function CvMissing({ insight }: { insight: CvInsight | null }) {
  if (!insight || insight.missing.length === 0) return null;
  return (
    <div className="well text-small">
      <b>CV chưa nói về:</b> {insight.missing.join(", ")}. Bước tiếp theo, chatbot sẽ hỏi riêng những điều này.
    </div>
  );
}

/** Lỗi tải CV: thông báo tiếng Việt theo loại lỗi; "AI bận" là cảnh báo vì CV đã được lưu. */
export function uploadErrorAlert(err: unknown, file?: File | null): { tone: "danger" | "warning"; text: string } {
  const e = err instanceof ApiError ? err : null;
  const kind = classifyUploadError(e?.status, e?.code);
  if (kind === "unreadable") return { tone: "danger", text: "Không đọc được tệp. Tệp bị khoá mật khẩu hoặc là ảnh quét. Hãy xuất lại thành PDF có chữ chọn được." };
  if (kind === "too-large") return { tone: "danger", text: `Tệp quá lớn${file ? ` (${formatSize(file.size)})` : ""}. Giới hạn là 5 MB.` };
  if (kind === "ai-busy") return { tone: "warning", text: "AI tạm thời bận. Chúng tôi đã lưu CV, sẽ phân tích bằng cách đơn giản hơn. Bạn vẫn đi tiếp được." };
  return { tone: "danger", text: errorMessage(err) };
}

/** Khối "Về dữ liệu CV của bạn" ngắn gọn dùng ở các màn kiểm tra thông tin. */
export function CvPrivacyNote({ children }: { children?: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-small text-ink-muted">
      <Lock aria-hidden="true" className="mt-0.5 size-4 flex-none" />
      <span>{children ?? "CV chỉ bạn và hệ thống đọc được. Mentor chỉ thấy sau khi bạn gửi yêu cầu cho họ."}</span>
    </p>
  );
}

/** Khối "Vì sao hỏi?" ở bước chatbot. */
export function WhyAsk() {
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Info aria-hidden="true" className="size-4 text-accent" />Vì sao hỏi?</span>} />
      <CardBody>
        <p className="text-small text-ink-muted">Câu trả lời giúp AI Matching hiểu bạn cần gì, không chỉ bạn đã biết gì. Bạn sửa được ở bất kỳ bước nào.</p>
      </CardBody>
    </Card>
  );
}

/** Khối "Quyền riêng tư" của trang CV của tôi: công tắc cho phép AI bên ngoài + ghi chú theo vai trò. */
export function CvPrivacyCard({ isMentor }: { isMentor: boolean }) {
  const [allow, setAllow] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    onbxApi.getPrivacy().then((p) => setAllow(p.allowExternalAi)).catch(() => setAllow(false));
  }, []);

  async function change(next: boolean) {
    setBusy(true);
    setError("");
    try {
      setAllow((await onbxApi.setPrivacy({ allowExternalAi: next })).allowExternalAi);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-4 text-accent" />Quyền riêng tư</span>} />
      <CardBody className="flex flex-col gap-4">
        <ul className="flex list-disc flex-col gap-1 pl-5 text-small text-ink-muted">
          <li>Mentor chỉ thấy CV sau khi bạn gửi yêu cầu cho họ.</li>
          <li>Nội dung CV gốc tự xoá sau 12 tháng không dùng.</li>
          <li>Xoá CV không xoá hồ sơ bạn đã lưu.</li>
        </ul>
        <Alert>{error}</Alert>
        <label className="ob-switch">
          <input type="checkbox" role="switch" checked={!!allow} disabled={allow === null || busy}
            onChange={(e) => change(e.target.checked)} aria-label="Cho phép AI bên ngoài phân tích CV" />
          <span className="ob-switch-track" aria-hidden="true" />
          <span className="font-medium">Cho phép AI bên ngoài phân tích CV</span>
        </label>
        {isMentor && (
          <p className="flex items-start gap-2 text-small text-ink-muted">
            <FileWarning aria-hidden="true" className="mt-0.5 size-4 flex-none" />
            <span>Mentor: CV là bắt buộc để được xác thực. Nếu bạn thay CV khi đang chờ duyệt, bản tóm tắt ẩn danh sẽ được tạo lại và hồ sơ quay lại hàng chờ.</span>
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/** Thanh bước dùng chung cho luồng mentee (Tải CV → Kiểm tra → Trò chuyện → Gợi ý mentor). */
export function OnbSteps({ current, labels }: { current: number; labels: string[] }) {
  return (
    <ol className="ob-steps" aria-label="Các bước làm hồ sơ">
      {labels.map((label, i) => {
        const st = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={label} data-state={st} aria-current={st === "current" ? "step" : undefined}>
            <span className="ob-dot">{st === "done" ? <Check aria-hidden="true" /> : i + 1}</span>
            <span className="ob-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
