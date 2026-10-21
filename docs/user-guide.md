# Hướng dẫn sử dụng — MentorHub

> **v2.0 (21/10/2026)** — nội dung đánh dấu ⚒ là **mục tiêu theo bản chốt** [ban-chot-nghiep-vu.md](ban-chot-nghiep-vu.md), chưa hiện thực; phần không đánh dấu mô tả hệ thống hiện tại.


Giao diện tại <http://localhost:3000>. Thanh điều hướng thay đổi theo vai trò; biểu tượng 🔔 hiển thị số
thông báo chưa đọc; bấm tên người dùng để vào trang *Tài khoản*.

## 1. Dành cho mọi người dùng

| Chức năng | Màn hình | Thao tác |
|---|---|---|
| Đăng ký | `/register` | Chọn vai trò Mentee/Mentor, nhập họ tên, email, mật khẩu (≥ 8 ký tự), mã giới thiệu (nếu có) |
| Xác thực email | Liên kết trên trang chủ sau khi đăng ký (demo) | Bấm liên kết |
| Đăng nhập / đăng xuất | `/login`, nút *Đăng xuất* | Sai mật khẩu 5 lần sẽ bị chặn 15 phút |
| Tài khoản | `/account` | Đổi họ tên, đổi mật khẩu (các thiết bị khác bị đăng xuất) |
| Thông báo | `/notifications` | Xem, mở liên kết liên quan, đánh dấu đã đọc |
| Learning Hub | `/learning` | Tab *Khoá học của tôi*, *Tất cả khoá học* (lọc lĩnh vực, tìm kiếm), *Roadmap*; trong khoá học bấm *Đăng ký học*, mở tài liệu, tích ô hoàn thành để cập nhật % |
| Giới thiệu bạn bè | `/referral` | Sao chép liên kết giới thiệu; theo dõi người đã giới thiệu, trạng thái và điểm thưởng |

## 2. Dành cho Mentee

1. **Tạo hồ sơ nghề nghiệp** (`/profile`): tên hiển thị, lĩnh vực muốn học, trình độ, kỹ năng hiện có
   (phân tách bằng dấu phẩy), mục tiêu học tập, portfolio → *Lưu hồ sơ*. Hệ thống tự cập nhật chỉ mục
   AI Matching cho hồ sơ — thường trong vài giây, chậm nhất khoảng 1 phút.
2. **Tải CV & làm rõ mục tiêu** (`/cv-enrichment`): chọn file PDF → xem thông tin hệ thống trích xuất →
   trả lời 4 câu hỏi của chatbot → mục tiêu được tổng hợp và cập nhật vào hồ sơ. CV chỉ được xem bởi bạn,
   quản trị viên và mentor đang có yêu cầu mentoring (chờ duyệt hoặc đã chấp nhận) với bạn.
   **Xoá CV**: trang *Hồ sơ* (`/profile`) → mục **CV của tôi** → *Xoá* ở CV muốn xoá → xác nhận. File PDF,
   dữ liệu trích xuất và cuộc trò chuyện làm rõ mục tiêu gắn với CV đó bị xoá vĩnh viễn; liên kết CV trong
   hồ sơ được gỡ. Mục tiêu và kỹ năng đã cập nhật vào hồ sơ **được giữ lại** — sửa trực tiếp ở form hồ sơ
   nếu muốn bỏ.
3. **Tìm mentor** (`/matching`): danh sách mentor xếp theo % phù hợp; thanh màu dưới điểm tách % phù hợp
   thành 3 phần (tương đồng hồ sơ, đánh giá, kinh nghiệm — mentor chưa có đánh giá gắn nhãn *Mentor mới*
   và nhận điểm đánh giá trung tính); kỹ năng trùng được tô xanh; mục *Vì sao gợi ý mentor này?* giải thích lý do. Bấm *Xem hồ sơ* để xem giới thiệu, lịch rảnh, đánh giá.
   Ngoài gợi ý AI, trang **Mentor** (`/mentors`) cho duyệt toàn bộ mentor đã xác thực theo lĩnh vực và
   từ khoá, có phân trang.
4. **Gửi yêu cầu mentoring**: từ thẻ mentor hoặc trang hồ sơ mentor, kèm lời nhắn. Theo dõi tại
   *Yêu cầu* (`/mentoring/requests`); có thể huỷ khi đang chờ.
5. **Nạp ví** (⚒ `/wallet`): chọn số tiền (50.000đ–5.000.000đ) và kênh (sandbox / MoMo test / VNPay sandbox). Ví có **tiền nạp** và **tiền khuyến mãi**
   (từ giới thiệu hoặc admin); học phí trừ khuyến mãi trước. Khuyến mãi hết hạn sau 12 tháng; ví không dùng 12 tháng sẽ *ngủ* — bấm *Kích hoạt lại*.
   Trong 7 ngày kể từ lần nạp gần nhất bạn có thể *Yêu cầu hoàn tiền nạp* (tối đa bằng số nhỏ hơn giữa tiền nạp còn lại và tiền đã nạp 7 ngày; không gồm tiền đang
   tạm giữ hay khuyến mãi; tối đa 2 lần/tháng).
