package com.mmp.payment.service;

import com.mmp.payment.client.AuditClient;
import com.mmp.payment.client.ProfileClient;
import com.mmp.payment.dto.PaymentDtos.*;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.service.MentorReferralRules.Verdict;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Bản chốt v2.0 §11 — giới thiệu người học theo từng mentor. Mã riêng cho cặp (người giới thiệu, mentor), chỉ cấp sau khi người giới
 * thiệu đã hoàn thành >= 1 buổi thường đã trả tiền với mentor đó. Người mới nhập mã ở yêu cầu đặt buổi thường đầu tiên với mentor
 * (không giảm giá). Thưởng {@code reward}đ TIỀN KHUYẾN MÃI sau khi buổi hoàn thành + qua {@code pending} ngày không hoàn tiền.
 */
@Service
public class MentorReferralService {

    private static final Logger log = LoggerFactory.getLogger(MentorReferralService.class);
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final WalletLedger wallet;
    private final ProfileClient profiles;
    private final AuditClient audit;
    private final BigDecimal reward;
    private final Duration pending;
    private final int monthlyCap;
    private final int anomalyUses;
    private final String frontendUrl;

    public MentorReferralService(JdbcTemplate jdbc, TransactionTemplate tx, WalletLedger wallet, ProfileClient profiles, AuditClient audit,
                                 @Value("${app.referral.reward-amount:30000}") BigDecimal reward,
                                 @Value("${app.referral.pending:P7D}") Duration pending,
                                 @Value("${app.referral.monthly-cap:5}") int monthlyCap,
                                 @Value("${app.referral.anomaly-uses-24h:3}") int anomalyUses,
                                 @Value("${app.frontend-url:http://localhost:3000}") String frontendUrl) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.wallet = wallet;
        this.profiles = profiles;
        this.audit = audit;
        this.reward = reward;
        this.pending = pending;
        this.monthlyCap = monthlyCap;
        this.anomalyUses = anomalyUses;
        this.frontendUrl = frontendUrl;
    }

    private static final RowMapper<MentorReferralView> VIEW = (rs, i) -> new MentorReferralView(
            rs.getObject("id", UUID.class), rs.getObject("owner_id", UUID.class), rs.getObject("mentor_id", UUID.class),
            rs.getObject("referee_id", UUID.class), rs.getObject("session_id", UUID.class), rs.getString("status"),
            rs.getString("reject_reason"), rs.getBigDecimal("reward_amount"), rs.getObject("created_at", OffsetDateTime.class),
            rs.getObject("decided_at", OffsetDateTime.class));

    // ------------------------------------------------------------------ mã

    /** Các mentor mà người dùng đủ điều kiện có mã: đã hoàn thành >= 1 buổi thường đã trả tiền (final-state COMPLETED, không hoàn toàn bộ). */
    public List<UUID> eligibleMentors(UUID ownerId) {
        return jdbc.queryForList("""
                SELECT DISTINCT t.mentor_id FROM transactions t
                  JOIN earning_schedules es ON es.transaction_id = t.id
                 WHERE t.payer_id = ? AND t.kind = 'SESSION' AND t.session_kind = 'REGULAR'
                   AND t.status IN ('SUCCESS', 'PARTIALLY_REFUNDED') AND es.final_state = 'COMPLETED'
                """, UUID.class, ownerId);
    }

    /** Lấy (hoặc tạo lần đầu) mã của cặp (owner, mentor); chưa đủ điều kiện → 409 REFERRAL_NOT_ELIGIBLE. */
    public MentorReferralCodeView codeFor(UUID ownerId, UUID mentorId) {
        if (!eligibleMentors(ownerId).contains(mentorId)) {
            throw ApiException.conflict("REFERRAL_NOT_ELIGIBLE", "Bạn cần hoàn thành ít nhất một buổi học đã trả tiền với mentor này để có mã giới thiệu");
        }
        return tx.execute(s -> {
            List<String> existing = jdbc.queryForList("SELECT code FROM mentor_referral_codes WHERE owner_id = ? AND mentor_id = ?", String.class, ownerId, mentorId);
            String code = existing.isEmpty() ? null : existing.get(0);
            if (code == null) {
                do {
                    code = randomCode();
                } while (jdbc.queryForObject("SELECT COUNT(*) FROM mentor_referral_codes WHERE code = ?", Integer.class, code) > 0);
                jdbc.update("INSERT INTO mentor_referral_codes (owner_id, mentor_id, code) VALUES (?, ?, ?) ON CONFLICT (owner_id, mentor_id) DO NOTHING", ownerId, mentorId, code);
                code = jdbc.queryForObject("SELECT code FROM mentor_referral_codes WHERE owner_id = ? AND mentor_id = ?", String.class, ownerId, mentorId);
            }
            return new MentorReferralCodeView(mentorId, profiles.displayName(mentorId), code, frontendUrl + "/mentors/" + mentorId + "?ref=" + code);
        });
    }

    // ------------------------------------------------------------------ dùng mã

    /** Kiểm tra mã trước khi tạo buổi (mentoring gọi): ném 400/404/409 với mã lỗi cụ thể; không ghi gì. */
    public void validate(String rawCode, UUID refereeId, UUID mentorId) {
        evaluateApply(rawCode, refereeId, mentorId);
    }

    private Map<String, Object> evaluateApply(String rawCode, UUID refereeId, UUID mentorId) {
        String code = rawCode == null ? "" : rawCode.trim().toUpperCase();
        List<Map<String, Object>> found = jdbc.queryForList("SELECT id, owner_id, mentor_id FROM mentor_referral_codes WHERE code = ?", code);
        Map<String, Object> row = found.isEmpty() ? null : found.get(0);
        boolean already = jdbc.queryForObject("SELECT COUNT(*) FROM mentor_referrals WHERE referee_id = ? AND mentor_id = ?", Integer.class, refereeId, mentorId) > 0;
        MentorReferralRules.applyError(row != null, row != null && mentorId.equals(row.get("mentor_id")),
                row != null && refereeId.equals(row.get("owner_id")), already).ifPresent(err -> {
            throw ApiException.badRequest(err, switch (err) {
                case "REFERRAL_CODE_NOT_FOUND" -> "Mã giới thiệu không tồn tại";
                case "REFERRAL_CODE_WRONG_MENTOR" -> "Mã giới thiệu này dành cho mentor khác";
                case "SELF_REFERRAL" -> "Không thể dùng mã giới thiệu của chính mình";
                default -> "Bạn đã dùng mã giới thiệu cho mentor này";
            });
        });
        return row;
    }

    /** Ghi nhận mã được dùng ở buổi thường đầu tiên (mentoring gọi sau khi tạo phiên). Bất thường (> 3 lượt / 24 giờ) → UNDER_REVIEW. */
    public MentorReferralView apply(String rawCode, UUID refereeId, UUID mentorId, UUID sessionId) {
        Map<String, Object> code = evaluateApply(rawCode, refereeId, mentorId);
        UUID ownerId = (UUID) code.get("owner_id");
        return tx.execute(s -> {
            long uses24h = jdbc.queryForObject("SELECT COUNT(*) FROM mentor_referrals WHERE owner_id = ? AND created_at > now() - interval '24 hours'", Long.class, ownerId);
            String status = MentorReferralRules.anomalous(uses24h + 1, anomalyUses + 1) ? "UNDER_REVIEW" : "REGISTERED";
            UUID id = jdbc.queryForObject("INSERT INTO mentor_referrals (code_id, owner_id, mentor_id, referee_id, session_id, status) VALUES (?, ?, ?, ?, ?, ?) "
                    + "ON CONFLICT (session_id) DO UPDATE SET session_id = EXCLUDED.session_id RETURNING id", UUID.class,
                    code.get("id"), ownerId, mentorId, refereeId, sessionId, status);
            if ("UNDER_REVIEW".equals(status)) {
                audit.system("REFERRAL_FLAGGED", "REFERRAL", id, AuditClient.fields("ownerId", ownerId, "uses24h", uses24h + 1));
            }
            return get(id);
        });
    }

    // ------------------------------------------------------------------ đánh giá thưởng

    /**
     * Job: xét các lượt REGISTERED — buổi COMPLETED + đã trả tiền + qua 7 ngày kể từ giờ kết thúc mà không bị hoàn tiền → thưởng
     * khuyến mãi (trần {@code monthlyCap} lượt / tháng); buổi bị hoàn tiền / không hoàn thành → REJECTED. Trả về số lượt đã quyết định.
     */
    public int evaluateDue(OffsetDateTime now) {
        List<UUID> ids = jdbc.queryForList("SELECT id FROM mentor_referrals WHERE status = 'REGISTERED' ORDER BY created_at", UUID.class);
        int n = 0;
        for (UUID id : ids) {
            Boolean decided = tx.execute(s -> evaluateOne(id, now));
            if (Boolean.TRUE.equals(decided)) n++;
        }
        return n;
    }

    private boolean evaluateOne(UUID id, OffsetDateTime now) {
        Map<String, Object> r = jdbc.queryForMap("SELECT owner_id, session_id, status FROM mentor_referrals WHERE id = ? FOR UPDATE", id);
        if (!"REGISTERED".equals(r.get("status"))) return false;
        UUID ownerId = (UUID) r.get("owner_id");
        UUID sessionId = (UUID) r.get("session_id");
        List<Map<String, Object>> t = jdbc.queryForList("""
                SELECT t.id AS tx_id, t.status AS tx_status, es.final_state, es.ended_at,
                       (SELECT COUNT(*) FROM refunds rf WHERE rf.transaction_id = t.id) AS refunds
                  FROM transactions t LEFT JOIN earning_schedules es ON es.transaction_id = t.id
                 WHERE t.session_id = ? AND t.kind = 'SESSION' AND t.status IN ('SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED', 'ON_HOLD')
                 ORDER BY t.created_at DESC LIMIT 1
                """, sessionId);
        if (t.isEmpty()) return false;   // chưa trả tiền / phiên chưa được xác nhận — chờ
        Map<String, Object> row = t.get(0);
        boolean refunded = ((Number) row.get("refunds")).longValue() > 0 || "REFUNDED".equals(row.get("tx_status"));
        OffsetDateTime endedAt = row.get("ended_at") == null ? null : ((java.sql.Timestamp) row.get("ended_at")).toInstant().atZone(VN).toOffsetDateTime();
        int qualified = jdbc.queryForObject("SELECT COUNT(*) FROM mentor_referrals WHERE owner_id = ? AND status = 'QUALIFIED' AND decided_at >= ?",
                Integer.class, ownerId, now.atZoneSameInstant(VN).toLocalDate().withDayOfMonth(1).atStartOfDay(VN).toOffsetDateTime());
        Verdict v = MentorReferralRules.decide((String) row.get("final_state"), refunded, endedAt, now, pending, qualified, monthlyCap);
        switch (v) {
            case WAIT -> {
                return false;
            }
            case QUALIFY -> {
                wallet.grantPromo(ownerId, reward, "REFERRAL", id.toString(), now);
                jdbc.update("UPDATE mentor_referrals SET status = 'QUALIFIED', reward_amount = ?, decided_at = ? WHERE id = ?", reward, now, id);
                audit.system("REFERRAL_REWARDED", "REFERRAL", id, AuditClient.fields("ownerId", ownerId, "amount", reward));
                log.info("Referral {} qualified: +{} promo for {}", id, reward, ownerId);
            }
            case CAPPED -> jdbc.update("UPDATE mentor_referrals SET status = 'CAPPED', reject_reason = 'MONTHLY_CAP', decided_at = ? WHERE id = ?", now, id);
            case REJECT_REFUNDED -> jdbc.update("UPDATE mentor_referrals SET status = 'REJECTED', reject_reason = 'SESSION_REFUNDED', decided_at = ? WHERE id = ?", now, id);
            case REJECT_NOT_COMPLETED -> jdbc.update("UPDATE mentor_referrals SET status = 'REJECTED', reject_reason = 'SESSION_NOT_COMPLETED', decided_at = ? WHERE id = ?", now, id);
        }
        return true;
    }

    // ------------------------------------------------------------------ xem

    public MyMentorReferrals overview(UUID userId) {
        OffsetDateTime now = OffsetDateTime.now();
        List<MentorReferralCodeView> codes = eligibleMentors(userId).stream().map(m -> codeFor(userId, m)).toList();
        List<MentorReferralView> referrals = jdbc.query("SELECT * FROM mentor_referrals WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100", VIEW, userId);
        int qualifiedThisMonth = jdbc.queryForObject("SELECT COUNT(*) FROM mentor_referrals WHERE owner_id = ? AND status = 'QUALIFIED' AND decided_at >= ?",
                Integer.class, userId, now.atZoneSameInstant(VN).toLocalDate().withDayOfMonth(1).atStartOfDay(VN).toOffsetDateTime());
        BigDecimal earned = jdbc.queryForObject("SELECT COALESCE(SUM(reward_amount), 0) FROM mentor_referrals WHERE owner_id = ? AND status = 'QUALIFIED'", BigDecimal.class, userId);
        return new MyMentorReferrals(reward, (int) pending.toDays(), monthlyCap, qualifiedThisMonth, earned, codes, referrals);
    }

    public List<MentorReferralView> adminList(String status) {
        return status == null || status.isBlank()
                ? jdbc.query("SELECT * FROM mentor_referrals ORDER BY created_at DESC LIMIT 200", VIEW)
                : jdbc.query("SELECT * FROM mentor_referrals WHERE status = ? ORDER BY created_at DESC LIMIT 200", VIEW, status.toUpperCase());
    }

    /** Admin xét lượt UNDER_REVIEW: duyệt → REGISTERED (vào luồng bình thường), từ chối → REJECTED. Bắt buộc lý do. */
    public MentorReferralView decide(UUID adminId, UUID id, boolean approve, String reason) {
        if (reason == null || reason.isBlank()) throw ApiException.badRequest("REASON_REQUIRED", "Bắt buộc ghi lý do");
        tx.executeWithoutResult(s -> {
            String status = jdbc.queryForObject("SELECT status FROM mentor_referrals WHERE id = ? FOR UPDATE", String.class, id);
            if (!"UNDER_REVIEW".equals(status)) throw ApiException.conflict("REFERRAL_NOT_UNDER_REVIEW", "Lượt giới thiệu không ở trạng thái chờ xem xét");
            if (approve) jdbc.update("UPDATE mentor_referrals SET status = 'REGISTERED' WHERE id = ?", id);
            else jdbc.update("UPDATE mentor_referrals SET status = 'REJECTED', reject_reason = ?, decided_at = now() WHERE id = ?", reason.trim(), id);
        });
        audit.record(adminId, "ADMIN", approve ? "REFERRAL_APPROVED" : "REFERRAL_REJECTED", "REFERRAL", id.toString(), null, AuditClient.fields("reason", reason));
        return get(id);
    }

    private MentorReferralView get(UUID id) {
        return jdbc.queryForObject("SELECT * FROM mentor_referrals WHERE id = ?", VIEW, id);
    }

    static String randomCode() {
        StringBuilder sb = new StringBuilder(8);
        for (int i = 0; i < 8; i++) sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        return sb.toString();
    }
}
