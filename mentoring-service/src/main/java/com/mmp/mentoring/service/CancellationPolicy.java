package com.mmp.mentoring.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

/**
 * US-01 — chính sách huỷ phiên (hàm thuần, thời điểm "now" truyền vào để test tất định).
 * <ul>
 *   <li>Mentee huỷ ≥ 72 giờ trước giờ bắt đầu → hoàn 100%; &lt; 72 giờ → hoàn 0% (mentor nhận giá − phí nền tảng).</li>
 *   <li>Mentor huỷ bất kỳ lúc nào → hoàn 100% + 20 điểm thưởng xin lỗi cho mentee + 1 strike (US-02).</li>
 *   <li>Hệ thống huỷ → hoàn 100%.</li>
 *   <li>Phiên miễn phí bị mentee huỷ &lt; 2 giờ trước giờ bắt đầu → ghi nhận huỷ muộn; 3 lần trong 30 ngày
 *       → chặn đặt phiên miễn phí 14 ngày.</li>
 * </ul>
 * Các ngưỡng cấu hình ở {@code app.cancellation.*}.
 */
@Component
public class CancellationPolicy {

    public enum Actor { MENTEE, MENTOR, SYSTEM }

    /**
     * Kết quả áp chính sách. refundAmount = số tiền thực hoàn (0 nếu phiên chưa thanh toán / miễn phí).
     */
    public record Decision(Actor actor, int refundPercent, BigDecimal refundAmount, int rewardPoints, boolean strike,
                           boolean lateFreeCancel, String policyText) {
    }

    private final Duration fullRefundBefore;
    private final Duration freeLateWindow;
    private final int mentorApologyPoints;
    private final int freeBlockThreshold;
    private final Duration freeBlockWindow;
    private final Duration freeBlockDuration;

    public CancellationPolicy(@Value("${app.cancellation.full-refund-before:PT72H}") Duration fullRefundBefore,
                              @Value("${app.cancellation.free-late-window:PT2H}") Duration freeLateWindow,
                              @Value("${app.cancellation.mentor-apology-points:20}") int mentorApologyPoints,
                              @Value("${app.cancellation.free-block-threshold:3}") int freeBlockThreshold,
                              @Value("${app.cancellation.free-block-window:P30D}") Duration freeBlockWindow,
                              @Value("${app.cancellation.free-block-duration:P14D}") Duration freeBlockDuration) {
        this.fullRefundBefore = fullRefundBefore;
        this.freeLateWindow = freeLateWindow;
        this.mentorApologyPoints = mentorApologyPoints;
        this.freeBlockThreshold = freeBlockThreshold;
        this.freeBlockWindow = freeBlockWindow;
        this.freeBlockDuration = freeBlockDuration;
    }

    /** Giá trị mặc định của sản phẩm (72h / 2h / 20 điểm / 3 lần trong 30 ngày → chặn 14 ngày). */
    public static CancellationPolicy defaults() {
        return new CancellationPolicy(Duration.ofHours(72), Duration.ofHours(2), 20, 3, Duration.ofDays(30), Duration.ofDays(14));
    }

    /**
     * @param price giá phiên
     * @param paid  phiên đã thanh toán thành công (CONFIRMED và price &gt; 0)
     */
    public Decision evaluate(Actor actor, BigDecimal price, boolean paid, OffsetDateTime start, OffsetDateTime now) {
        boolean free = price == null || price.signum() == 0;
        Duration before = Duration.between(now, start);
        int percent = switch (actor) {
            case MENTOR, SYSTEM -> 100;
            case MENTEE -> before.compareTo(fullRefundBefore) >= 0 ? 100 : 0;
        };
        BigDecimal amount = paid ? refundAmount(price, percent) : BigDecimal.ZERO;
        int points = actor == Actor.MENTOR ? mentorApologyPoints : 0;
        boolean strike = actor == Actor.MENTOR;
        boolean lateFree = actor == Actor.MENTEE && free && before.compareTo(freeLateWindow) < 0;
        return new Decision(actor, paid ? percent : 0, amount, points, strike, lateFree,
                policyText(actor, free, paid, percent, amount, lateFree, points));
    }

    static BigDecimal refundAmount(BigDecimal price, int percent) {
        return price.multiply(BigDecimal.valueOf(percent)).divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP);
    }

    private String policyText(Actor actor, boolean free, boolean paid, int percent, BigDecimal amount, boolean lateFree, int points) {
        long fullHours = fullRefundBefore.toHours();
        String money = String.format("%,d", amount.longValue()).replace(',', '.') + "đ";
        return switch (actor) {
            case MENTOR -> (paid ? "Mentor huỷ phiên: mentee được hoàn 100% (" + money + ")" : "Mentor huỷ phiên")
                    + " và nhận " + points + " điểm thưởng xin lỗi. Mentor bị ghi 1 lần vi phạm (strike).";
            case SYSTEM -> paid ? "Hệ thống huỷ phiên: hoàn 100% (" + money + ")." : "Hệ thống huỷ phiên.";
            case MENTEE -> {
                if (free) {
                    yield lateFree
                            ? "Phiên miễn phí huỷ trước giờ bắt đầu dưới " + freeLateWindow.toHours() + " giờ sẽ bị ghi nhận huỷ muộn. "
                            + freeBlockThreshold + " lần huỷ muộn trong " + freeBlockWindow.toDays() + " ngày sẽ bị chặn đặt phiên miễn phí "
                            + freeBlockDuration.toDays() + " ngày."
                            : "Phiên miễn phí — huỷ không mất phí.";
                }
                if (!paid) yield "Phiên chưa thanh toán — huỷ không mất phí.";
                yield percent == 100
                        ? "Huỷ trước giờ bắt đầu từ " + fullHours + " giờ trở lên: hoàn 100% (" + money + ")."
                        : "Huỷ trong vòng " + fullHours + " giờ trước giờ bắt đầu: không được hoàn tiền (0đ).";
            }
        };
    }

    /**
     * Thời điểm hết bị chặn đặt phiên miễn phí, nếu đang bị chặn. Bị chặn khi có một lần huỷ muộn c mà trong
     * (c − 30 ngày, c] có ≥ 3 lần huỷ muộn; chặn tới c + 14 ngày.
     */
    public Optional<OffsetDateTime> freeBookingBlockedUntil(List<OffsetDateTime> lateCancels, OffsetDateTime now) {
        List<OffsetDateTime> sorted = lateCancels.stream().sorted().toList();
        Optional<OffsetDateTime> until = Optional.empty();
        for (int i = 0; i < sorted.size(); i++) {
            OffsetDateTime c = sorted.get(i);
            OffsetDateTime from = c.minus(freeBlockWindow);
            long inWindow = sorted.subList(0, i + 1).stream().filter(x -> x.isAfter(from)).count();
            if (inWindow >= freeBlockThreshold) {
                OffsetDateTime candidate = c.plus(freeBlockDuration);
                if (until.isEmpty() || candidate.isAfter(until.get())) until = Optional.of(candidate);
            }
        }
        return until.filter(u -> u.isAfter(now));
    }

    /** Số giờ báo trước tối thiểu để mentee huỷ mà được hoàn (72). */
    public long fullRefundHours() {
        return fullRefundBefore.toHours();
    }

    /** Khoảng thời gian cần đọc lại lịch sử huỷ muộn để tính chặn. */
    public Duration lookback() {
        return freeBlockWindow.plus(freeBlockDuration);
    }
}
