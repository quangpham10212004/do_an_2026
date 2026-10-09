"use client";

import type { AuthResponse, AuthSession, ErrorResponse } from "@/types";

const STORAGE_KEY = "mmp.auth";

export function loadSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as AuthSession | null;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession | null): void {
  if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("mmp-auth-changed"));
}

export function sessionFromAuthResponse(res: AuthResponse): AuthSession {
  return {
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    user: {
      userId: res.userId,
      email: res.email,
      fullName: res.fullName,
      role: res.role,
      emailVerified: res.emailVerified,
    },
  };
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshing: Promise<boolean> | null = null;

/** US-39 — đổi token ngay (vd. sau khi xác thực email để access token mang claim ev=true). */
export function refreshSession(): Promise<boolean> {
  return refreshTokens();
}

async function refreshTokens(): Promise<boolean> {
  const session = loadSession();
  if (!session?.refreshToken) return false;
  if (!refreshing) {
    refreshing = fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) {
          saveSession(null);
          return false;
        }
        saveSession(sessionFromAuthResponse((await res.json()) as AuthResponse));
        return true;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiOptions {
  method?: HttpMethod;
  /** Thân JSON (tự gắn Content-Type: application/json). */
  body?: unknown;
  /** Thân multipart (upload file). */
  form?: FormData;
  /** false: không gắn access token (đăng nhập, xác thực email...). */
  auth?: boolean;
  /** Header bổ sung (vd. Idempotency-Key cho POST /api/payment/charge). */
  headers?: Record<string, string>;
}

/** Gửi request kèm access token; nhận 401 thì refresh token 1 lần rồi gửi lại. */
async function send(path: string, options: ApiOptions, retried = false): Promise<Response> {
  const { method = "GET", body, form, auth = true } = options;
  const headers: Record<string, string> = { ...options.headers };
  const session = loadSession();
  if (auth && session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  let payload: BodyInit | undefined;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(path, { method, headers, body: payload });
  if (res.status === 401 && auth && !retried && session?.refreshToken) {
    if (await refreshTokens()) return send(path, options, true);
  }
  return res;
}

async function toApiError(res: Response): Promise<ApiError> {
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  const err = isErrorResponse(data) ? data.error : undefined;
  return new ApiError(res.status, err?.code || `HTTP_${res.status}`, err?.message || "Đã có lỗi xảy ra");
}

/**
 * Gọi API qua proxy của Next.js. Tự gắn access token, tự refresh token 1 lần khi
 * nhận 401, và ném ApiError theo format lỗi chung { error: { code, message } }.
 * `T` là kiểu body thành công (theo contracts/*.yaml); phản hồi 204 (hoặc body rỗng) trả về null —
 * endpoint có thể trả 204 nên khai báo `T | null`.
 */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const res = await send(path, options);
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return null as T;
  const text = await res.text();
  return (text ? safeJson(text) : null) as T;
}

/**
 * Tải file cần xác thực (vd. CV PDF) thành Blob. Link <a href> thường không gửi được header
 * Authorization (token nằm trong localStorage), nên phải tải qua fetch rồi mở bằng object URL.
 */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await send(path, {});
  if (!res.ok) throw await toApiError(res);
  return res.blob();
}

function isErrorResponse(data: unknown): data is ErrorResponse {
  return typeof data === "object" && data !== null && typeof (data as ErrorResponse).error === "object";
}

/** Thông điệp hiển thị cho lỗi bất kỳ bị bắt trong `catch` (kiểu `unknown`). */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Đã có lỗi xảy ra";
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
