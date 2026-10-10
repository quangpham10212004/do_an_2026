"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Eye, FileText, Trash2 } from "lucide-react";
import { Alert, Button, Card, CardHeader, EmptyState, List, ListRow, Loading, useDialog } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { CvSummary } from "@/types";

/**
 * Mở file CV (cần access token nên không dùng được <a href> trực tiếp). Cửa sổ mới được mở ngay
 * trong sự kiện click để không bị chặn popup, rồi mới trỏ tới object URL khi tải xong.
 * `download`: lưu file thay vì xem.
 */
export async function openCvFile(url: string, fileName = "cv.pdf", download = false): Promise<void> {
  if (!url.startsWith("/api/ai/cv/")) throw new Error("Đường dẫn CV không hợp lệ");
  const win = download ? null : window.open("", "_blank");
  try {
    const objectUrl = URL.createObjectURL(await aiApi.cvFile(url));
    if (win) {
      win.location.href = objectUrl;
    } else {
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (e) {
    win?.close();
    throw e;
  }
}

interface MyCvsProps {
  /** Đổi giá trị để tải lại danh sách (vd. sau khi vừa tải CV mới lên). */
  refreshKey?: number;
  /** Gọi sau khi xoá thành công — trang hồ sơ dùng để làm mới cvFileUrl. */
  onDeleted?: (cv: CvSummary) => void;
}

/** Mục "CV của tôi": liệt kê CV đã tải lên, xem/tải xuống và xoá (chính sách dữ liệu CV). */
export default function MyCvs({ refreshKey = 0, onDeleted }: MyCvsProps) {
  const [cvs, setCvs] = useState<CvSummary[] | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, ask] = useDialog();

  const load = useCallback(() => {
    setError("");
    return aiApi
      .myCvs()
      .then((list) => setCvs(list ?? []))
      .catch((e: unknown) => {
        setError(errorMessage(e));
        setCvs((cur) => cur ?? null);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function open(cv: CvSummary, download: boolean) {
    setError("");
    try {
      await openCvFile(cv.fileUrl, cv.fileName, download);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove(cv: CvSummary) {
    const ok = await ask({
      title: `Xoá CV "${cv.fileName}"?`,
      message: "File PDF, dữ liệu trích xuất và cuộc trò chuyện làm rõ mục tiêu (chatbot) gắn với CV này cũng bị xoá vĩnh viễn. Không thể hoàn tác.",
      confirmText: "Xoá CV",
      danger: true,
    });
    if (!ok) return;
    // US-45 (PRD-CV-6) — hỏi thêm khi CV đã thêm kỹ năng vào hồ sơ
    const added = cv.addedSkills ?? [];
    const removeSkills = added.length > 0 && !!(await ask({
      title: "Gỡ cả kỹ năng đã thêm từ CV này?",
      message: `Các kỹ năng sau được thêm vào hồ sơ từ CV này: ${added.join(", ")}. Chọn "Gỡ kỹ năng" để xoá chúng khỏi hồ sơ, hoặc "Giữ kỹ năng".`,
      confirmText: "Gỡ kỹ năng",
      cancelText: "Giữ kỹ năng",
    }));
    setBusyId(cv.id);
    setError("");
    setMsg("");
    try {
      await aiApi.deleteCv(cv.id, removeSkills);
      setMsg(`Đã xoá CV "${cv.fileName}"${removeSkills ? " và gỡ các kỹ năng đã thêm từ CV" : ""}.`);
      onDeleted?.(cv);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
      await load();
    }
  }

  return (
    <Card>
      <div id="my-cvs" />
      {dialog}
      <CardHeader
        title="CV của tôi"
        description="Mỗi CV gồm file PDF gốc, văn bản và thông tin trích xuất, cùng cuộc trò chuyện làm rõ mục tiêu nếu có. File và văn bản gốc tự động xoá sau 12 tháng; thông tin bạn đã xác nhận được giữ lại."
      />
      {(msg || error) && (
        <div className="flex flex-col gap-2 px-5 pt-4">
          <Alert tone="success">{msg}</Alert>
          {error && <Alert action={<Button size="sm" variant="ghost" onClick={() => load()}>Thử lại</Button>}>{error}</Alert>}
        </div>
      )}
      {cvs === undefined && <Loading text="Đang tải danh sách CV…" />}
      {cvs?.length === 0 && <EmptyState icon={FileText} title="Chưa có CV nào">CV bạn tải lên sẽ hiện ở đây.</EmptyState>}
      {!!cvs?.length && (
        <List>
          {cvs.map((cv) => (
            <ListRow
              key={cv.id}
              leading={<FileText aria-hidden="true" className="size-5 flex-none text-ink-subtle" />}
              title={cv.fileName}
              meta={<>
                Tải lên {formatDateTime(cv.uploadedAt)} · {cv.consentExternalAi ? "đồng ý gửi AI bên ngoài (DeepSeek)" : "chỉ xử lý trên MentorHub (rule-based)"}
                <br />
                {cv.purgedAt ? `File đã xoá theo chính sách lưu giữ (${formatDateTime(cv.purgedAt)})` : `Tự động xoá file sau ${formatDateTime(cv.deleteAfter)}`}
                {(cv.addedSkills ?? []).length > 0 && <> · Kỹ năng đã thêm: {cv.addedSkills.join(", ")}</>}
              </>}
              trailing={<>
                {!cv.purgedAt && <Button size="sm" icon={Eye} onClick={() => open(cv, false)}>Xem</Button>}
                {!cv.purgedAt && <Button size="sm" variant="ghost" iconOnly icon={Download} label="Tải xuống" onClick={() => open(cv, true)} />}
                <Button size="sm" variant="danger-quiet" icon={Trash2} loading={busyId === cv.id} onClick={() => remove(cv)}>
                  {busyId === cv.id ? "Đang xoá…" : "Xoá"}
                </Button>
              </>}
            />
          ))}
        </List>
      )}
    </Card>
  );
}
