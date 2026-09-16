package com.mmp.mentoring.client;

import java.util.List;

/**
 * Hợp đồng dữ liệu với ai-service (xem contracts/ai-service.yaml). JSON camelCase.
 * Trường engine: engine được chọn (DEEPSEEK | RULE_BASED); fallbackUsed: lượt này DeepSeek lỗi và
 * kết quả do engine rule-based tạo ra.
 */
public final class AiModels {

    private AiModels() {
    }

    // ---------- AI Interview ----------

    public record InterviewContext(String domain, List<String> skills, int yearsExperience, String bio, int maxTurns) {
    }

    public record TurnRecord(int turnNo, String topic, String strategy, String question, String answer, Float score) {
    }

    public record QuestionPlan(String topic, String strategy, String question) {
    }

    public record QuestionResult(String topic, String strategy, String question, String engine, boolean fallbackUsed) {
    }

    public record EvaluationResult(float score, String feedback, QuestionPlan next, String engine, boolean fallbackUsed) {
    }

    public record AssessmentResult(float overallScore, String summary, List<String> strengths, List<String> weaknesses,
                                   String recommendation, String engine, boolean fallbackUsed) {
    }

    // ---------- CV + enrichment ----------

    public record Project(String name, String description, List<String> technologies) {
    }

    public record ParsedCv(String currentRole, List<String> skills, Integer yearsExperience, List<Project> projects,
                           List<String> education, String summary) {
        public ParsedCv {
            skills = skills == null ? List.of() : skills;
            projects = projects == null ? List.of() : projects;
            education = education == null ? List.of() : education;
        }
    }

    public record CvParseResult(String rawText, ParsedCv parsed, String engine, boolean fallbackUsed) {
    }

    public record MenteeContext(String domain, String currentLevel, String currentGoal, ParsedCv cv, int maxTurns) {
    }

    public record Exchange(int turnNo, String slot, String question, String answer) {
    }

    public record NextQuestionResult(String slot, String slotLabel, String question, String engine, boolean fallbackUsed) {
    }

    public record GoalResult(String enrichedGoal, String engine, boolean fallbackUsed) {
    }
}
