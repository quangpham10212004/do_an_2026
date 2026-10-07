"use client";

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
    <div className="field" style={{ marginBottom: 8 }}>
      <div className="hint" style={{ marginBottom: 6 }}>
        <strong>CV của bạn sẽ đi đâu?</strong>
        <ul style={{ margin: "4px 0", paddingLeft: "1.2rem" }}>
          <li>Được lưu trên nền tảng MentorHub (file PDF và thông tin trích xuất); bạn có thể xoá bất cứ lúc nào ở mục &quot;CV của tôi&quot;.</li>
          <li>Được gửi tới DeepSeek (AI bên ngoài) để phân tích khi engine AI đang bật — <strong>chỉ khi bạn đánh dấu đồng ý bên dưới</strong>.</li>
          <li>
            {audience === "MENTEE"
              ? "Mentor mà bạn gửi yêu cầu mentoring (đang chờ hoặc đã nhận) xem được file CV; quản trị viên cũng xem được."
              : "Chỉ bạn và quản trị viên xem được file CV."}
          </li>
        </ul>
      </div>
      <label className="row" style={{ gap: 8, alignItems: "flex-start", fontWeight: "normal" }}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: "auto", marginTop: 3 }} />
        <span>Tôi đồng ý gửi nội dung CV tới DeepSeek (AI bên ngoài) để phân tích chính xác hơn.</span>
      </label>
      <div className="hint">
        {checked
          ? "Nếu engine AI không bật hoặc lỗi, hệ thống tự dùng engine rule-based."
          : "Không đồng ý: CV và cuộc trò chuyện chỉ được xử lý bằng engine rule-based ngay trên máy chủ nền tảng, không gửi ra ngoài."}
      </div>
    </div>
  );
}
