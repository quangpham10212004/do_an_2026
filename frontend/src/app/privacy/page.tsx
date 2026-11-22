import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/landing/LegalPage";

export const metadata: Metadata = { title: "Chính sách bảo mật · MentorHub" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Chính sách bảo mật"
      intro="Chính sách này giải thích MentorHub thu thập, sử dụng và bảo vệ thông tin của bạn như thế nào khi bạn dùng nền tảng."
      sections={[
        {
          title: "Thông tin chúng tôi thu thập",
          body: (
            <ul>
              <li>Thông tin tài khoản: họ tên, email, vai trò, mật khẩu (được lưu dưới dạng băm).</li>
              <li>Hồ sơ: CV, kỹ năng, mục tiêu, lịch rảnh, ảnh đại diện và video giới thiệu của mentor.</li>
              <li>Hoạt động: phiên học, tin nhắn, ghi chú, đánh giá, giao dịch trong ví và bài viết blog.</li>
              <li>Dữ liệu kỹ thuật: thiết bị, múi giờ và nhật ký truy cập phục vụ bảo mật và sửa lỗi.</li>
            </ul>
          ),
        },
        {
          title: "Mục đích sử dụng",
          body: (
            <ul>
              <li>Vận hành dịch vụ: đặt lịch, thanh toán, nhắc lịch và thông báo.</li>
              <li>Gợi ý mentor phù hợp bằng AI dựa trên CV và mục tiêu bạn cung cấp.</li>
              <li>Xác thực mentor và phòng chống gian lận.</li>
              <li>Cải thiện chất lượng nền tảng.</li>
            </ul>
          ),
        },
        {
          title: "Chia sẻ thông tin",
          body: <p>Hồ sơ mentor được hiển thị công khai để mentee tìm kiếm. Mentee và mentor chỉ thấy thông tin cần thiết cho phiên học đã đặt. Chúng tôi không bán dữ liệu cá nhân. Một số nhà cung cấp (thanh toán, email, AI) có thể xử lý dữ liệu thay mặt MentorHub theo mục đích nêu trên.</p>,
        },
        {
          title: "Lưu trữ và bảo mật",
          body: <p>Chúng tôi áp dụng các biện pháp kỹ thuật hợp lý như mã hoá khi truyền tải, băm mật khẩu và phân quyền truy cập. Không có hệ thống nào an toàn tuyệt đối; hãy bảo vệ mật khẩu của bạn.</p>,
        },
        {
          title: "Quyền của bạn",
          body: <p>Bạn có thể xem và chỉnh sửa thông tin tại trang tài khoản và hồ sơ, tuỳ chỉnh thông báo, hoặc yêu cầu xoá tài khoản. Chúng tôi có thể giữ lại một số dữ liệu giao dịch khi cần thiết cho đối soát.</p>,
        },
        {
          title: "Cookie và lưu trữ cục bộ",
          body: <p>Ứng dụng dùng bộ nhớ trình duyệt để giữ phiên đăng nhập, giao diện sáng hoặc tối và một số tuỳ chọn của bạn.</p>,
        },
        {
          title: "Thay đổi và liên hệ",
          body: <p>Chính sách có thể được cập nhật; thay đổi quan trọng sẽ được thông báo trong ứng dụng. Xem thêm <Link href="/terms">Điều khoản sử dụng</Link>.</p>,
        },
      ]}
    />
  );
}
