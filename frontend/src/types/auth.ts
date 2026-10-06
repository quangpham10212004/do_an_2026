import type { IsoDateTime, Uuid } from "./common";

// contracts/auth-service.yaml
export type Role = "MENTOR" | "MENTEE" | "ADMIN";
export type AccountStatus = "ACTIVE" | "LOCKED";

export interface AuthResponse {
  userId: Uuid;
  email: string;
  fullName: string | null;
  role: Role;
  emailVerified: boolean;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  referralApplied?: boolean | null;
  emailVerificationToken?: string | null;
}

export interface User {
  id: Uuid;
  email: string;
  fullName: string | null;
  role: Role;
  status: AccountStatus;
  emailVerified: boolean;
  createdAt: IsoDateTime;
}

/** Người dùng đang đăng nhập, lưu trong localStorage cùng cặp token. */
export interface SessionUser {
  userId: Uuid;
  email: string;
  fullName: string | null;
  role: Role;
  emailVerified: boolean;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export interface RegisterInput {
  email: string;
  password: string;
  role: Exclude<Role, "ADMIN">;
  fullName?: string;
  referralCode?: string | null;
}

export interface UserStats {
  total: number;
  mentors: number;
  mentees: number;
}
