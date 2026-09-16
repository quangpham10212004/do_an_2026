package com.mmp.payment.service;

import com.mmp.payment.dto.PaymentDtos.*;
import com.mmp.payment.entity.Referral;
import com.mmp.payment.entity.ReferralCode;
import com.mmp.payment.entity.RewardEntry;
import com.mmp.payment.entity.Transaction;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.repository.ReferralCodeRepository;
import com.mmp.payment.repository.ReferralRepository;
import com.mmp.payment.repository.RewardEntryRepository;
import com.mmp.payment.repository.TransactionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Referral/Affiliate (FR-6.4 → FR-6.6).
 *
 * Quy tắc chống gian lận cơ bản:
 * <ol>
 *   <li>Không tự giới thiệu chính mình (ràng buộc cả ở DB).</li>
 *   <li>Mỗi người chỉ được ghi nhận là "người được giới thiệu" 1 lần (unique referee_id).</li>
 *   <li>Chỉ cộng điểm khi người được giới thiệu có giao dịch THÀNH CÔNG ĐẦU TIÊN với
 *       số tiền tối thiểu (tránh giao dịch 0đ / giá trị ảo).</li>
 *   <li>Người giới thiệu không được là mentor của chính giao dịch đó (tránh mentor
 *       tự tạo tài khoản mentee ảo rồi thanh toán cho mình để nhận thưởng).</li>
 *   <li>Giới hạn số referral hợp lệ mỗi ngày của 1 người giới thiệu.</li>
 * </ol>
 */
@Service
public class ReferralService {

    private static final Logger log = LoggerFactory.getLogger(ReferralService.class);
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // bỏ ký tự dễ nhầm O/0/I/1
    private static final SecureRandom RANDOM = new SecureRandom();

    private final ReferralCodeRepository codeRepository;
    private final ReferralRepository referralRepository;
    private final RewardEntryRepository rewardRepository;
    private final TransactionRepository transactionRepository;
    private final int rewardPoints;
    private final BigDecimal minQualifyingAmount;
    private final int maxQualifiedPerDay;
    private final String frontendUrl;

    public ReferralService(ReferralCodeRepository codeRepository, ReferralRepository referralRepository,
                           RewardEntryRepository rewardRepository, TransactionRepository transactionRepository,
                           @Value("${app.referral.reward-points}") int rewardPoints,
                           @Value("${app.referral.min-qualifying-amount}") BigDecimal minQualifyingAmount,
                           @Value("${app.referral.max-qualified-per-referrer-per-day}") int maxQualifiedPerDay,
                           @Value("${app.frontend-url}") String frontendUrl) {
        this.codeRepository = codeRepository;
        this.referralRepository = referralRepository;
        this.rewardRepository = rewardRepository;
        this.transactionRepository = transactionRepository;
        this.rewardPoints = rewardPoints;
        this.minQualifyingAmount = minQualifyingAmount;
        this.maxQualifiedPerDay = maxQualifiedPerDay;
        this.frontendUrl = frontendUrl;
    }

    /** FR-6.4 — lấy (hoặc tạo lần đầu) mã giới thiệu riêng của người dùng. */
    @Transactional
    public ReferralCode getOrCreateCode(UUID userId) {
        return codeRepository.findById(userId).orElseGet(() -> {
            String code;
            do {
                code = randomCode();
            } while (codeRepository.existsByCode(code));
            return codeRepository.save(new ReferralCode(userId, code));
        });
    }

    @Transactional
    public MyReferralOverview overview(UUID userId) {
        ReferralCode code = getOrCreateCode(userId);
        var referrals = referralRepository.findByReferrerIdOrderByCreatedAtDesc(userId);
        long qualified = referrals.stream().filter(r -> r.getStatus() == Referral.Status.QUALIFIED).count();
        return new MyReferralOverview(code.getCode(), frontendUrl + "/register?ref=" + code.getCode(),
                referrals.size(), qualified, rewardRepository.balance(userId), rewardPoints, minQualifyingAmount,
                referrals.stream().map(ReferralResponse::from).toList(),
                rewardRepository.findByUserIdOrderByCreatedAtDesc(userId).stream().map(RewardResponse::from).toList());
    }

