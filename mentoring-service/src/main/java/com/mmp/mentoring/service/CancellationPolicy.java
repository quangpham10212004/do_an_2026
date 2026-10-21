package com.mmp.mentoring.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.OffsetDateTime;

/**
 * Bản chốt v2.0 §7 — chính sách huỷ buổi (hàm thuần, thời điểm "now" truyền vào để test tất định).
 * <ul>
 *   <li>Mentee huỷ trước khi mentor xác nhận → hoàn 100%.</li>
 *   <li>Mentee huỷ ≥ 24 giờ trước giờ bắt đầu → 100%; từ 4 giờ đến dưới 24 giờ → 50%; dưới 4 giờ → 0% (mentor nhận
 *       phần không hoàn trừ hoa hồng).</li>
 *   <li>Buổi trải nghiệm: mentee huỷ ≥ 2 giờ trước giờ bắt đầu → 100%, muộn hơn → 0%.</li>
 *   <li>Mentor huỷ bất kỳ lúc nào → hoàn 100% + 1 lỗi vi phạm (US-02: 3 lỗi / 30 ngày → PAUSED).</li>
 *   <li>Hệ thống / admin huỷ → hoàn 100%.</li>
 * </ul>
 * Không còn điểm xin lỗi khi mentor huỷ và không còn cơ chế "huỷ muộn phiên miễn phí" (không còn buổi miễn phí).
 * Các ngưỡng cấu hình ở {@code app.cancellation.*}.
 */
@Component
public class CancellationPolicy {

    public enum Actor { MENTEE, MENTOR, SYSTEM }

    /**
     * Kết quả áp chính sách. refundAmount = số tiền thực hoàn (0 nếu phiên chưa thanh toán). rewardPoints / lateFreeCancel
     * giữ trong record để không đổi API (CancelPreviewView) nhưng luôn 0 / false từ v2.0.
     */
    public record Decision(Actor actor, int refundPercent, BigDecimal refundAmount, int rewardPoints, boolean strike,
                           boolean lateFreeCancel, String policyText) {
    }

    private final Duration fullRefundBefore;
    private final Duration halfRefundBefore;
    private final Duration trialFullRefundBefore;

    public CancellationPolicy(@Value("${app.cancellation.full-refund-before:PT24H}") Duration fullRefundBefore,
                              @Value("${app.cancellation.half-refund-before:PT4H}") Duration halfRefundBefore,
                              @Value("${app.cancellation.trial-full-refund-before:PT2H}") Duration trialFullRefundBefore) {
        this.fullRefundBefore = fullRefundBefore;
        this.halfRefundBefore = halfRefundBefore;
        this.trialFullRefundBefore = trialFullRefundBefore;
    }

    /** Giá trị mặc định của sản phẩm (24h / 4h / trải nghiệm 2h). */
    public static CancellationPolicy defaults() {
        return new CancellationPolicy(Duration.ofHours(24), Duration.ofHours(4), Duration.ofHours(2));
    }

    /**
     * @param price           giá phiên
     * @param paid            học phí đã được tạm giữ (AWAITING_MENTOR hoặc CONFIRMED, price &gt; 0)
     * @param trial           buổi trải nghiệm
     * @param mentorConfirmed mentor đã xác nhận buổi (false = mentee huỷ trước khi mentor xác nhận → hoàn đủ)
     */
    public Decision evaluate(Actor actor, BigDecimal price, boolean paid, OffsetDateTime start, OffsetDateTime now,
                             boolean trial, boolean mentorConfirmed) {
        Duration before = Duration.between(now, start);
        int percent = switch (actor) {
            case MENTOR, SYSTEM -> 100;
            case MENTEE -> !mentorConfirmed ? 100
                    : trial ? (before.compareTo(trialFullRefundBefore) >= 0 ? 100 : 0)
                    : before.compareTo(fullRefundBefore) >= 0 ? 100
                    : before.compareTo(halfRefundBefore) >= 0 ? 50 : 0;
        };
        BigDecimal amount = paid ? refundAmount(price, percent) : BigDecimal.ZERO;
        boolean strike = actor == Actor.MENTOR;
        return new Decision(actor, paid ? percent : 0, amount, 0, strike, false,
                policyText(actor, paid, trial, mentorConfirmed, percent, amount));
    }

    /** Tương thích lời gọi cũ: buổi thường, mentor đã xác nhận. */
    public Decision evaluate(Actor actor, BigDecimal price, boolean paid, OffsetDateTime start, OffsetDateTime now) {
        return evaluate(actor, price, paid, start, now, false, true);
    }

    static BigDecimal refundAmount(BigDecimal price, int percent) {
        return price.multiply(BigDecimal.valueOf(percent)).divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP);
    }

    private String policyText(Actor actor, boolean paid, boolean trial, boolean mentorConfirmed, int percent, BigDecimal amount) {
        String money = String.format("%,d", amount.longValue()).replace(',', '.') + "đ";
        return switch (actor) {
            case MENTOR -> (paid ? "Mentor huỷ phiên: mentee được hoàn 100% (" + money + ")" : "Mentor huỷ phiên")
                    + ". Mentor bị ghi 1 lần vi phạm (strike).";
            case SYSTEM -> paid ? "Hệ thống huỷ phiên: hoàn 100% (" + money + ")." : "Hệ thống huỷ phiên.";
            case MENTEE -> {
                if (!paid) yield "Phiên chưa tạm giữ học phí — huỷ không mất phí.";
                if (!mentorConfirmed) yield "Mentor chưa xác nhận — huỷ được hoàn 100% (" + money + ").";
                if (trial) {
                    yield percent == 100
                            ? "Buổi trải nghiệm huỷ trước giờ bắt đầu từ " + trialFullRefundBefore.toHours() + " giờ: hoàn 100% (" + money + ")."
                            : "Buổi trải nghiệm huỷ trong vòng " + trialFullRefundBefore.toHours() + " giờ trước giờ bắt đầu: không được hoàn tiền (0đ).";
                }
                yield switch (percent) {
                    case 100 -> "Huỷ trước giờ bắt đầu từ " + fullRefundBefore.toHours() + " giờ trở lên: hoàn 100% (" + money + ").";
                    case 50 -> "Huỷ từ " + halfRefundBefore.toHours() + " đến dưới " + fullRefundBefore.toHours()
                            + " giờ trước giờ bắt đầu: hoàn 50% (" + money + ").";
                    default -> "Huỷ trong vòng " + halfRefundBefore.toHours() + " giờ trước giờ bắt đầu: không được hoàn tiền (0đ).";
                };
            }
        };
    }
}
