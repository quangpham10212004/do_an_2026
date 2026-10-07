package com.mmp.mentoring.service;

import com.mmp.mentoring.client.MatchingClient;
import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * US-15 (PRD-REQ-3) — yêu cầu PENDING không được mentor phản hồi sau {@code app.requests.expire-after} (72 giờ) → EXPIRED.
 * Số mentee đang hướng dẫn của mentor không đổi (PENDING không tính vào active_mentee_count nên không đồng bộ lại).
 * Mentee được báo kèm link /matching và tối đa 3 mentor tương tự từ matching-service (best-effort, gọi ngoài transaction).
 */
@Service
public class RequestExpiryService {

    private static final Logger log = LoggerFactory.getLogger(RequestExpiryService.class);
    static final int SUGGESTIONS = 3;

    private final MentoringRequestRepository requestRepo;
    private final MatchingClient matchingClient;
    private final ProfileClient profileClient;
    private final NotificationService notifications;
    private final TransactionTemplate tx;
    private final Duration expireAfter;

    public RequestExpiryService(MentoringRequestRepository requestRepo, MatchingClient matchingClient, ProfileClient profileClient,
                                NotificationService notifications, TransactionTemplate tx,
                                @Value("${app.requests.expire-after:PT72H}") Duration expireAfter) {
        this.requestRepo = requestRepo;
        this.matchingClient = matchingClient;
        this.profileClient = profileClient;
        this.notifications = notifications;
        this.tx = tx;
        this.expireAfter = expireAfter;
    }

    @Scheduled(fixedDelayString = "${app.requests.expire-interval:PT5M}", initialDelayString = "PT70S")
    public void scheduled() {
        expire(OffsetDateTime.now());
    }

    /** Hết hạn mọi yêu cầu PENDING tạo trước now − 72 giờ; trả về số yêu cầu đã hết hạn. */
    public int expire(OffsetDateTime now) {
        int n = 0;
        for (UUID id : requestRepo.findPendingIdsCreatedBefore(now.minus(expireAfter))) {
            MentoringRequest expired = tx.execute(s -> requestRepo.findForUpdate(id)
                    .filter(r -> r.getStatus() == MentoringRequest.Status.PENDING && r.getCreatedAt().isBefore(now.minus(expireAfter)))
                    .map(r -> {
                        r.expire(now);
                        return r;
                    }).orElse(null));
            if (expired == null) continue; // mentor vừa phản hồi / mentee vừa huỷ
            n++;
            notifyExpired(expired);
        }
        if (n > 0) log.info("Expired {} mentoring requests pending > {}", n, expireAfter);
        return n;
    }

    private void notifyExpired(MentoringRequest r) {
        String mentorName = profileClient.summary(r.getMentorId()).map(ProfileClient.ProfileSummary::displayName).orElse("Mentor");
        List<MatchingClient.SimilarMentor> similar = matchingClient.similarMentors(r.getMenteeId(), r.getMentorId(), SUGGESTIONS);
        notifications.notifyUser(r.getMenteeId(), "REQUEST_EXPIRED", "Yêu cầu mentoring đã hết hạn",
                message(mentorName, expireAfter, similar), "/matching");
        String menteeName = profileClient.summary(r.getMenteeId()).map(ProfileClient.ProfileSummary::displayName).orElse("Một mentee");
        notifications.notifyUser(r.getMentorId(), "REQUEST_EXPIRED", "Yêu cầu mentoring đã hết hạn",
                "Yêu cầu của " + menteeName + " đã hết hạn vì không được phản hồi trong " + expireAfter.toHours() + " giờ.",
                "/mentoring/requests");
    }

    /** Nội dung thông báo cho mentee (hàm thuần để test). */
    static String message(String mentorName, Duration expireAfter, List<MatchingClient.SimilarMentor> similar) {
        String base = mentorName + " chưa phản hồi trong " + expireAfter.toHours()
                + " giờ nên yêu cầu của bạn đã hết hạn. Hãy thử AI Matching để tìm mentor khác.";
        String names = similar.stream().map(MatchingClient.SimilarMentor::fullName)
                .filter(x -> x != null && !x.isBlank()).collect(Collectors.joining(", "));
        return names.isEmpty() ? base : base + " Gợi ý mentor tương tự: " + names + ".";
    }
}
