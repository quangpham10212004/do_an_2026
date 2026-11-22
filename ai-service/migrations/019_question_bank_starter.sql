-- General assessment questions apply to any track. Domain-specific published questions take priority.
INSERT INTO question_bank_topics(id, name)
VALUES ('2ea69f63-96c7-470b-a766-c1b44394df2f', 'Kỹ thuật phần mềm')
ON CONFLICT DO NOTHING;

WITH starter(id, difficulty, prompt, options, correct_index, explanation) AS (
    VALUES
    (1, 'EASY', 'Một lỗi vừa xuất hiện sau khi triển khai. Việc nào giúp khoanh vùng nguyên nhân trước tiên?',
     '["Đối chiếu thời điểm lỗi với thay đổi triển khai và số liệu theo dõi", "Tăng timeout của mọi thành phần", "Khởi động lại toàn bộ hệ thống", "Xóa các bản ghi lỗi cũ"]'::jsonb, 0,
     'Mốc triển khai và dữ liệu quan sát giúp thu hẹp vùng điều tra.'),
    (2, 'EASY', 'Mục đích chính của bài kiểm thử hồi quy là gì?',
     '["Giảm số lượng nhánh mã", "Phát hiện hành vi cũ bị hỏng sau khi thay đổi", "Xác minh tất cả yêu cầu mới bằng tay", "So sánh kích thước các phiên bản"]', 1,
     'Kiểm thử hồi quy bảo vệ hành vi đã được chấp nhận.'),
    (3, 'EASY', 'Khi nhận yêu cầu có tiêu chí thành công mơ hồ, đâu là bước phù hợp nhất?',
     '["Ước lượng và cam kết ngay", "Chọn giải pháp quen thuộc nhất", "Thống nhất ví dụ và tiêu chí chấp nhận với người yêu cầu", "Trì hoãn cho đến khi có thiết kế hoàn chỉnh"]', 2,
     'Các ví dụ cụ thể giúp hai bên thống nhất điều kiện hoàn thành.'),
    (4, 'MEDIUM', 'Thao tác nào nên được thiết kế idempotent?',
     '["Đọc mô tả tài liệu", "Vẽ lại một sơ đồ trên giấy", "Đổi chú thích trong một hàm", "Xử lý yêu cầu có thể được gửi lại sau khi máy khách mất phản hồi"]', 3,
     'Một yêu cầu được gửi lại không nên tạo thêm một tác dụng phụ ngoài ý muốn.'),
    (5, 'EASY', 'Cần xem secret nào gây ra lỗi cấu hình. Bạn nên ghi gì vào nhật ký?',
     '["Tên cấu hình và mã lỗi, đã che giá trị bí mật", "Toàn bộ giá trị secret", "Toàn bộ biến môi trường", "Thông tin xác thực của người dùng gặp lỗi"]', 0,
     'Thông tin nhận diện và mã lỗi hỗ trợ điều tra mà không làm lộ dữ liệu nhạy cảm.'),
    (6, 'MEDIUM', 'Khi so sánh độ trễ của hai phiên bản, số liệu p95 biểu diễn điều gì?',
     '["Thời gian tối đa tuyệt đối", "Mức độ trễ mà khoảng 95% mẫu không vượt quá", "Mức độ trễ trung bình", "Tỷ lệ yêu cầu thất bại"]', 1,
     'Phân vị 95 thể hiện phần đuôi của phân phối.'),
    (7, 'MEDIUM', 'Khi gửi yêu cầu tới một dịch vụ chậm, biện pháp nào giảm khả năng các máy khách thử lại đồng loạt?',
     '["Lặp lại ngay khi hết giờ", "Dùng đúng một khoảng chờ cho mọi máy khách", "Tăng dần khoảng chờ và thêm độ lệch ngẫu nhiên", "Bỏ giới hạn số lần thử lại"]', 2,
     'Backoff và jitter giảm đồng bộ hóa các lần thử lại.'),
    (8, 'MEDIUM', 'Một thay đổi ảnh hưởng nhiều máy khách đang ở các phiên bản khác nhau. Cách phát hành nào giảm gãy tương thích?',
     '["Yêu cầu tất cả máy khách nâng cấp cùng lúc", "Đổi nội dung mà giữ nguyên ý nghĩa đã công bố", "Xoá phiên bản cũ đầu tiên", "Thêm hỗ trợ mới, cho phép chuyển dần rồi loại bỏ giao diện cũ"]', 3,
     'Di trú từng bước duy trì khả năng tương tác trong giai đoạn chuyển tiếp.'),
    (9, 'EASY', 'Nhận xét nào trong review dễ giúp người viết cải thiện đoạn mã nhất?',
     '["Nêu tình huống lỗi cụ thể, tác động và cách tái hiện", "Chỉ nói đoạn mã không tốt", "Yêu cầu sửa theo thói quen cá nhân", "Chỉ yêu cầu thêm chú thích dài"]', 0,
     'Review có bằng chứng giúp người viết hiểu vấn đề và kiểm tra sau khi sửa.'),
    (10, 'MEDIUM', 'Khi một thao tác gồm hai bước và bước thứ hai thất bại, bạn nên xác định điều gì trước khi tự động thử lại?',
     '["Máy của ai chạy bước đầu", "Trạng thái đã lưu và tác dụng phụ có thể bị lặp", "Tên biến trong thao tác", "Phiên bản trình soạn thảo"]', 1,
     'Thử lại an toàn đòi hỏi biết phần nào đã thay đổi trạng thái.'),
    (11, 'MEDIUM', 'Để xác định tối ưu hiệu năng có thực sự cải thiện trải nghiệm, nên làm gì?',
     '["Chỉ đọc mã rồi kết luận", "Dựa vào một lần đo trên máy phát triển", "Đo trước và sau trên cùng tải đại diện và so sánh dữ liệu", "Chọn phiên bản có ít dòng mã hơn"]', 2,
     'Cùng tải và phương pháp đo giúp so sánh có ý nghĩa.'),
    (12, 'EASY', 'Nguyên tắc cấp quyền tối thiểu yêu cầu điều gì?',
     '["Mọi nhân viên dùng cùng một tài khoản", "Mặc định cấp quyền quản trị", "Chỉ hạn chế quyền khi có sự cố", "Chỉ cấp quyền cần thiết cho nhiệm vụ, thu hồi khi không còn cần"]', 3,
     'Quyền tối thiểu giảm phạm vi hậu quả của thao tác sai hoặc lộ tài khoản.'),
    (13, 'HARD', 'Để đánh giá khả năng phục hồi sau khi mất môi trường, bài kiểm tra nào cho dữ liệu sát thực tế nhất?',
     '["Khôi phục thử từ bản sao lưu và đối chiếu độ đầy đủ cùng thời gian khôi phục", "Chỉ xác nhận công việc sao lưu báo thành công", "Chỉ đọc quy trình khôi phục", "So sánh hai tên bản sao lưu"]', 0,
     'Diễn tập xác nhận dữ liệu thực sự khôi phục được và đo được thời gian thực tế.'),
    (14, 'MEDIUM', 'Khi phản hồi người mới về một giải pháp chưa phù hợp, cách nào giúp họ tự kiểm tra lại?',
     '["Đưa lời giải duy nhất ngay lập tức", "Cùng xác định giả định, yêu cầu thử một phản ví dụ và giải thích kết quả", "Giao bài khó hơn ngay", "Yêu cầu sao chép giải pháp của đội"]', 1,
     'Phản ví dụ giúp người học kiểm tra giả định và thấy giới hạn của giải pháp.')
)
INSERT INTO question_bank_questions(id, topic_id, content)
SELECT ('797c3a23-d570-41cc-8747-' || lpad(id::text, 12, '0'))::uuid,
       (SELECT id FROM question_bank_topics WHERE lower(name)=lower('Kỹ thuật phần mềm')),
       jsonb_build_object('kind','MCQ','difficulty',difficulty,'status','PUBLISHED','prompt',prompt,
                          'options',options,'correctIndex',correct_index,'explanation',explanation)
