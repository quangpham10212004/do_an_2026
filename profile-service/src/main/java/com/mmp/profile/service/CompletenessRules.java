package com.mmp.profile.service;

import java.math.BigDecimal;
import java.util.List;

/**
 * US-37 (PRD-PROF-1) — điểm hoàn thiện hồ sơ 0–100% (hàm thuần để unit test).
 * Mentee: lĩnh vực 15, trình độ 10, ≥ 3 kỹ năng 20, mục tiêu ≥ 80 ký tự 30, CV hoặc portfolio 15, lịch mong muốn 10.
 * Mentor: bio ≥ 150 ký tự 20, ≥ 3 kỹ năng 15, số năm kinh nghiệm 10, lịch rảnh 25, đặt giá 10, portfolio 10, ảnh 10.
 * Nút AI Matching của mentee chỉ bật khi điểm ≥ 50.
 */
public final class CompletenessRules {

    private CompletenessRules() {
    }

    public static final int MENTEE_MATCHING_MIN = 50;
    static final int GOAL_MIN = 80;
    static final int BIO_MIN = 150;
    static final int SKILLS_MIN = 3;

    /** key ổn định cho frontend (link tới đúng ô cần điền), label tiếng Việt, weight = số điểm. */
    public record Item(String key, String label, int weight, boolean done) {
    }

    public record Completeness(int score, List<Item> items) {

        static Completeness of(List<Item> items) {
            return new Completeness(items.stream().filter(Item::done).mapToInt(Item::weight).sum(), items);
        }
    }

    public static Completeness mentee(String domain, String level, int skillCount, String goal, String cvFileUrl,
                                      int portfolioCount, int preferredDayCount, String preferredTimeOfDay) {
        return Completeness.of(List.of(
                new Item("domain", "Lĩnh vực", 15, notBlank(domain)),
                new Item("level", "Trình độ hiện tại", 10, notBlank(level)),
                new Item("skills", "Ít nhất " + SKILLS_MIN + " kỹ năng", 20, skillCount >= SKILLS_MIN),
                new Item("goal", "Mục tiêu từ " + GOAL_MIN + " ký tự", 30, length(goal) >= GOAL_MIN),
                new Item("cvOrPortfolio", "CV hoặc portfolio", 15, notBlank(cvFileUrl) || portfolioCount > 0),
                new Item("schedule", "Lịch học mong muốn", 10, preferredDayCount > 0 || notBlank(preferredTimeOfDay))));
    }

    public static Completeness mentor(String bio, int skillCount, int yearsExperience, int availabilitySlots,
                                      BigDecimal hourlyRate, int portfolioCount, boolean hasAvatar) {
        return Completeness.of(List.of(
                new Item("bio", "Giới thiệu từ " + BIO_MIN + " ký tự", 20, length(bio) >= BIO_MIN),
                new Item("skills", "Ít nhất " + SKILLS_MIN + " kỹ năng", 15, skillCount >= SKILLS_MIN),
                new Item("years", "Số năm kinh nghiệm", 10, yearsExperience > 0),
                new Item("availability", "Lịch rảnh hằng tuần", 25, availabilitySlots > 0),
                new Item("rate", "Giá theo giờ", 10, hourlyRate != null && hourlyRate.signum() > 0),
                new Item("portfolio", "Portfolio", 10, portfolioCount > 0),
                new Item("photo", "Ảnh đại diện", 10, hasAvatar)));
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static int length(String s) {
        return s == null ? 0 : s.strip().length();
    }
}
