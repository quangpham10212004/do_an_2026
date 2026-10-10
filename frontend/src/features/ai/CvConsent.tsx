"use client";

import { Checkbox } from "@/components/ui";

/**
 * US-19 (PRD-CV-1) — giải thích CV đi đâu + ô đồng ý gửi CV tới AI bên ngoài (DeepSeek), hiển thị TRƯỚC
 * khi chọn file. Không đồng ý vẫn tải được: CV khi đó chỉ được xử lý bằng engine rule-based trên máy chủ
 * nền tảng (parse và mọi lượt chatbot của CV đó).
 */
interface CvConsentProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Ai xem được file CV: mentee — mentor mình gửi yêu cầu; mentor — chỉ bạn và quản trị viên. */
  audience: "MENTEE" | "MENTOR";
  disabled?: boolean;
}

export default function CvConsent({ checked, onChange, audience, disabled }: CvConsentProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="well flex flex-col gap-2 text-small">
        <div className="font-semibold">CV của bạn sẽ đi đâu?</div>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-ink-muted">
          <li>Được lưu trên MentorHub (file PDF và thông tin trích xuất). Bạn xoá được bất cứ lúc nào ở mục “CV của tôi”.</li>
          <li>Được gửi tới DeepSeek (AI bên ngoài) để phân tích khi engine AI đang bật, <strong className="text-ink">chỉ khi bạn đồng ý bên dưới</strong>.</li>
          <li>
            {audience === "MENTEE"
              ? "Mentor mà bạn gửi yêu cầu mentoring (đang chờ hoặc đã nhận) xem được file CV; quản trị viên cũng xem được."
              : "Chỉ bạn và quản trị viên xem được file CV."}
          </li>
        </ul>
      </div>
      <Checkbox
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        label="Tôi đồng ý gửi nội dung CV tới DeepSeek (AI bên ngoài) để phân tích chính xác hơn."
      />
      <div className="field-hint">
        {checked
          ? "Nếu engine AI không bật hoặc lỗi, hệ thống tự dùng engine rule-based."
          : "Không đồng ý: CV và cuộc trò chuyện chỉ được xử lý bằng engine rule-based trên máy chủ MentorHub, không gửi ra ngoài."}
      </div>
    </div>
  );
}