    /** FR-6.5 (bước 1) — ghi nhận người dùng mới đăng ký bằng mã giới thiệu. */
    @Transactional
    public ReferralResponse registerReferee(String rawCode, UUID refereeId) {
        String code = rawCode.trim().toUpperCase();
        ReferralCode owner = codeRepository.findByCode(code)
                .orElseThrow(() -> ApiException.notFound("REFERRAL_CODE_NOT_FOUND", "Mã giới thiệu không tồn tại"));
        if (owner.getUserId().equals(refereeId)) {
            throw ApiException.badRequest("SELF_REFERRAL", "Không thể tự giới thiệu chính mình");
        }
        if (referralRepository.findByRefereeId(refereeId).isPresent()) {
            throw ApiException.conflict("ALREADY_REFERRED", "Người dùng đã được ghi nhận giới thiệu trước đó");
        }
        return ReferralResponse.from(referralRepository.save(new Referral(owner.getUserId(), refereeId, code)));
    }

    /**
     * FR-6.5 (bước 2) + FR-6.6 — được gọi trong cùng transaction khi 1 giao dịch
     * thành công. Nếu đây là giao dịch hợp lệ đầu tiên của người được giới thiệu
     * thì cộng điểm cho người giới thiệu.
     */
    @Transactional
    public void onSuccessfulTransaction(Transaction tx) {
        Referral referral = referralRepository.findByRefereeId(tx.getPayerId()).orElse(null);
        if (referral == null || referral.getStatus() != Referral.Status.REGISTERED) {
            return;
        }
        if (transactionRepository.countByPayerIdAndStatus(tx.getPayerId(), Transaction.Status.SUCCESS) > 1) {
            return; // không phải giao dịch thành công đầu tiên
        }
        if (tx.getAmount().compareTo(minQualifyingAmount) < 0) {
            return; // chưa đạt giá trị tối thiểu — vẫn giữ REGISTERED, chờ giao dịch sau
        }
        if (referral.getReferrerId().equals(tx.getMentorId())) {
            reject(referral, "REFERRER_IS_SESSION_MENTOR");
            return;
        }
        OffsetDateTime startOfDay = OffsetDateTime.now().toLocalDate().atStartOfDay().atOffset(OffsetDateTime.now().getOffset());
        long qualifiedToday = referralRepository.countByReferrerIdAndStatusAndQualifiedAtAfter(
                referral.getReferrerId(), Referral.Status.QUALIFIED, startOfDay);
        if (qualifiedToday >= maxQualifiedPerDay) {
            reject(referral, "DAILY_LIMIT_EXCEEDED");
            return;
        }
        referral.setStatus(Referral.Status.QUALIFIED);
        referral.setQualifiedAt(OffsetDateTime.now());
        referral.setQualifyingTxId(tx.getId());
        rewardRepository.save(new RewardEntry(referral.getReferrerId(), rewardPoints,
                "Thưởng giới thiệu người dùng mới (giao dịch " + tx.getId().toString().substring(0, 8) + ")", referral.getId()));
        log.info("Referral {} qualified, +{} points for {}", referral.getId(), rewardPoints, referral.getReferrerId());
    }

    @Transactional(readOnly = true)
    public java.util.List<ReferralResponse> all() {
        return referralRepository.findAllByOrderByCreatedAtDesc().stream().map(ReferralResponse::from).toList();
    }

    private void reject(Referral referral, String reason) {
        referral.setStatus(Referral.Status.REJECTED);
        referral.setRejectReason(reason);
        log.warn("Referral {} rejected: {}", referral.getId(), reason);
    }

    static String randomCode() {
        StringBuilder sb = new StringBuilder(8);
        for (int i = 0; i < 8; i++) {
            sb.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
        }
        return sb.toString();
    }
}
