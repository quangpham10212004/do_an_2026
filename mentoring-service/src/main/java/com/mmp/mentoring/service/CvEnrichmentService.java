package com.mmp.mentoring.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mmp.mentoring.client.AiClient;
import com.mmp.mentoring.client.AiModels.*;
import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.entity.CvDocument;
import com.mmp.mentoring.entity.EnrichmentConversation;
import com.mmp.mentoring.entity.EnrichmentMessage;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.CvDocumentRepository;
import com.mmp.mentoring.repository.EnrichmentConversationRepository;
import com.mmp.mentoring.repository.EnrichmentMessageRepository;
import com.mmp.mentoring.security.AuthUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * CV Parsing + Chatbot enrichment (FR-8.1 → FR-8.5).
 *
 * upload CV (PDF) → ai-service trích xuất text + parse có cấu trúc → mở hội thoại
 * {maxTurns} lượt, câu hỏi dựa trên CV (ai-service) → tổng hợp goal → gửi sang profile-service
 * (cập nhật goal, gộp kỹ năng từ CV, sinh lại embedding). Service này lưu file, CV và hội thoại.
 */
@Service
public class CvEnrichmentService {

    private static final Logger log = LoggerFactory.getLogger(CvEnrichmentService.class);

    /** Nhãn hiển thị của các slot chatbot (khớp SLOT_LABELS trong ai-service). */
    static final java.util.Map<String, String> SLOT_LABELS = java.util.Map.of(
            "TARGET_ROLE", "Mục tiêu nghề nghiệp",
            "FOCUS_AREAS", "Mảng muốn tập trung",
            "PROJECT_EXPERIENCE", "Kinh nghiệm thực hành",
            "CURRENT_GAPS", "Khó khăn hiện tại",
            "TIMELINE", "Thời gian mong muốn",
            "MENTORING_PREFERENCE", "Mong muốn về mentoring",
            "FREE_FORM", "Khác");

    private final CvStorage storage;
    private final CvDocumentRepository cvRepo;
    private final EnrichmentConversationRepository conversationRepo;
    private final EnrichmentMessageRepository messageRepo;
    private final ProfileClient profileClient;
    private final NotificationService notifications;
    private final AiClient aiClient;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;
    private final int maxTurns;

    public CvEnrichmentService(CvStorage storage, CvDocumentRepository cvRepo,
                               EnrichmentConversationRepository conversationRepo, EnrichmentMessageRepository messageRepo,
                               ProfileClient profileClient, NotificationService notifications, AiClient aiClient,
                               ObjectMapper objectMapper, TransactionTemplate tx,
                               @Value("${app.enrichment.max-turns}") int maxTurns) {
        this.storage = storage;
        this.cvRepo = cvRepo;
        this.conversationRepo = conversationRepo;
        this.messageRepo = messageRepo;
        this.profileClient = profileClient;
        this.notifications = notifications;
        this.aiClient = aiClient;
        this.objectMapper = objectMapper;
        this.tx = tx;
        this.maxTurns = maxTurns;
    }

