# Hướng dẫn sử dụng — MentorHub

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
   (phân tách bằng dấu phẩy), mục tiêu học tập, portfolio → *Lưu hồ sơ*. Hệ thống tự sinh vector hồ sơ
   phục vụ AI Matching.
2. **Tải CV & làm rõ mục tiêu** (`/cv-enrichment`): chọn file PDF → xem thông tin hệ thống trích xuất →
   trả lời 4 câu hỏi của chatbot → mục tiêu được tổng hợp và cập nhật vào hồ sơ.
3. **Tìm mentor** (`/matching`): danh sách mentor xếp theo % phù hợp; thanh màu dưới điểm tách % phù hợp
   thành 3 phần (tương đồng hồ sơ, đánh giá, kinh nghiệm — mentor chưa có đánh giá gắn nhãn *Mentor mới*
   và nhận điểm đánh giá trung tính); kỹ năng trùng được tô xanh; mục *Vì sao gợi ý mentor này?* giải thích lý do. Bấm *Xem hồ sơ* để xem giới thiệu, lịch rảnh, đánh giá.
4. **Gửi yêu cầu mentoring**: từ thẻ mentor hoặc trang hồ sơ mentor, kèm lời nhắn. Theo dõi tại
   *Yêu cầu* (`/mentoring/requests`); có thể huỷ khi đang chờ.
5. **Đặt lịch** (sau khi được chấp nhận): trang hồ sơ mentor → chọn thời lượng 30–120 phút → chọn ngày và
   giờ bắt đầu trong bộ chọn khung giờ (giờ Việt Nam; chỉ hiện các giờ còn trống trong 14 ngày tới — đã trừ
   lịch rảnh bận và phiên khác của bạn) → chủ đề → xem chi phí → *Xác nhận*. Nếu khung giờ vừa bị người khác
   đặt, hệ thống báo lỗi và tự tải lại danh sách giờ trống.
   - Phiên miễn phí: xác nhận ngay.
   - Phiên có phí: chuyển tới trang thanh toán; cần thanh toán trong 30 phút.
6. **Thanh toán** (`/payment/<mã phiên>`): nhập thẻ (có sẵn nút chọn thẻ test) → *Thanh toán*. Thành
   công → phiên chuyển *Đã xác nhận*; thất bại → xem lý do và thử lại.
7. **Phiên học** (`/mentoring/sessions`): lọc theo trạng thái; *Huỷ* phiên chưa bắt đầu (phiên đã thanh
   toán được hoàn tiền); sau khi phiên *Hoàn thành* bấm *Đánh giá* (1–5 sao + nhận xét).

## 3. Dành cho Mentor

1. **Tạo hồ sơ mentor** (`/profile`): có thể *Điền nhanh từ CV* (tải PDF để tự điền kỹ năng, số năm kinh
   nghiệm) → kiểm tra lại tên hiển thị, lĩnh vực, kỹ năng, giới thiệu, mức phí/giờ (0 = miễn phí), sức
   chứa (số mentee tối đa), portfolio, trạng thái nhận mentee → *Lưu hồ sơ*.
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
