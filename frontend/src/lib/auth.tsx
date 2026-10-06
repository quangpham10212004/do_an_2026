"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthResponse, AuthSession, RegisterInput, Role, SessionUser } from "@/types";
import { api, loadSession, saveSession, sessionFromAuthResponse } from "./api";

export interface AuthContextValue {
  /** false cho tới khi đã đọc phiên đăng nhập từ localStorage (tránh chuyển hướng nhầm lúc hydrate). */
  ready: boolean;
  session: AuthSession | null;
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (payload: RegisterInput) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<SessionUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setSession(loadSession());
    sync();
    setReady(true);
    window.addEventListener("mmp-auth-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("mmp-auth-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<AuthResponse>("/api/auth/login", { method: "POST", body: { email, password }, auth: false });
    saveSession(sessionFromAuthResponse(res));
    return res;
  }, []);

  const register = useCallback(async (payload: RegisterInput) => {
    const res = await api<AuthResponse>("/api/auth/register", { method: "POST", body: payload, auth: false });
    saveSession(sessionFromAuthResponse(res));
    return res;
  }, []);

  const logout = useCallback(async () => {
    const current = loadSession();
    if (current?.refreshToken) {
      try {
        await api<null>("/api/auth/logout", { method: "POST", body: { refreshToken: current.refreshToken }, auth: false });
      } catch {
        /* bỏ qua lỗi mạng khi đăng xuất */
      }
    }
    saveSession(null);
  }, []);

  const updateUser = useCallback((patch: Partial<SessionUser>) => {
    const current = loadSession();
    if (current) saveSession({ ...current, user: { ...current.user, ...patch } });
  }, []);

  return (
    <AuthContext.Provider value={{ ready, session, user: session?.user || null, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải được dùng bên trong <AuthProvider>");
  return ctx;
}

export function homePathFor(role: Role): string {
  if (role === "ADMIN") return "/admin";
  return "/dashboard";
}