6. **Đặt lịch** (sau khi được chấp nhận): trang hồ sơ mentor → xem giá (theo cấp Junior/Senior/Expert) → chọn ngày, giờ (đặt trước ≥ 3 giờ; buổi học 60 phút)
   → chủ đề → *Xác nhận*. Học phí được **tạm giữ từ ví**; ví thiếu tiền thì khung giờ được giữ 15 phút để bạn nạp thêm. Mentor xác nhận trong 24 giờ, quá hạn
   hoặc bị từ chối thì bạn được hoàn 100%.
   - **Buổi trải nghiệm 15 phút (30.000đ)**: để làm quen trước khi học, mỗi mentor một lần, không chấm sao.
   - **Huỷ**: ≥ 24 giờ trước giờ học hoàn 100%; 4–24 giờ hoàn 50%; dưới 4 giờ hoặc vắng mặt không hoàn. Mentor huỷ hoặc vắng bạn được hoàn 100%.
   - **Mã giới thiệu**: sau khi học xong một buổi với mentor, bạn nhận mã riêng cho mentor đó; bạn bè dùng mã ở lần đặt buổi đầu với mentor ấy, bạn nhận 30.000đ khuyến mãi sau 7 ngày nếu buổi không bị hoàn tiền.
7. **Phiên học** (`/mentoring/sessions`; ⚒ có nút *Vào phòng học* trước giờ học 10 phút — video và chat ngay trong hệ thống): lọc theo trạng thái; *Huỷ* phiên chưa bắt đầu (phiên đã thanh
   toán được hoàn tiền); sau khi phiên *Hoàn thành* bấm *Đánh giá* (1–5 sao + nhận xét).

## 3. Dành cho Mentor

1. **Tạo hồ sơ mentor** (`/profile`): có thể *Điền nhanh từ CV* (tải PDF để tự điền kỹ năng, số năm kinh
   nghiệm) → kiểm tra lại tên hiển thị, lĩnh vực, kỹ năng, giới thiệu, mức phí (⚒ chọn trong khung theo cấp độ do admin duyệt: Junior 100–200k, Senior 200–400k, Expert 400–700k, bước 10.000đ), sức
   chứa (số mentee tối đa), portfolio, trạng thái nhận mentee → *Lưu hồ sơ*. CV dùng để điền nhanh cũng
   được lưu và hiện trong mục **CV của tôi** cùng trang — xoá được bất cứ lúc nào. Khi xét yêu cầu
   mentoring, mentor mở được CV của mentee đang gửi yêu cầu hoặc đang được mình hướng dẫn.
2. **Khai báo lịch rảnh** (cùng trang, khung bên phải): *+ Thêm khung giờ* → chọn thứ, giờ bắt đầu, giờ
   kết thúc → *Lưu lịch rảnh*. Các khung trong cùng ngày không được chồng nhau.
3. **AI Interview** (`/interview`): đọc hướng dẫn → *Bắt đầu phỏng vấn* → trả lời lần lượt 5 câu hỏi.
   Hãy trả lời chi tiết, nêu ví dụ thực tế, số liệu và các đánh đổi đã cân nhắc. Có thể thoát và quay lại
   tiếp tục. Sau câu cuối, xem điểm tổng, điểm mạnh/yếu; tài khoản chờ admin duyệt. Nếu bị từ chối, cập
   nhật hồ sơ và bấm *Phỏng vấn lại*.
4. **Xử lý yêu cầu** (`/mentoring/requests`): *Chấp nhận* (khi còn chỗ) hoặc *Từ chối* kèm lý do;
   *Kết thúc* quan hệ mentoring khi đã hoàn tất để giải phóng chỗ.
5. **Phiên học** (`/mentoring/sessions`): xem lịch; *Đánh dấu hoàn thành* sau buổi học; *Huỷ* phiên chưa
   bắt đầu.

Mentor chỉ xuất hiện trong kết quả gợi ý khi: đã được admin duyệt, đang nhận mentee, có lịch rảnh và còn chỗ.

## 4. Dành cho Admin

| Chức năng | Màn hình | Thao tác |
|---|---|---|
| Tổng quan | `/admin` | Số liệu người dùng, phỏng vấn chờ duyệt, phiên, doanh thu sandbox; *Bổ sung embedding còn thiếu* / *Sinh lại toàn bộ* |
| Người dùng | `/admin/users` | Lọc theo vai trò, tìm theo email/tên, *Khoá* / *Mở khoá* tài khoản |
| Duyệt mentor | `/admin/interviews` | Tab theo trạng thái → *Xem* → đọc toàn bộ hội thoại, điểm AI từng câu, đánh giá tổng hợp → nhập nhận xét → *Duyệt & kích hoạt* hoặc *Từ chối* |
| Nội dung | `/admin/learning` | Tạo/xoá khoá học; chọn *Tài liệu* để thêm/xoá tài liệu; tạo/xoá roadmap; chọn *Các bước* để thêm/xoá bước (có thể liên kết khoá học) |
| Giao dịch | `/admin/transactions` | Lọc giao dịch theo trạng thái; tab *Referral* xem trạng thái và lý do từ chối |

> Kết quả AI Interview chỉ mang tính hỗ trợ. Admin nên đọc kỹ các câu trả lời trước khi quyết định.
