# Đối chiếu thiết kế (55 board) và frontend MentorHub

Phương pháp: so toàn bộ chữ trong từng board *.dc.html với chuỗi trong src/app, src/features, src/components, rồi đọc code các trang nghi lệch. Bỏ qua phần backend, mock được chấp nhận. Một số điểm chưa soi từng dòng code được đánh dấu "(chưa xác minh)".

Chú thích nhóm đang được agent khác sửa song song (có thể đã đổi so với báo cáo này):
- [P] profile (hồ sơ mentor/mentee, chỉnh sửa, hộp thoại hồ sơ, lĩnh vực)
- [F] flow/payment (yêu cầu, đặt lịch, thanh toán, phiên, ví, thu nhập)
- [L] landing/public (landing, đăng ký, blog công khai)
- [M] mobile/matching (tìm mentor, bộ lọc, mobile)
- [V] mentors/[id], interview/xác thực, tiện ích (header, thông báo, tin nhắn, giới thiệu)

Mức khớp: Khớp / Thiếu khối / Lệch bố cục / Chưa có.

## 1. Bảng tổng hợp

### Admin
| Board | Route FE | Mức | Khối thiếu / lệch |
|---|---|---|---|
| AdmDash | /admin | Thiếu khối (nặng) | Thiếu: chọn "Kỳ xem 30 ngày"; thẻ "Báo cáo blog" chưa có số (count=null) và phụ đề "1 quá hạn · 2 có cờ" / "1 sắp hết hạn"; KPI "Người dùng mới" (▲12%), "Mentor đang nhận 96/118", "Doanh thu nền tảng 18,4tr (10% GMV)", "Tỉ lệ hoàn tiền 3,1%"; biểu đồ "GMV theo tuần"; bảng "Mentor nổi bật"; "Hoạt động gần đây" + "Xem nhật ký →"; "Trạng thái dịch vụ" (MoMo/VNPay, phòng video, AI Matching, email). Thừa so với thiết kế: thanh phân bố phiên, "Bảo trì AI Matching" (có thể giữ). |
| AdmList | /admin/verification | Khớp | Có tab, KPI, bảng đủ cột (Chat AI, Video AI, Cờ, Chờ), ghi chú cuối. Chưa xác minh: hàng "Hồ Long" trạng thái "Đang phân tích / Chờ AI" (có chuỗi trong code). |
| AdmDetail | /admin/verification/[id] | Khớp (gần) | Thiếu link "Xem toàn bộ cuộc trò chuyện →" ở khối Chat với AI. Còn lại (3 điểm AI, cờ, phiên âm, nhật ký làm bài, quyết định, đợt xác thực, nhãn Mentor mới) đều có. Video chỉ là mock. |
| AdmDisputes | /admin/disputes | Khớp | Có hai bên kể, nhật ký hệ thống, 3 quyết định, giải thích, tick "ghi nhận độ tin cậy", yêu cầu thêm bằng chứng. Tab đếm số và bố cục danh sách + chi tiết khớp. |
| AdmMod | /admin/message-reports + /admin/contact-violations | Lệch bố cục | Thiết kế là 1 trang 2 tab (Báo cáo tin nhắn / Vi phạm liên hệ) tại /admin/moderation; FE tách 2 trang, nối bằng ModSubnav. Nội dung từng tab khớp. Sidebar thiết kế trỏ /admin/moderation (route không tồn tại ở FE). |
| AdmPayouts | /admin/payouts | Khớp | Có KPI, tab, "Tên TK", cột Kiểm tra, hộp xác nhận mã giao dịch, hộp "Xem xét" (Vẫn chuyển / Từ chối). |
| AdmTx | /admin/transactions | Khớp | Có 4 KPI, bộ lọc, bảng, "Đối soát", tab Giới thiệu thêm. |
| AdmUsers | /admin/users | Khớp | Có chi tiết người dùng, gửi lại email, đặt lại mật khẩu, hộp đình chỉ 7/30 ngày/vĩnh viễn kèm lý do. |
| AdmBlog | /admin/blog | Khớp | KPI, lọc, bảng, hộp "Xem xét" (báo cáo, đọc bài, lý do gỡ, bỏ qua / gỡ). |
| AdmAudit | /admin/audit | Khớp | Bộ lọc, bảng, xuất CSV, phân trang. |
| (khung admin) | AppShell AdminShell | Lệch bố cục | Thiết kế: sidebar phẳng, nền xanh đậm, huy hiệu đếm (Duyệt mentor 5, Tranh chấp 2, Rút tiền 3, Kiểm duyệt tin nhắn 4, Blog 3). FE: sidebar nhóm theo chủ đề, không có huy hiệu đếm. |

