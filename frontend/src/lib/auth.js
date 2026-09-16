"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, loadSession, saveSession, sessionFromAuthResponse } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
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

  const login = useCallback(async (email, password) => {
    const res = await api("/api/auth/login", { method: "POST", body: { email, password }, auth: false });
    saveSession(sessionFromAuthResponse(res));
    return res;
  }, []);

  const register = useCallback(async (payload) => {
    const res = await api("/api/auth/register", { method: "POST", body: payload, auth: false });
    saveSession(sessionFromAuthResponse(res));
    return res;
  }, []);

  const logout = useCallback(async () => {
    const current = loadSession();
    if (current?.refreshToken) {
      try {
        await api("/api/auth/logout", { method: "POST", body: { refreshToken: current.refreshToken }, auth: false });
      } catch {
        /* bỏ qua lỗi mạng khi đăng xuất */
      }
    }
    saveSession(null);
  }, []);

  const updateUser = useCallback((patch) => {
    const current = loadSession();
    if (current) saveSession({ ...current, user: { ...current.user, ...patch } });
  }, []);

  return (
    <AuthContext.Provider value={{ ready, session, user: session?.user || null, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function homePathFor(role) {
  if (role === "ADMIN") return "/admin";
  return "/dashboard";
}
