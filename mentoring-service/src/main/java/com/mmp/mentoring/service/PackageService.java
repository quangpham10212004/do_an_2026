package com.mmp.mentoring.service;

import com.mmp.mentoring.client.PaymentClient;
import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.SessionPackage;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.repository.SessionPackageRepository;
import com.mmp.mentoring.security.AuthUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Gói buổi (combo): mentee mua N buổi giá ưu đãi, mỗi lần đặt phiên trừ 1 buổi.
 *
 * <p>Tiền do payment-service thu; mentoring-service giữ số buổi còn lại. Khi gói hết hạn hoặc bị huỷ mà còn buổi
 * chưa dùng, số tiền phải hoàn được ghi vào {@code refundDue} và {@code refundPending}; {@link #retryRefunds()}
 * gọi payment-service cho tới khi thành công (cùng cách làm với job đối soát thanh toán).</p>
 */
@Service
public class PackageService {

    private static final Logger log = LoggerFactory.getLogger(PackageService.class);

    private final SessionPackageRepository packageRepo;
    private final MentoringRequestRepository requestRepo;
    private final ProfileClient profileClient;
    private final PaymentClient paymentClient;
    private final NotificationService notifications;
    private final TransactionTemplate tx;
    private final List<PackageRules.Tier> tiers;
    private final Duration validity;
    private final int refundFeePercent;
    private final Duration paymentHold;

    public PackageService(SessionPackageRepository packageRepo, MentoringRequestRepository requestRepo,
                          ProfileClient profileClient, PaymentClient paymentClient, NotificationService notifications,
                          TransactionTemplate tx,
                          @Value("${app.packages.tiers}") String tiers,
                          @Value("${app.packages.validity}") Duration validity,
                          @Value("${app.packages.refund-fee-percent}") int refundFeePercent,
                          @Value("${app.booking.payment-hold}") Duration paymentHold) {
        this.packageRepo = packageRepo;
        this.requestRepo = requestRepo;
        this.profileClient = profileClient;
        this.paymentClient = paymentClient;
        this.notifications = notifications;
        this.tx = tx;
        this.tiers = PackageRules.parseTiers(tiers);
        this.validity = validity;
        this.refundFeePercent = refundFeePercent;
        this.paymentHold = paymentHold;
    }

    // ---------------- Xem & mua ----------------

    /** Các mức gói có thể mua của một mentor (rỗng nếu mentor dạy miễn phí). */
    public PackageOptionsView options(UUID mentorId, Integer durationMinutes) {
        int duration = durationMinutes == null ? 60 : durationMinutes;
        if (!BookingRules.isAllowedDuration(duration)) {
            throw ApiException.badRequest("INVALID_DURATION", "Thời lượng phải là 30, 45, 60, 90 hoặc 120 phút");
        }
        ProfileClient.MentorInfo mentor = profileClient.findMentor(mentorId)
                .orElseThrow(() -> ApiException.notFound("MENTOR_NOT_FOUND", "Không tìm thấy mentor"));
        BigDecimal single = BookingRules.price(mentor.hourlyRate(), duration);
        List<PackageOption> options = single.signum() <= 0 ? List.of() : tiers.stream().map(t -> {
            BigDecimal unit = PackageRules.unitPrice(single, t.discountPercent());
            BigDecimal total = PackageRules.totalPrice(unit, t.sessions());
            return new PackageOption(t.sessions(), t.discountPercent(), unit, total,
                    PackageRules.savings(single, total, t.sessions()), validity.toDays());
        }).toList();
        return new PackageOptionsView(mentorId, duration, single, options);
    }

    /** Tạo gói ở trạng thái chờ thanh toán; mentee thanh toán qua payment-service để kích hoạt. */
    public PackageView purchase(AuthUser mentee, PurchasePackageInput in) {
        int duration = in.durationMinutes() == null ? 60 : in.durationMinutes();
        PackageRules.Tier tier = tiers.stream().filter(t -> t.sessions() == in.sessions()).findFirst()
                .orElseThrow(() -> ApiException.badRequest("INVALID_PACKAGE_TIER", "Mức gói không hợp lệ"));
        MentoringRequest relationship = requestRepo
                .findFirstByMenteeIdAndMentorIdAndStatus(mentee.userId(), in.mentorId(), MentoringRequest.Status.ACCEPTED)
                .orElseThrow(() -> ApiException.badRequest("NOT_ACCEPTED", "Bạn cần được mentor nhận chính thức trước khi mua gói"));
        PackageOptionsView view = options(in.mentorId(), duration);
        if (view.singlePrice().signum() <= 0) {
            throw ApiException.badRequest("FREE_MENTOR", "Mentor này dạy miễn phí nên không có gói buổi");
        }
        if (!packageRepo.findByMenteeIdAndMentorIdAndStatusIn(mentee.userId(), in.mentorId(),
                List.of(SessionPackage.Status.PENDING_PAYMENT)).isEmpty()) {
            throw ApiException.conflict("PACKAGE_PAYMENT_PENDING", "Bạn có một gói đang chờ thanh toán với mentor này, hãy thanh toán hoặc huỷ gói đó trước");
        }
        BigDecimal unit = PackageRules.unitPrice(view.singlePrice(), tier.discountPercent());
        SessionPackage saved = tx.execute(s -> packageRepo.save(new SessionPackage(mentee.userId(), in.mentorId(),
                relationship.getId(), tier.sessions(), duration, tier.discountPercent(), unit,
                PackageRules.totalPrice(unit, tier.sessions()))));
        return toView(saved, names(saved));
    }

    public List<PackageView> mine(AuthUser user) {
        List<SessionPackage> list = switch (user.role()) {
            case "MENTOR" -> packageRepo.findByMentorIdOrderByCreatedAtDesc(user.userId());
            case "MENTEE" -> packageRepo.findByMenteeIdOrderByCreatedAtDesc(user.userId());
            default -> packageRepo.findAll();
        };
        Map<UUID, String> names = profileClient.displayNames(
                list.stream().flatMap(p -> Stream.of(p.getMenteeId(), p.getMentorId())).toList());
        return list.stream().map(p -> toView(p, names)).toList();
    }

    // ---------------- Huỷ gói ----------------

    /** Mentee huỷ gói. Chưa thanh toán: huỷ luôn. Đã kích hoạt: hoàn tiền các buổi chưa dùng. */
    public PackageView cancel(AuthUser user, UUID packageId) {
        SessionPackage pkg = find(packageId);
        if (!user.isAdmin() && !pkg.getMenteeId().equals(user.userId())) {
            throw ApiException.forbidden("Chỉ người mua gói mới được huỷ gói");
        }
        if (pkg.getStatus() == SessionPackage.Status.PENDING_PAYMENT) {
            tx.executeWithoutResult(s -> find(packageId).setStatus(SessionPackage.Status.CANCELLED));
        } else if (pkg.getStatus() == SessionPackage.Status.ACTIVE) {
            close(packageId, SessionPackage.Status.CANCELLED, "PACKAGE_CANCELLED");
        } else {
            throw ApiException.conflict("PACKAGE_NOT_CANCELLABLE", "Gói không còn ở trạng thái có thể huỷ");
        }
        SessionPackage updated = find(packageId);
        return toView(updated, names(updated));
    }

    /** Quan hệ mentoring kết thúc: đóng mọi gói còn hiệu lực của cặp này (hoàn tiền buổi chưa dùng). */
    public void endForRelationship(UUID menteeId, UUID mentorId) {
        packageRepo.findByMenteeIdAndMentorIdAndStatusIn(menteeId, mentorId,
                        List.of(SessionPackage.Status.PENDING_PAYMENT, SessionPackage.Status.ACTIVE))
                .forEach(p -> {
                    if (p.getStatus() == SessionPackage.Status.ACTIVE) {
                        close(p.getId(), SessionPackage.Status.CANCELLED, "RELATIONSHIP_ENDED");
                    } else {
                        tx.executeWithoutResult(s -> find(p.getId()).setStatus(SessionPackage.Status.CANCELLED));
                    }
                });
    }

    // ---------------- payment-service gọi ----------------

    public PackageInternalView internalView(UUID packageId) {
        SessionPackage p = find(packageId);
        return new PackageInternalView(p.getId(), p.getMenteeId(), p.getMentorId(), p.getTotalPrice(), p.getStatus().name());
    }

    /** payment-service báo đã thu tiền: kích hoạt gói. Nếu gói đã bị huỷ (quá hạn giữ chỗ) thì hoàn tiền ngay. */
    public PackageInternalView markPaid(UUID packageId, UUID transactionId) {
        SessionPackage pkg = tx.execute(s -> {
            SessionPackage p = packageRepo.findByIdForUpdate(packageId)
                    .orElseThrow(() -> ApiException.notFound("PACKAGE_NOT_FOUND", "Không tìm thấy gói"));
            if (p.getStatus() == SessionPackage.Status.PENDING_PAYMENT) {
                p.setStatus(SessionPackage.Status.ACTIVE);
                p.setExpiresAt(OffsetDateTime.now().plus(validity));
            } else if (p.getStatus() == SessionPackage.Status.CANCELLED && p.getRefundedAmount().signum() == 0 && !p.isRefundPending()) {
                // Gói đã bị huỷ trước khi tiền về: hoàn toàn bộ
                p.setRefundDue(p.getTotalPrice());
                p.setRefundPending(true);
            }
            return p;
        });
        if (pkg.getStatus() == SessionPackage.Status.ACTIVE) {
            notifications.notifyUser(pkg.getMenteeId(), "PACKAGE_ACTIVATED", "Gói buổi đã kích hoạt",
                    "Bạn có " + pkg.getSessionsRemaining() + " buổi, dùng trong " + validity.toDays() + " ngày.", "/mentoring/sessions");
            notifications.notifyUser(pkg.getMentorId(), "PACKAGE_ACTIVATED", "Mentee mua gói buổi",
                    "Một mentee vừa mua gói " + pkg.getSessionsTotal() + " buổi với bạn.", "/mentoring/sessions");
        } else if (pkg.isRefundPending()) {
            attemptRefund(pkg.getId());
        }
        return internalView(packageId);
    }

    // ---------------- dùng/hoàn buổi (gọi BÊN TRONG transaction của SessionService) ----------------

    /** Trừ 1 buổi cho một phiên mới. Khoá hàng gói để hai request song song không dùng quá số buổi. */
    public SessionPackage consume(UUID packageId, UUID menteeId, UUID mentorId, int durationMinutes) {
        SessionPackage p = packageRepo.findByIdForUpdate(packageId)
                .orElseThrow(() -> ApiException.notFound("PACKAGE_NOT_FOUND", "Không tìm thấy gói"));
        if (!p.getMenteeId().equals(menteeId) || !p.getMentorId().equals(mentorId)) {
            throw ApiException.forbidden("Gói này không dùng được cho mentor đã chọn");
        }
        if (!p.isUsable(OffsetDateTime.now())) {
            throw ApiException.conflict("PACKAGE_NOT_USABLE", "Gói đã hết buổi, hết hạn hoặc chưa được thanh toán");
        }
        if (p.getDurationMinutes() != durationMinutes) {
            throw ApiException.badRequest("PACKAGE_DURATION_MISMATCH", "Gói này dành cho phiên " + p.getDurationMinutes() + " phút");
        }
        p.setSessionsRemaining(p.getSessionsRemaining() - 1);
        if (p.getSessionsRemaining() == 0) {
            p.setStatus(SessionPackage.Status.EXHAUSTED);
        }
        return p;
    }

    /**
     * Trả lại 1 buổi khi phiên dùng gói bị huỷ trước giờ. Gói còn hiệu lực: cộng lại buổi. Gói đã đóng
     * (hết hạn/huỷ): cộng phần tiền của 1 buổi vào số tiền phải hoàn.
     */
    public void restoreCredit(UUID packageId) {
        packageRepo.findByIdForUpdate(packageId).ifPresent(p -> {
            switch (p.getStatus()) {
                case ACTIVE, EXHAUSTED -> {
                    p.setSessionsRemaining(Math.min(p.getSessionsRemaining() + 1, p.getSessionsTotal()));
                    p.setStatus(SessionPackage.Status.ACTIVE);
                }
                case EXPIRED, CANCELLED -> {
                    p.setRefundDue(p.getRefundDue().add(PackageRules.refundAmount(p.getUnitPrice(), 1, refundFeePercent)));
                    p.setRefundPending(true);
                }
                default -> {
                }
            }
        });
    }

    // ---------------- job nền ----------------

    /** Gói quá hạn sử dụng: đóng lại và hoàn tiền các buổi chưa dùng. */
    public void expireDue() {
        for (SessionPackage p : packageRepo.findExpired(OffsetDateTime.now())) {
            close(p.getId(), SessionPackage.Status.EXPIRED, "PACKAGE_EXPIRED");
        }
    }

    /** Gói chưa thanh toán quá thời gian giữ chỗ: huỷ. */
    public void expireUnpaid() {
        for (SessionPackage p : packageRepo.findExpiredPendingPayment(OffsetDateTime.now().minus(paymentHold))) {
            tx.executeWithoutResult(s -> packageRepo.findById(p.getId())
                    .filter(x -> x.getStatus() == SessionPackage.Status.PENDING_PAYMENT)
                    .ifPresent(x -> x.setStatus(SessionPackage.Status.CANCELLED)));
        }
    }

    /** Thử lại các khoản hoàn tiền chưa thực hiện được. */
    public void retryRefunds() {
        for (SessionPackage p : packageRepo.findByRefundPendingTrue()) {
            attemptRefund(p.getId());
        }
    }

    // ---------------- nội bộ ----------------

    /** Đóng gói (EXPIRED/CANCELLED), tính tiền hoàn cho các buổi chưa dùng rồi thử hoàn ngay. */
    private void close(UUID packageId, SessionPackage.Status newStatus, String reason) {
        SessionPackage closed = tx.execute(s -> {
            SessionPackage p = packageRepo.findByIdForUpdate(packageId).orElseThrow();
            if (p.getStatus() != SessionPackage.Status.ACTIVE) {
                return p; // đã đóng bởi request khác
            }
            BigDecimal due = PackageRules.refundAmount(p.getUnitPrice(), p.getSessionsRemaining(), refundFeePercent);
            p.setStatus(newStatus);
            p.setSessionsRemaining(0);
            p.setRefundDue(p.getRefundDue().add(due));
            p.setRefundPending(p.getRefundDue().compareTo(p.getRefundedAmount()) > 0);
            return p;
        });
        notifications.notifyUser(closed.getMenteeId(), newStatus == SessionPackage.Status.EXPIRED ? "PACKAGE_EXPIRED" : "PACKAGE_CANCELLED",
                newStatus == SessionPackage.Status.EXPIRED ? "Gói buổi đã hết hạn" : "Gói buổi đã được huỷ",
                closed.isRefundPending()
                        ? "Các buổi chưa dùng sẽ được hoàn lại " + closed.getRefundDue().subtract(closed.getRefundedAmount()).toPlainString() + "đ."
                        : "Gói không còn buổi chưa dùng nên không có khoản hoàn.", "/mentoring/sessions");
        if (closed.isRefundPending()) {
            attemptRefund(packageId);
        }
        log.info("Package {} closed as {} ({})", packageId, newStatus, reason);
    }

    /**
     * Hoàn ngay phần tiền đang chờ của một gói (nếu có) thay vì đợi job nền: dùng sau khi huỷ một buổi của gói đã đóng.
     * Không ném lỗi; nếu payment-service lỗi thì cờ {@code refund_pending} giữ nguyên để job thử lại.
     */
    public void settleRefundNow(UUID packageId) {
        attemptRefund(packageId);
    }

    /** Gọi payment-service hoàn phần còn thiếu; lỗi thì giữ cờ để job thử lại. */
    private void attemptRefund(UUID packageId) {
        SessionPackage p = packageRepo.findById(packageId).orElse(null);
        if (p == null || !p.isRefundPending()) return;
        BigDecimal outstanding = p.getRefundDue().subtract(p.getRefundedAmount());
        if (outstanding.signum() <= 0) {
            tx.executeWithoutResult(s -> packageRepo.findById(packageId).ifPresent(x -> x.setRefundPending(false)));
            return;
        }
        boolean refunded;
        try {
            // Gửi tổng luỹ kế cần hoàn (idempotent): thử lại sau lỗi mạng không hoàn trùng
            refunded = paymentClient.refundPackage(packageId, p.getRefundDue(), "PACKAGE_" + p.getStatus().name());
        } catch (RuntimeException e) {
            log.warn("Refund for package {} failed, will retry: {}", packageId, e.getMessage());
            return;
        }
        if (!refunded) {
            // payment-service không có giao dịch đã thu tiền cho gói này → không có gì để hoàn; bỏ cờ để không thử lại mãi
            log.warn("Package {} has no paid transaction to refund, clearing refund_pending", packageId);
            tx.executeWithoutResult(s -> packageRepo.findById(packageId).ifPresent(x -> x.setRefundPending(false)));
            return;
        }
        tx.executeWithoutResult(s -> packageRepo.findById(packageId).ifPresent(x -> {
            x.setRefundedAmount(x.getRefundedAmount().add(outstanding));
            x.setRefundPending(x.getRefundDue().compareTo(x.getRefundedAmount()) > 0);
        }));
        notifications.notifyUser(p.getMenteeId(), "PACKAGE_REFUNDED", "Đã hoàn tiền gói buổi",
                "Khoản " + outstanding.toPlainString() + "đ cho các buổi chưa dùng đã được hoàn lại.", "/mentoring/sessions");
    }

    private SessionPackage find(UUID id) {
        return packageRepo.findById(id).orElseThrow(() -> ApiException.notFound("PACKAGE_NOT_FOUND", "Không tìm thấy gói"));
    }

    private Map<UUID, String> names(SessionPackage p) {
        return profileClient.displayNames(List.of(p.getMenteeId(), p.getMentorId()));
    }

    static PackageView toView(SessionPackage p, Map<UUID, String> names) {
        return new PackageView(p.getId(), p.getMenteeId(), names.get(p.getMenteeId()), p.getMentorId(), names.get(p.getMentorId()),
                p.getSessionsTotal(), p.getSessionsRemaining(), p.getDurationMinutes(), p.getDiscountPercent(), p.getUnitPrice(),
                p.getTotalPrice(), p.getStatus().name(), p.getExpiresAt(), p.isRefundPending(), p.getRefundDue(),
                p.getRefundedAmount(), p.getCreatedAt());
    }
}