### Blog
| Board | Route FE | Mức | Khối thiếu / lệch |
|---|---|---|---|
| BlogIndex [L] | /blog | Khớp (gần) | Có tab Mới nhất/Phổ biến/Đang theo dõi, chip tag, nổi bật, tác giả nên theo dõi, empty "Đang theo dõi", CTA. Chưa xác minh: thanh nav riêng của blog (Tổng quan, Tìm mentor, Blog, Bài của tôi, Viết bài) dùng shell chung. |
| BlogPost [L] | /blog/[slug] | Thiếu khối nhẹ | Thiếu sắp xếp bình luận "Mới nhất / Nhiều thích nhất"; "Bài viết liên quan" thay cho "Có thể bạn quan tâm"; "Xem thêm 10 bình luận" (chưa xác minh). Có like, lưu, chia sẻ, báo cáo, TOC, tác giả, CTA gửi yêu cầu. |
| BlogWrite [L] | /blog/write, /blog/edit/[id] | Khớp | Tiêu đề, tag, tóm tắt, ảnh bìa, toolbar Markdown, Viết/Xem trước, checklist "Trước khi đăng", hiển thị, tự lưu. |
| BlogMine [L] | /blog/me | Khớp | KPI, tab, thẻ bài, hộp gỡ đăng, lý do bị gỡ; có thêm tab "Đã lưu". |

