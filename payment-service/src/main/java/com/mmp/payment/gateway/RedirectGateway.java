package com.mmp.payment.gateway;

import com.mmp.payment.entity.Transaction;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * US-56 — cổng thanh toán kiểu chuyển hướng (VNPay, MoMo): tạo link → người dùng trả trên trang của cổng → kết quả về qua
 * IPN (server → server) hoặc truy vấn trạng thái. Khác {@link PaymentGateway} (sandbox, trả kết quả ngay trong 1 lần gọi).
 */
public interface RedirectGateway {

    /** Kết quả truy vấn: SUCCESS / FAILED là kết luận cuối; PENDING = chưa có kết quả, hỏi lại sau. */
    enum QueryOutcome { SUCCESS, FAILED, PENDING }

    record QueryResult(QueryOutcome outcome, String providerReference, String code) {
    }

    /** Dữ liệu IPN / trang return đã kiểm chữ ký. */
    record Callback(String txnRef, BigDecimal amount, boolean paid, String providerReference, String failureReason) {
    }

    /** Giá trị cột transactions.provider, vd. "VNPAY". */
    String provider();

    /** Có đủ khoá cấu hình để gọi cổng (IPN / truy vấn / hoàn tiền vẫn chạy kể cả khi cổng khác đang được chọn). */
    boolean configured();

    /** Link thanh toán còn hiệu lực bao lâu sau khi tạo (quá hạn + 5 phút mà cổng chưa có kết quả → FAILED). */
    Duration linkTtl();

    /** Mã đơn gửi sang cổng (duy nhất, chỉ ký tự cổng chấp nhận). */
    String txnRef(UUID transactionId);

    /** Tạo link thanh toán cho giao dịch PENDING (đã có providerTxnRef, providerCreatedAt). */
    String createPaymentUrl(Transaction t, String clientIp);

    /** Kiểm chữ ký tham số IPN / return; rỗng nếu chữ ký sai hoặc thiếu. */
    Optional<Callback> verifyCallback(Map<String, String> params);

    QueryResult query(Transaction t);

    PaymentGateway.ChargeResult refund(Transaction t, BigDecimal amount, boolean full, String createdBy);
}
