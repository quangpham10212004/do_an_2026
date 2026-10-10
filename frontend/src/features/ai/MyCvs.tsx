"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Loading, useDialog } from "@/components/ui";
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
    <div className="card" id="my-cvs">
      {dialog}
      <h2>CV của tôi</h2>
      <p className="muted small">
        Với mỗi CV, hệ thống lưu file PDF gốc, văn bản và thông tin trích xuất (kỹ năng, kinh nghiệm, dự án, học vấn) cùng cuộc
        trò chuyện làm rõ mục tiêu nếu có. File và văn bản gốc được tự động xoá sau 12 tháng (thông tin bạn đã xác nhận được
        giữ lại). Bạn có thể xoá bất cứ lúc nào.
      </p>
      <Alert type="success">{msg}</Alert>
      {error && (
        <Alert>
          {error} <button type="button" className="btn ghost sm" onClick={() => load()}>Thử lại</button>
        </Alert>
      )}
      {cvs === undefined && <Loading text="Đang tải danh sách CV..." />}
      {cvs?.length === 0 && <p className="muted">Bạn chưa tải CV nào lên.</p>}
      {cvs?.map((cv) => (
        <div key={cv.id} className="list-item">
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{cv.fileName}</strong>
            <div className="muted small">
              Tải lên {formatDateTime(cv.uploadedAt)} · {cv.consentExternalAi ? "đồng ý gửi AI bên ngoài (DeepSeek)" : "chỉ xử lý trên nền tảng (rule-based)"}
              <br />{cv.purgedAt ? `File đã được xoá theo chính sách lưu giữ (${formatDateTime(cv.purgedAt)})` : `Tự động xoá file sau ${formatDateTime(cv.deleteAfter)}`}
              {(cv.addedSkills ?? []).length > 0 && <> · Kỹ năng đã thêm: {cv.addedSkills.join(", ")}</>}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {!cv.purgedAt && <button type="button" className="btn secondary sm" onClick={() => open(cv, false)}>Xem</button>}
            {!cv.purgedAt && <button type="button" className="btn ghost sm" onClick={() => open(cv, true)}>Tải xuống</button>}
            <button type="button" className="btn danger sm" disabled={busyId === cv.id} onClick={() => remove(cv)}>
              {busyId === cv.id ? "Đang xoá..." : "Xoá"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