### Hồ sơ [P]
| Board | Route FE | Mức | Khối thiếu / lệch |
|---|---|---|---|
| MentorProfile [P][V] | /mentors/[id] | Thiếu khối | Tab có Tổng quan/Giới thiệu/Bài viết/Đánh giá/Hành trình, thiếu tab "Dịch vụ" (4 loại phiên có mô tả) và "Lịch rảnh" như tab riêng (FE để ở sidebar); thiếu khối "Chưa chắc mentor này hợp? Thử AI Matching"; thiếu "Mentor khác bạn có thể quan tâm" (3 thẻ + Theo dõi); thiếu hành động trên đánh giá (Hữu ích / Phản hồi / Chia sẻ) trừ khi MentorReviews đã có phản hồi mentor; thiếu "bạn bè đã học cùng" (social proof); thiếu nút "Giới thiệu bạn bè · +30.000 đ" (RefShare C, chỉ hiện khi đã học); khối "Thông tin buổi học" có nhưng thiếu "Còn trống 2 chỗ / Buổi thử 15 phút · 30.000 đ" gộp. |
| MenteeProfile [P] | /mentees/[id] | Thiếu khối (nặng) | FE chỉ có Mục tiêu, Kỹ năng, Bài viết, Liên kết. Thiếu: nút "Chấp nhận / Nhắn tin / Từ chối" khi xem từ yêu cầu; hàng số liệu (6 phiên đã học, 96% đúng giờ); tab Tổng quan/Mục tiêu/Kỹ năng/Bài viết/Nhận xét; "Nhận xét từ mentor trước"; "Mong muốn về buổi học" (loại phiên, ngân sách, ngôn ngữ, lịch hay rảnh); "Mentor đã học cùng"; khối "Quyền riêng tư"; ô tìm kiếm trên thanh đầu. Thiết kế dùng route /mentees/me, FE dùng /profile cho mentee xem chính mình. |
| MentorEdit [P] | /profile (mentor) | Lệch bố cục | Thiết kế: một trang cuộn với nav neo (Thông tin chuyên môn, Kỹ năng, Portfolio và CV, Lịch rảnh, Ngày nghỉ, Cài đặt đặt lịch, Trạng thái) + thẻ "Hồ sơ hoàn thiện 80% · Còn thiếu: tải CV". FE: 3 tab (Thông tin chuyên môn / Lịch và đặt lịch / Trạng thái) + khối hoàn thiện ở ProfileExtras. Thiếu: chip lĩnh vực kèm "+ Thêm lĩnh vực" và "Quản lý các lĩnh vực →"; đếm ký tự tiêu đề 58/80 (có); gợi ý kỹ năng "Kafka · Redis…"; nút "Xem như mentee thấy"; thanh "● Có thay đổi chưa lưu / Huỷ thay đổi / Lưu hồ sơ"; mục "Xoá hồ sơ mentor"; tải CV nằm trong khối Portfolio (FE tải CV ở "Điền nhanh từ CV"). Có: lịch rảnh, ngày nghỉ, cài đặt đặt lịch (trải nghiệm, link phòng, nghỉ giữa phiên, báo trước, ngôn ngữ, loại phiên), trạng thái 3 lựa chọn. |
| MenteeEdit [P] | /profile (mentee) | Thiếu khối | Thiếu: "Xem hồ sơ công khai" (FE là "Xem trang cá nhân"); khối kỹ năng chia "Đã có / Muốn học" (FE chỉ một ô "Kỹ năng hiện có"); thẻ CV hiện tệp + "Thay CV / Xoá CV"; "Xoá dữ liệu hồ sơ…"; thẻ "Ai thấy gì?"; checklist hoàn thiện có ○ "Thêm múi giờ →"; thanh có thay đổi chưa lưu. Có: ảnh đại diện, trình độ, mục tiêu, sở thích tìm mentor (ngày, buổi, ngân sách, ngôn ngữ). |
| ProfileDialogs [P] | (dùng chung hồ sơ) | Thiếu khối (nặng) | Chưa xác minh từng hộp thoại. Chắc chắn thiếu: "Bạn có thay đổi chưa lưu" (Bỏ thay đổi / Lưu và rời đi); "Xoá hồ sơ mentor" gõ XOA HO SO; "Chưa thể xoá hồ sơ" (liệt kê mentee, phiên); cảnh báo "Ngày nghỉ trùng 1 phiên đã đặt"; toast "Hoàn tác" khi xoá khung giờ; xoá tài khoản bằng mật khẩu (app/account chưa có nút xoá tài khoản). Có: empty "Chưa có ngày nghỉ", lỗi link họp https. |
| DomManage [P] | /profile/domains | Thiếu khối | Có thẻ lĩnh vực, chính, phí, phiên đã dạy, đánh giá, trạng thái xác thực, tối đa 3. Thiếu: nút "Sửa mức phí" và "Tạm ngưng nhận lĩnh vực này"; câu "mức phí, lịch rảnh, số chỗ đặt riêng từng lĩnh vực" (FE hiển thị đơn giản); thanh 4 bước (CV, Bài đánh giá, Video, Admin duyệt) có trong data nhưng cần kiểm tra hiển thị; ghi chú gian lận có thể ảnh hưởng toàn tài khoản. |
| DomAdd [P] | /profile/domains/add | Chưa có | Chỉ có hộp thoại AddDomainDialog (chọn lĩnh vực + tải CV). Thiếu cả trang 5 bước: thanh bước (Chọn lĩnh vực, Tải CV, Bài đánh giá, Video, Admin duyệt); lưới thẻ lĩnh vực có mô tả + "Bạn đã có" + "Đề xuất lĩnh vực mới"; khối "Những gì cần làm"; chọn "Dùng lại CV hiện tại" / "Tải CV mới (Khuyên dùng)" + gợi ý "CV nhắc 2/8 kỹ năng Data" + "CV đã có của bạn"; thẻ bài đánh giá (10/2/30') + "Kết quả phần này 82%"; thẻ video có hạn nộp + đồng ý ghi hình; "Khi được duyệt / Khi không được duyệt". |

### Tìm mentor [M]
| Board | Route FE | Mức | Khối thiếu / lệch |
|---|---|---|---|
| Matching [M] | /matching | Lệch bố cục | Thiếu: ô "Bạn muốn học gì lúc này?" + "Tìm bằng AI" + gợi ý nhanh (FE là IntentBar chọn lĩnh vực + mục tiêu); dòng pipeline "AI đã xử lý trong 2,4 giây ✓ Đọc hồ sơ, So khớp 48 mentor, Kiểm tra lịch rảnh, Xếp hạng" (FE có PipelineRun animation khác tên bước); thanh bộ lọc dạng chip + dropdown (Loại phiên, Đánh giá, Ngày học, Ngôn ngữ); khối "Vì sao phù hợp:"; 4 thanh điểm "Kỹ năng/Mục tiêu/Lịch rảnh/Ngân sách" (FE dùng Tương đồng/Chuyển ngách/Đánh giá/Kinh nghiệm/Khớp lịch/Phản hồi); thẻ "Mentor mới". Có: top match, "Lựa chọn khác", "Phù hợp nhưng vượt ngân sách", "Không phù hợp" ẩn 30 ngày, ghi chú hồ sơ ≥ 50%. |
| MentorBrowse [M] | /mentors | Thiếu khối (nặng) | FE chỉ có Từ khoá + Lĩnh vực. Thiếu: ngân sách tối đa, buổi học (sáng/chiều/tối), ngày học T2–CN, loại phiên, đánh giá tối thiểu, ngôn ngữ, "Chỉ mentor còn chỗ"; "Sắp xếp: Đánh giá cao nhất"; chip bộ lọc đang bật; thẻ có sao + số phiên + giá, "● Đang nhận · còn 2 chỗ / Tạm dừng nhận mentee (Chưa nhận)", nút "Xem hồ sơ" + "Gửi yêu cầu" (FE dùng MentorCardView chung, chưa xác minh nút gửi yêu cầu); empty state "Thử bỏ bớt ngày học hoặc tăng ngân sách". |
| FindMobile [M] | /matching, /mentors (responsive) | Chưa có | Thiếu: nút "Lọc · 3" + ngăn kéo từ dưới lên (Bộ lọc, Xoá tất cả, Xem 23 mentor); chip bộ lọc ngang; thẻ rút gọn. Chưa thấy component drawer lọc ở mobile. |

### Luồng yêu cầu - đặt lịch - thanh toán [F]
| Board | Route FE | Mức | Khối thiếu / lệch |
|---|---|---|---|
| FlowRequest | /mentoring/request/[mentorId] | Thiếu khối nhẹ | Thiếu: nút "Dùng mục tiêu trong hồ sơ"; thanh 5 bước ở đầu trang; thẻ mentor bên phải với "● Đang nhận · còn 2 chỗ"; khối "Sau khi gửi yêu cầu"; gợi ý "Muốn thử trước? Đặt buổi thử →" (có ở trang mentor). Có: mục tiêu, loại phiên, tần suất, thời gian, lời nhắn. FlowSteps có sẵn. |
| FlowInbox | /mentoring/requests (mentor) | Thiếu khối nhẹ | Tab FE: Đang chờ/Đang hoạt động/Đã đóng; thiết kế: Chờ trả lời/Đã chấp nhận/Đã từ chối/Hết hạn. Thiếu: đếm "Còn 41 giờ" (FE nói 72 giờ, thiết kế 48 giờ), "Nhắn tin trước", thẻ rút gọn "Xem chi tiết" cho yêu cầu cũ, khối "Sau khi bạn chấp nhận", cảnh báo hết hạn giảm ưu tiên; lý do từ chối khác nhãn (thiết kế: Đã đủ mentee / Chưa phù hợp lĩnh vực / Lịch không khớp / Lý do khác). Có: "Mentee đáng tin cậy", mục tiêu, khớp với bạn, dialog từ chối. |
| FlowStatus | /mentoring/requests (mentee) | Lệch bố cục (chưa xác minh) | Thiếu theo thiết kế: tab Tất cả/Đang chờ/Đã chấp nhận/Không thành công; stepper 5 bước ngay trên từng thẻ; "Mentor nhắn:", "Rút yêu cầu", "Đặt lịch ngay →", "Mentor thường trả lời trong 6 giờ", "Gửi lại" khi hết hạn, "Ghi chú từ mentor". FE dùng chung 1 trang với mentor, có "Huỷ yêu cầu" và "Đặt lịch". |
| FlowBook | /mentoring/book/[mentorId] | Thiếu khối | Có loại phiên, thời lượng, SlotPicker, agenda, mã giới thiệu, tài liệu, thông tin phỏng vấn thử, tóm tắt chi phí. Thiếu: lịch tháng với trạng thái ngày ("Hết chỗ", "Nghỉ", "3 giờ", "Không rảnh") và chú thích gạch ngang; nút "Tiếp tục thanh toán →" + dòng "Chưa bị trừ tiền ở bước này"; thẻ "Giữ chỗ 15 phút"; thẻ tóm tắt đặt lịch có mentor + thời gian. |
| FlowPay | /payment/[sessionId] | Thiếu khối (nặng) | Có thanh toán từ ví, số dư, tiền khuyến mãi, cảnh báo 15 phút, lịch sử giao dịch. Thiếu: trạng thái B ngay trên trang (thiếu số dư → chọn mức nạp 180k/300k/500k/Khác, chọn MoMo/VNPay/Sandbox, nút "Nạp 180.000 đ qua MoMo", đếm ngược giữ khung giờ 12:40); dòng "Giảm giá (mã giới thiệu)" và "Số dư sau khi giữ"; thẻ phiên (mentor, loại, thời gian, "Đổi khung giờ"); 3 dòng cam kết "Tiền được giữ an toàn"; "Giao dịch gần đây". FE đẩy việc nạp sang /wallet. |
| FlowDone | /payment/return/[provider] | Thiếu khối (nặng) | FE chỉ có màn kết quả đơn giản (thành công / thất bại / đang xác nhận). Thiếu: trang "Đã đặt lịch thành công" (thẻ phiên, "Nhắc lịch trước 30 phút", nút Xem chi tiết / Thêm vào lịch / Xem biên lai, "Tiếp theo…"); trạng thái "Đang xác nhận" kèm mã giao dịch MM-… và "Về trang Ví"; trạng thái "Không thành công" kèm đếm ngược giữ khung giờ, "Thử thanh toán lại", "Chọn khung giờ khác"; biên lai in/PDF (có ở /payment/receipts/[id], cần so layout). |
| SesDetail | /mentoring/sessions/[id] | Khớp (gần) | Có đếm ngược, vào phòng, đổi lịch, huỷ, agenda, tài liệu, checklist chuẩn bị, thẻ mentor, học phí giữ, chính sách. Chưa xác minh: dòng "Phòng học mở trước 10 phút / sáng lên lúc 19:20" (có). Biến thể mentor (Mentee không đến sau 15 phút, thu nhập dự kiến) có. |
| SesRoom | /mentoring/sessions/[id]/room | Lệch bố cục | Thiết kế: thẻ "Mở link họp ↗" + chip hiện diện + panel Ghi chú chung/Ghi chú riêng/Việc cần làm + chat 2 người ngay trong phòng. FE: nhúng Jitsi toàn khung + thanh đồng hồ; ghi chú ở trang riêng /notes (có nút dẫn). Hộp "Kết thúc buổi học bây giờ?" khớp. |
| SesComplete | /mentoring/sessions/[id]/complete | Khớp (gần) | Có 3 lựa chọn, chờ bên kia (đếm ngược), hoàn thành + 3 nút, trạng thái không khớp. Lệch: form khiếu nại 72 giờ (mô tả + tải ảnh bằng chứng) ở thiết kế nằm ngay màn này; FE tách thành DisputeForm "Báo cáo sự cố" (link bằng chứng, không tải ảnh). |
| SesMoney | /mentoring/sessions/[id]/money | Khớp (gần) | Có 5 mốc, khối mentee / mentor, phí 10%. Thiếu nút "Khiếu nại phiên này" ở khối mentee (FE có link dẫn tới "Báo cáo sự cố" ở trang phiên - chưa xác minh) và minh hoạ thông báo (annotation). |
| SesReview | /mentoring/sessions/[id]/review | Thiếu khối | Có tổng thể + 3 điểm thành phần + thẻ + nhận xét, mentor đánh giá Chuẩn bị/Tham gia. Thiếu: tiêu đề "Bạn thấy buổi học thế nào?" + nhãn "Tốt · 4/5"; đếm "118/2000"; checkbox "Hiện tên của tôi trong đánh giá công khai"; nút "Để sau"; màn "Cảm ơn bạn đã đánh giá" gắn chia sẻ mã giới thiệu (RefShare B). |
| Earnings | /earnings | Thiếu khối nhẹ | Có 4 thẻ, biểu đồ 6 tháng, bảng theo phiên, lọc, lịch sử rút, xuất CSV. Thiếu: chọn "Kỳ xem 6 tháng", thẻ "Đã chi trả ... Từ đầu đến nay" (FE đã có "Đã chi trả"), form rút có ô "Số tiền rút" + "Rút tất cả" (FE rút toàn bộ số dư theo quy tắc backend, ngân hàng ở PayoutPanel) , khối "Đang chờ chuyển khoản" (có). |

### Onboarding và CV
| Board | Route FE | Mức | Khối thiếu / lệch |
|---|---|---|---|
| OnbRegister [L] | /register, /verify-email | Thiếu khối | Có chọn vai trò, form, mã giới thiệu, đồng ý điều khoản. Thiếu màn "Kiểm tra email của bạn" kèm "Tiếp tục làm hồ sơ / Gửi lại email" (FE chuyển thẳng sang /onboarding hoặc /onboarding/mentor-cv; chưa xác minh /verify-email) và trang "Đi tiếp theo vai trò" (Mentee: Tải CV → ...; Mentor: ...). |
| OnbMenteeCv | /cv-enrichment | Thiếu khối | Có tải CV, xem lại thông tin (kỹ năng, dự án, học vấn). Thiếu: chip "Độ đầy đủ CV 70%"; ô "Về dữ liệu CV" và đồng ý gửi AI (có CvConsent nhưng chữ khác, nêu DeepSeek); trạng thái lỗi (mật khẩu, quá 5 MB, AI bận); liên kết "Chưa có CV? Điền thông tin thủ công" (route /onboarding/manual) - FE có /onboarding (3 câu) nhưng chưa nối từ trang này; "CV chưa nói về…"; chỉ nhận PDF (thiết kế PDF hoặc DOCX). |
| OnbMenteeChat | /cv-enrichment (bước chat) | Khớp (gần) | Có chatbot, "Câu 3/4", "Hồ sơ đang hình thành", gợi ý nhanh. Thiếu: "Vì sao hỏi?", "Điền thủ công thay vì trò chuyện", chọn kỹ năng "3/5 đã chọn" + "Viết lại bản khác" (GoalDraft có phần lớn, chữ khác). |
| OnbMentorCv [P][V] | /onboarding/mentor-cv | Khớp | Đủ 5 bước, tải CV, đồng ý, tiến trình AI, thông tin trích, chủ đề trắc nghiệm, câu hỏi video, ví dụ. Chỉ nhận PDF (thiết kế PDF/DOCX), thiếu "Lưu và thoát". |
| OnbMyCvs | /profile (tab CV) / MyCvs | Thiếu khối | Có danh sách CV, Đang dùng, Dùng bản này, Xoá + xác nhận. Thiếu: nút "Xem / Tải xuống"; dòng "6 kỹ năng · 2 dự án · 2 năm" + "Xem lại thông tin AI rút ra →"; khối "Quyền riêng tư" (công tắc "Cho phép AI bên ngoài phân tích CV", ghi chú mentor thay CV sẽ về hàng chờ); route /profile/cv không tồn tại. |

### Tiến độ
| Board | Route FE | Mức | Khối thiếu / lệch |
|---|---|---|---|
| Progress [M] | /dashboard (mentee) / MenteeProgress | Thiếu khối | Có 4 thẻ số, biểu đồ đường, mục tiêu, nhận xét mentor (điểm mạnh / cần cải thiện), việc cần làm, phiên tiếp theo, empty state. Thiếu: lời chào "Chào Nam, bạn đang tiến bộ tốt"; chọn "Mentor: Tất cả (2)" và "Kỳ xem 3 tháng"; thẻ "Điểm trung bình gần đây 4,6/5 ▲+0,8"; chú thích "Nhận định: …"; toàn bộ danh sách "Từng phiên học" (thẻ từng phiên, tab Mới nhất / Điểm cao / Cần cải thiện, "Xem cả 8 phiên"). |
| ProgressMobile [M] | /dashboard (responsive) | Thiếu khối | Cùng thiếu như Progress; chưa xác minh bố cục mobile (chip lọc gọn, rút gọn danh sách phiên). |

### Giới thiệu bạn bè [V]
| Board | Route FE | Mức | Khối thiếu / lệch |
|---|---|---|---|
| RefHub | /referral | Khớp (gần) | Có mã giảm giá đang có, 3 bước, 4 thẻ số, mã theo mentor, người đã giới thiệu, quy tắc. Chưa xác minh: 4 chỉ số "Mã của bạn / Đã giới thiệu / Được thưởng tháng này 2/5 / Tổng giá trị đã nhận". |
| RefInvitee | /referral/invite | Khớp | Lời giới thiệu, thẻ mentor, trích dẫn, CTA, các lỗi mã. Bước 2 (đăng ký có sẵn mã "Hợp lệ") nằm ở /register. |
| RefShare | /referral/share | Lệch bố cục | Thiết kế: hộp thoại chia sẻ 3 điểm vào (A hộp thoại từ hồ sơ mentor, B sau khi đánh giá, C nút trên hồ sơ mentor). FE: trang riêng chọn mentor; chưa thấy B và C. Có liên kết, lời nhắn sửa được, gửi qua Zalo/Messenger/Facebook/Email. |
| RefVoucher | /referral/vouchers | Khớp | Tab, thẻ voucher, chọn mã khi thanh toán (VoucherPicker). |

### Header, thông báo, tin nhắn [V]
| Board | Route FE | Mức | Khối thiếu / lệch |
|---|---|---|---|
| HdrTop | AppShell + HeaderMenus | Thiếu khối | Có tin nhắn, chuông (tab Tất cả/Chưa đọc, đánh dấu đã đọc), menu tài khoản, giao diện, đăng xuất. Thiếu menu mentor: công tắc "Trạng thái nhận mentee (Đang nhận / Tạm dừng / Nghỉ phép)", dòng "Có thể rút 2.430.000 đ", thanh "Hồ sơ hoàn thiện 80% · Thêm CV →", "Lĩnh vực của tôi · 1 đang xác thực", huy hiệu "2 mã" ở Giới thiệu bạn bè; mentee: "Xem trang cá nhân" trỏ /profile (thiết kế /mentees/me). Admin: có "Nhật ký của tôi". Thiếu nút "Cài đặt thông báo" ở chuông (design `/account#notifications`). Phím tắt (Esc, mũi tên) chưa xác minh. |
| HdrMobile [M] | AppShell (tabbar + drawer) | Khớp (gần) | Có thanh tab dưới (Tin nhắn nằm ở đó), drawer ảnh đại diện. Chưa xác minh: chuông mở ngăn từ trên xuống (FE dùng popover chung). |
| Notifications | /notifications | Thiếu khối nhẹ | Có nhóm theo ngày, lọc, đánh dấu tất cả. Thiếu: nút hành động trên thẻ ("Đặt lịch ngay"), "Xem thông báo cũ hơn", tab "Blog" (FE có Phiên học/Thanh toán/Hệ thống), khối "Cách nhận thông báo" nằm ngay trang (FE để ở /account + NotificationSettings). |
| Messages | /messages, /messages/[id] | Khớp (gần) | Có danh sách, chi tiết, báo cáo tin nhắn, thông tin hội thoại, tệp, tắt thông báo. Thiếu: thanh "Phiên sắp tới · Xem phiên" ngay trên khung chat (FE có "Xem phiên"); cảnh báo liên hệ chèn trong luồng; nhãn lý do báo cáo hơi khác chữ. |

### Xác thực mentor [V]
| Board | Route FE | Mức | Khối thiếu / lệch |
|---|---|---|---|
| VerStatus | /interview (VerifyStatusView) | Khớp (gần) | Đủ 8 trạng thái A–H. Route thiết kế là /verification (+ /verification/test, /video, /round2, /appeal); FE dùng /interview, /interview/test, /interview/video; chưa có /verification/appeal (khiếu nại gửi bằng form trong trang). |
| VerInterview | /interview/test (ExamRunner) | Khớp | Quy tắc, chống gian lận, trắc nghiệm có đồng hồ câu, cảnh báo rời màn hình, chat AI, màn kết thúc. |
| VerRound2 | /interview/video (VideoRecorder) | Khớp | Chuẩn bị, đang quay, xem lại, tải lên, đã nhận, lỗi camera / quá hạn. Thiếu cảnh báo ánh sáng yếu (có thể đã có, chưa xác minh). |

### Landing [L]
| Board | Route FE | Mức | Khối thiếu / lệch |
|---|---|---|---|
| Main | / | Khớp (gần) | Có hero + thẻ AI Matching mẫu, 3 tính năng, 4 bước, vai trò, CTA, footer. Chưa xác minh: dải số liệu 100% / 4 bước / 60' / AI và liên kết "Blog" trên thanh điều hướng; FE thêm minh hoạ đặt lịch, lộ trình. |
| Mobile | / (responsive) | Khớp (gần) | Cùng nội dung rút gọn; chưa xác minh breakpoint ở 390px. |

## 2. Tuyến thiết kế chưa có ở FE
/verification, /verification/test, /verification/video, /verification/round2, /verification/appeal (FE dùng /interview*); /profile/domains/add; /profile/cv; /mentees/me; /onboarding/cv-review; /onboarding/manual; /admin/moderation (gộp 2 trang message-reports + contact-violations); /mentoring/sessions/[id]/dispute (FE dùng form trong trang phiên); /messages/1 ok; /blog/post và /blog/db-dat-lich là liên kết minh hoạ (FE dùng /blog/[slug]).

## 3. 15 chỗ lệch lớn nhất (ưu tiên)
1. DomAdd: chưa có trang 5 bước thêm lĩnh vực (chỉ có hộp thoại). [P]
2. MentorBrowse: thiếu gần như toàn bộ bộ lọc (ngân sách, buổi, ngày, loại phiên, đánh giá, ngôn ngữ, còn chỗ), sắp xếp, chip lọc, trạng thái nhận mentee. [M]
3. FindMobile: chưa có ngăn kéo lọc mobile. [M]
4. AdmDash: thiếu GMV theo tuần, mentor nổi bật, hoạt động gần đây, trạng thái dịch vụ, KPI người dùng mới / mentor đang nhận / doanh thu nền tảng / tỉ lệ hoàn tiền, chọn kỳ xem.
5. MenteeProfile: thiếu nhận xét từ mentor, mong muốn buổi học, mentor đã học cùng, quyền riêng tư, nút chấp nhận / từ chối, số liệu đúng giờ. [P]
6. FlowDone: thiếu trang "Đã đặt lịch thành công" và hai trạng thái chờ xác nhận / thất bại có đếm ngược. [F]
7. FlowPay: thiếu nạp ví inline (mức nạp, MoMo/VNPay/Sandbox), thẻ phiên + "Đổi khung giờ", cam kết giữ tiền, giao dịch gần đây. [F]
8. MentorProfile: thiếu tab Dịch vụ và Lịch rảnh, khối "Thử AI Matching", mentor khác, hành động trên đánh giá, nút giới thiệu bạn bè. [P][V]
9. Progress / ProgressMobile: thiếu danh sách "Từng phiên học", lời chào, lọc mentor / kỳ, điểm trung bình, nhận định. [M]
10. MentorEdit + ProfileDialogs: bố cục tab thay vì trang neo; thiếu thanh "thay đổi chưa lưu", xoá hồ sơ gõ XOA HO SO, "Chưa thể xoá hồ sơ", cảnh báo ngày nghỉ trùng phiên, hoàn tác khi xoá khung giờ, xoá tài khoản. [P]
11. Matching: ô "Bạn muốn học gì…", dòng pipeline, thanh điểm 4 tiêu chí và "Vì sao phù hợp" khác thiết kế. [M]
12. HdrTop (menu mentor): thiếu công tắc trạng thái nhận mentee, "Có thể rút", hoàn thiện hồ sơ, lĩnh vực của tôi, huy hiệu mã giới thiệu; admin sidebar thiếu huy hiệu đếm. [V]
13. SesRoom: ghi chú / việc cần làm / chat không nằm cạnh khung họp (Jitsi nhúng toàn khung). [F]
14. OnbMenteeCv / OnbMyCvs / OnbRegister: thiếu trạng thái lỗi tải CV, "điền thủ công", độ đầy đủ CV, quyền riêng tư CV, màn "Kiểm tra email", trang chọn bước tiếp theo theo vai trò. [L]
15. MenteeEdit: thiếu "Đã có / Muốn học", thẻ CV, "Xoá dữ liệu hồ sơ", "Ai thấy gì?"; RefShare thiếu điểm vào B và C. [P][V]

## 4. Việc không thuộc thiết kế nhưng cần lưu ý
- FlowInbox: hạn phản hồi 72 giờ (FE) so với 48 giờ (thiết kế) - cần chốt theo bản yêu cầu.
- Mock còn lại: ngân hàng đề (localStorage), video xác thực, admin ví / điều chỉnh - đã chấp nhận.
