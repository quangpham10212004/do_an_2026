package com.mmp.auth.service;

/**
 * Gửi email. Phạm vi đồ án không tích hợp SMTP thật: implementation mặc định là
 * {@link LoggingEmailSender} (ghi nội dung ra log). Khi triển khai thật chỉ cần thêm một bean
 * khác (ví dụ dùng JavaMailSender) đánh dấu @Primary — nghiệp vụ không đổi.
 */
public interface EmailSender {

    void send(String to, String subject, String body);
}
