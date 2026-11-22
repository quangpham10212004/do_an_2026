import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/landing/LegalPage";

export const metadata: Metadata = { title: "Điều khoản sử dụng · MentorHub" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Điều khoản sử dụng"
      intro="Khi tạo tài khoản hoặc sử dụng MentorHub, bạn đồng ý với các điều khoản dưới đây. Vui lòng đọc kỹ trước khi tiếp tục."
      sections={[
        {
          title: "Về MentorHub",
          body: <p>MentorHub là nền tảng kết nối người học (mentee) với người hướng dẫn (mentor) trong lĩnh vực lập trình, gồm gợi ý mentor bằng AI, đặt lịch, thanh toán trong ví, ghi chú phiên học và blog cộng đồng.</p>,
        },
        {
          title: "Tài khoản",
          body: (
            <ul>
              <li>Bạn cung cấp thông tin chính xác và tự bảo mật mật khẩu của mình.</li>
              <li>Mỗi người chỉ nên có một tài khoản. Bạn chịu trách nhiệm về hoạt động phát sinh từ tài khoản.</li>
              <li>Mentor cần hoàn tất bước xác thực (CV, phỏng vấn AI trực tiếp có ghi hình) và được xác thực, có thể qua quản trị viên duyệt khi AI chưa kết luận được, trước khi nhận học viên.</li>
            </ul>
          ),
        },
        {
          title: "Phiên học và thanh toán",
          body: (
            <ul>
              <li>Học phí được giữ trong hệ thống cho tới khi phiên học hoàn tất, theo quy tắc hiển thị tại bước đặt lịch.</li>
              <li>Quy định đổi lịch, huỷ phiên và hoàn tiền được nêu rõ khi đặt lịch; phiên bản hiện tại dùng thanh toán thử nghiệm (sandbox).</li>
              <li>Không trao đổi thanh toán ngoài nền tảng để tránh rủi ro cho cả hai bên.</li>
            </ul>
          ),
        },
        {
          title: "Hành vi được phép và không được phép",
          body: (
            <ul>
              <li>Tôn trọng người khác; không quấy rối, lừa đảo hoặc đăng nội dung vi phạm pháp luật.</li>
              <li>Không giả mạo danh tính, bằng cấp hoặc kinh nghiệm.</li>
              <li>Không can thiệp vào hệ thống hoặc khai thác lỗi bảo mật.</li>
            </ul>
          ),
        },
        {
          title: "Nội dung của bạn",
          body: <p>Bạn giữ quyền với CV, bài viết blog và nội dung do mình đăng. Bạn cho phép MentorHub hiển thị và xử lý nội dung đó để vận hành dịch vụ, ví dụ gợi ý mentor và hiển thị bài viết công khai.</p>,
        },
        {
          title: "Tạm ngưng và chấm dứt",
          body: <p>MentorHub có thể tạm khoá hoặc chấm dứt tài khoản vi phạm điều khoản. Bạn có thể ngừng sử dụng bất kỳ lúc nào; việc xử lý số dư còn lại sẽ theo quy định hiển thị trong ví.</p>,
        },
        {
          title: "Giới hạn trách nhiệm",
          body: <p>MentorHub cung cấp nền tảng kết nối và không bảo đảm kết quả nghề nghiệp từ các phiên học. Gợi ý của AI mang tính tham khảo.</p>,
        },
        {
          title: "Thay đổi điều khoản và liên hệ",
          body: (
            <p>
              Điều khoản có thể được cập nhật; thay đổi quan trọng sẽ được thông báo trong ứng dụng. Xem thêm <Link href="/privacy">Chính sách bảo mật</Link>.
              Câu hỏi về điều khoản, vui lòng liên hệ nhóm phát triển qua trang giới thiệu.
            </p>
          ),
        },
      ]}
    />
  );
}
