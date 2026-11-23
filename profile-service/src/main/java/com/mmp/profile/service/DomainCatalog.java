package com.mmp.profile.service;

import java.util.Set;

/** Danh mục lĩnh vực hợp lệ và số lĩnh vực tối đa, dùng chung cho mentor và mentee (khớp DOMAINS ở frontend). */
public final class DomainCatalog {

    private DomainCatalog() {
    }

    public static final Set<String> CODES = Set.of("backend", "frontend", "fullstack", "devops", "data", "mobile");
    /** Mentor và mentee đều tối đa 3 lĩnh vực (mentee: 1 chính + tối đa 2 phụ). */
    public static final int MAX_DOMAINS = 3;
}
