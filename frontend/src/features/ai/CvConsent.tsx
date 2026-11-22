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
        <div className="font-semibold">Về dữ liệu CV của bạn</div>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-ink-muted">
          <li>
            {audience === "MENTEE"
              ? "CV chỉ bạn và hệ thống đọc được, mentor chỉ thấy sau khi bạn gửi yêu cầu cho họ."
              : "CV chỉ bạn, hệ thống và quản trị viên đọc được."}
          </li>
          <li>Nội dung được AI phân tích để rút kỹ năng, kinh nghiệm và dự án.</li>
          <li>Bạn có thể xoá CV bất cứ lúc nào trong “CV của tôi”.</li>
        </ul>
      </div>
      <Checkbox
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        label="Tôi đồng ý gửi nội dung CV tới dịch vụ AI bên ngoài (DeepSeek) để phân tích chính xác hơn."
      />
      <div className="field-hint">
        {checked
          ? "Nếu engine AI không bật hoặc lỗi, hệ thống tự dùng engine rule-based."
          : "Không đồng ý: CV và cuộc trò chuyện chỉ được xử lý bằng engine rule-based trên máy chủ MentorHub, không gửi ra ngoài."}
      </div>
    </div>
  );
}