    /** FR-8.1 + FR-8.2 — upload & parse CV (dùng chung cho mentor để điền nhanh hồ sơ). */
    public CvView parseAndStore(AuthUser user, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("FILE_REQUIRED", "Vui lòng chọn file CV");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw ApiException.badRequest("INVALID_FILE", "Không đọc được file tải lên");
        }
        String fileName = file.getOriginalFilename() == null ? "cv.pdf" : file.getOriginalFilename();
        CvParseResult result = aiClient.parseCv(bytes, fileName); // ném lỗi 4xx (INVALID_FILE_TYPE, CV_NO_TEXT...) nếu file không hợp lệ
        String path = storage.save(user.userId(), bytes);
        CvDocument doc = tx.execute(s -> cvRepo.save(new CvDocument(user.userId(), fileName, path, result.rawText(),
                toJson(result.parsed()), result.engine())));
        return new CvView(doc.getId(), doc.getFileName(), doc.getEngine(), result.parsed(), doc.getCreatedAt());
    }

    /** FR-8.1 → FR-8.3 — mentee upload CV và bắt đầu chatbot enrichment. */
    public CvUploadResult uploadForMentee(AuthUser mentee, UUID menteeId, MultipartFile file) {
        if (!mentee.isAdmin() && !mentee.userId().equals(menteeId)) {
            throw ApiException.forbidden("Bạn chỉ có thể tải CV cho chính mình");
        }
        ProfileClient.MenteeInfo profile = profileClient.findMentee(menteeId)
                .orElseThrow(() -> ApiException.badRequest("PROFILE_REQUIRED", "Hãy tạo hồ sơ nghề nghiệp (lĩnh vực, mục tiêu) trước khi tải CV"));
        CvView cv = parseAndStore(new AuthUser(menteeId, mentee.email(), "MENTEE"), file);

        MenteeContext ctx = new MenteeContext(profile.domain(), profile.currentLevel(), profile.goal(), cv.parsed(), maxTurns);
        NextQuestionResult first = aiClient.nextEnrichmentQuestion(ctx, List.of(), cv.engine());
        EnrichmentConversation conv = tx.execute(s -> {
            EnrichmentConversation c = conversationRepo.save(new EnrichmentConversation(menteeId, cv.id(), maxTurns, first.engine()));
            messageRepo.save(new EnrichmentMessage(c.getId(), 1, first.slot(), first.question()));
            return c;
        });
        return new CvUploadResult(cv, view(conv));
    }

    /** FR-8.3 → FR-8.5 — mentee trả lời; sau lượt cuối tổng hợp goal và cập nhật profile. */
    public ConversationView answer(AuthUser mentee, UUID conversationId, String answer) {
        EnrichmentConversation conv = find(conversationId);
        if (!conv.getMenteeId().equals(mentee.userId())) {
            throw ApiException.forbidden("Đây không phải hội thoại của bạn");
        }
        if (conv.getStatus() != EnrichmentConversation.Status.IN_PROGRESS) {
            throw ApiException.conflict("CONVERSATION_COMPLETED", "Hội thoại đã kết thúc");
        }
        List<EnrichmentMessage> messages = messageRepo.findByConversationIdOrderByTurnNoAsc(conversationId);
        EnrichmentMessage current = messages.stream().filter(m -> m.getAnswer() == null).findFirst()
                .orElseThrow(() -> ApiException.conflict("NO_OPEN_QUESTION", "Không có câu hỏi đang chờ trả lời"));

        ProfileClient.MenteeInfo profile = profileClient.findMentee(conv.getMenteeId())
                .orElseThrow(() -> ApiException.notFound("PROFILE_NOT_FOUND", "Không tìm thấy hồ sơ mentee"));
        ParsedCv cv = fromJson(cvRepo.findById(conv.getCvId()).orElseThrow().getParsedJson());
        MenteeContext ctx = new MenteeContext(profile.domain(), profile.currentLevel(), profile.goal(), cv, conv.getMaxTurns());

        List<Exchange> history = new java.util.ArrayList<>(messages.stream().filter(m -> m.getAnswer() != null)
                .map(m -> new Exchange(m.getTurnNo(), m.getSlot(), m.getQuestion(), m.getAnswer())).toList());
        history.add(new Exchange(current.getTurnNo(), current.getSlot(), current.getQuestion(), answer.trim()));

        boolean isLast = current.getTurnNo() >= conv.getMaxTurns();
        NextQuestionResult next = isLast ? null : aiClient.nextEnrichmentQuestion(ctx, history, conv.getEngine());
        String goal = isLast ? aiClient.summarizeGoal(ctx, history, conv.getEngine()).enrichedGoal() : null;

        EnrichmentConversation updated = tx.execute(s -> {
            EnrichmentConversation c = find(conversationId);
            EnrichmentMessage m = messageRepo.findById(current.getId()).orElseThrow();
            if (m.getAnswer() != null) {
                throw ApiException.conflict("ALREADY_ANSWERED", "Câu hỏi này đã được trả lời");
            }
            m.setAnswer(answer.trim());
            m.setAnsweredAt(OffsetDateTime.now());
            if (isLast) {
                c.setStatus(EnrichmentConversation.Status.COMPLETED);
                c.setEnrichedGoal(goal);
                c.setCompletedAt(OffsetDateTime.now());
            } else {
                c.setCurrentTurn(m.getTurnNo() + 1);
                messageRepo.save(new EnrichmentMessage(c.getId(), m.getTurnNo() + 1, next.slot(), next.question()));
            }
            return c;
        });
        if (isLast) {
            syncProfile(updated.getId());
        }
        return view(find(conversationId));
    }

    /** Gửi goal đã tổng hợp sang profile-service; lỗi sẽ được job thử lại. */
    public void syncProfile(UUID conversationId) {
        EnrichmentConversation conv = find(conversationId);
        CvDocument cv = cvRepo.findById(conv.getCvId()).orElseThrow();
        try {
            profileClient.applyEnrichment(conv.getMenteeId(), conv.getEnrichedGoal(), fromJson(cv.getParsedJson()).skills(),
                    "/api/mentoring/cv/" + cv.getId() + "/file");
            tx.executeWithoutResult(s -> find(conversationId).setProfileSynced(true));
            notifications.notifyUser(conv.getMenteeId(), "PROFILE_ENRICHED", "Hồ sơ đã được cập nhật",
                    "Mục tiêu học tập của bạn đã được làm rõ. Hãy thử tìm mentor phù hợp ngay!", "/matching");
        } catch (Exception e) {
            log.warn("Could not sync enrichment {} to profile-service: {}", conversationId, e.getMessage());
        }
    }

    @Scheduled(fixedDelay = 120_000, initialDelay = 60_000)
    public void retryProfileSync() {
        conversationRepo.findByStatusAndProfileSyncedFalse(EnrichmentConversation.Status.COMPLETED)
                .forEach(c -> syncProfile(c.getId()));
    }

    public ConversationView get(AuthUser user, UUID conversationId) {
        EnrichmentConversation c = find(conversationId);
        if (!user.isAdmin() && !c.getMenteeId().equals(user.userId())) {
            throw ApiException.forbidden("Bạn không có quyền xem hội thoại này");
        }
        return view(c);
    }

    public java.util.Optional<CvUploadResult> latest(AuthUser user, UUID menteeId) {
        if (!user.isAdmin() && !user.userId().equals(menteeId)) {
            throw ApiException.forbidden("Bạn không có quyền xem dữ liệu này");
        }
        return conversationRepo.findFirstByMenteeIdOrderByCreatedAtDesc(menteeId).map(c -> {
            CvDocument doc = cvRepo.findById(c.getCvId()).orElseThrow();
            return new CvUploadResult(new CvView(doc.getId(), doc.getFileName(), doc.getEngine(), fromJson(doc.getParsedJson()),
                    doc.getCreatedAt()), view(c));
        });
    }

    public CvDocument cvFile(AuthUser user, UUID cvId) {
        CvDocument doc = cvRepo.findById(cvId).orElseThrow(() -> ApiException.notFound("CV_NOT_FOUND", "Không tìm thấy CV"));
        // Chủ CV, admin, hoặc mentor (xem CV mentee khi xét yêu cầu mentoring) được tải
        if (!user.isAdmin() && !doc.getUserId().equals(user.userId()) && !"MENTOR".equals(user.role())) {
            throw ApiException.forbidden("Bạn không có quyền tải CV này");
        }
        return doc;
    }

    public byte[] readFile(CvDocument doc) {
        return storage.read(doc.getStoragePath());
    }

    private ConversationView view(EnrichmentConversation c) {
        List<EnrichmentMessageView> messages = messageRepo.findByConversationIdOrderByTurnNoAsc(c.getId()).stream()
                .map(m -> new EnrichmentMessageView(m.getTurnNo(), m.getSlot(), SLOT_LABELS.getOrDefault(m.getSlot(), "Khác"), m.getQuestion(), m.getAnswer()))
                .toList();
        EnrichmentMessageView current = c.getStatus() == EnrichmentConversation.Status.IN_PROGRESS
                ? messages.stream().filter(m -> m.answer() == null).findFirst().orElse(null) : null;
        return new ConversationView(c.getId(), c.getMenteeId(), c.getCvId(), c.getStatus().name(), c.getEngine(), c.getMaxTurns(),
                c.getCurrentTurn(), current, messages, c.getEnrichedGoal(), c.isProfileSynced(), c.getCreatedAt(), c.getCompletedAt());
    }

    private EnrichmentConversation find(UUID id) {
        return conversationRepo.findById(id).orElseThrow(() -> ApiException.notFound("CONVERSATION_NOT_FOUND", "Không tìm thấy hội thoại"));
    }

    private String toJson(ParsedCv cv) {
        try {
            return objectMapper.writeValueAsString(cv);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private ParsedCv fromJson(String json) {
        try {
            return objectMapper.readValue(json, ParsedCv.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
