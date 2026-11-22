import { api } from "@/lib/api";
import type { AddDomainInput, MentorDomain, MentorDomainsResponse, Uuid } from "@/types";

const domainPath = (id: Uuid, domain?: string) =>
  `/api/profile/mentor/${id}/domains${domain ? `/${encodeURIComponent(domain)}` : ""}`;

export const domainsApi = {
  list: (id: Uuid): Promise<MentorDomainsResponse> => api(domainPath(id)),

  publicList: (id: Uuid, _opts?: { fallbackDomain?: string; self?: boolean }): Promise<MentorDomainsResponse> =>
    api(`${domainPath(id)}/public`, { auth: false }),

  add: (id: Uuid, input: AddDomainInput): Promise<MentorDomain> => {
    const form = new FormData();
    form.append("domain", input.domain);
    if (input.cv) form.append("cv", input.cv);
    return api(domainPath(id), { method: "POST", form });
  },

  setPrimary: (id: Uuid, domain: string): Promise<MentorDomainsResponse> =>
    api(`${domainPath(id, domain)}/primary`, { method: "PUT" }),

  remove: (id: Uuid, domain: string): Promise<MentorDomainsResponse> =>
    api(domainPath(id, domain), { method: "DELETE" }),

  update: (id: Uuid, domain: string, patch: { hourlyRate?: number; accepting?: boolean }): Promise<MentorDomainsResponse> =>
    api(domainPath(id, domain), { method: "PATCH", body: patch }),

  cvs: (id: Uuid): Promise<DomainCv[]> =>
    api<{ cvs: DomainCv[] }>(`/api/profile/mentor/${id}/cvs`).then((result) => result.cvs),

  suggest: (name: string): Promise<void> =>
    api("/api/profile/domains/suggestions", { method: "POST", body: { name } }),
};

export interface DomainExtra { accepting?: boolean; slotsLeft?: number | null; testScore?: number | null }
export type DomainView = MentorDomain & DomainExtra;
export interface DomainCv { name: string; domain: string; note?: string }

export const DOMAIN_BLURB: Record<string, string> = {
  backend: "Spring Boot, thiết kế API, cơ sở dữ liệu",
  frontend: "React, TypeScript, kiểm thử",
  fullstack: "Web đầu cuối, API và giao diện",
  devops: "Docker, CI/CD, cloud",
  data: "SQL, ETL, Spark, Airflow, mô hình",
  mobile: "iOS, Android, đa nền tảng",
};

/** Nội dung 4 phần xác thực cho một lĩnh vực (bước 4 của trang thêm). */
export const VERIFY_PARTS = {
  topics: 5, minutes: 30, passScore: "3,5",
} as const;

/** Đường dẫn luồng xác thực cho một lĩnh vực mới. */
export const interviewHref = (domain: string) => `/interview?domain=${encodeURIComponent(domain)}`;