FROM starter;

WITH starter(id, prompt, criteria) AS (
    VALUES
    (15, 'Một tính năng sau khi phát hành khiến người dùng chờ lâu hơn. Bạn điều tra thế nào và khi nào quyết định quay lui?',
     'mốc phát hành, số liệu trước và sau, phân đoạn, độ trễ, nguyên nhân, giả thuyết, rollback, ngưỡng tác động'),
    (16, 'Bạn giúp một đồng nghiệp mới xử lý một lỗi chỉ thỉnh thoảng xuất hiện như thế nào?',
     'tái hiện, giả thuyết, nhật ký, điều kiện đầu vào, thu hẹp nguyên nhân, kiểm thử hồi quy, giải thích'),
    (17, 'Hãy mô tả cách bạn triển khai dần một thay đổi mà nhiều nhóm phụ thuộc, và cách kiểm tra để biết triển khai an toàn.',
     'tương thích, phụ thuộc, thay đổi dần, theo dõi, tiêu chí dừng, thông báo, rollback'),
    (18, 'Một vấn đề tồn tại lâu đã được sửa nhiều lần rồi tái xuất. Bạn làm gì để giảm rủi ro quay lại?',
     'nguyên nhân gốc, kiểm thử hồi quy, bằng chứng, đo lường, trách nhiệm, tài liệu, theo dõi')
)
INSERT INTO question_bank_questions(id, topic_id, content)
SELECT ('797c3a23-d570-41cc-8747-' || lpad(id::text, 12, '0'))::uuid,
       (SELECT id FROM question_bank_topics WHERE lower(name)=lower('Kỹ thuật phần mềm')),
       jsonb_build_object('kind','CHAT','difficulty','MEDIUM','status','PUBLISHED','prompt',prompt,
                          'options','[]'::jsonb,'correctIndex',0,'explanation',criteria)
FROM starter;
