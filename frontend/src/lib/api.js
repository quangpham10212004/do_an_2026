"use client";

const STORAGE_KEY = "mmp.auth";

export function loadSession() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveSession(session) {
  if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("mmp-auth-changed"));
}

export function sessionFromAuthResponse(res) {
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
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshing = null;

async function refreshTokens() {
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
        saveSession(sessionFromAuthResponse(await res.json()));
        return true;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

/**
 * Gọi API qua proxy của Next.js. Tự gắn access token, tự refresh token 1 lần khi
 * nhận 401, và ném ApiError theo format lỗi chung { error: { code, message } }.
 */
export async function api(path, { method = "GET", body, form, auth = true, raw = false } = {}, retried = false) {
  const headers = {};
  const session = loadSession();
  if (auth && session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(path, { method, headers, body: payload });
  if (res.status === 401 && auth && !retried && session?.refreshToken) {
    if (await refreshTokens()) return api(path, { method, body, form, auth, raw }, true);
  }
  if (raw) return res;
  if (res.status === 204) return null;
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = data?.error || {};
    throw new ApiError(res.status, err.code || `HTTP_${res.status}`, err.message || "Đã có lỗi xảy ra");
  }
  return data;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
