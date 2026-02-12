"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requestApi } from "@/lib/http";

export function LoginButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let active = true;

    const checkAuth = async () => {
      const result = await requestApi<{ nickname?: string }>(
        "/api/user/info",
        { cache: "no-store" },
        8000,
      );
      if (!active) return;
      setLoggedIn(result.code === 0);
      setCheckingAuth(false);
    };

    void checkAuth();
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = () => {
    setLoading(true);
    window.location.assign("/api/auth/login");
  };

  const handleLogout = async () => {
    setLoading(true);
    await requestApi("/api/auth/logout", { method: "POST" }, 8000);
    setLoggedIn(false);
    setLoading(false);
    router.refresh();
  };

  if (checkingAuth) {
    return (
      <div className="text-sm text-[var(--text-muted)]" aria-live="polite">
        正在检查登录状态...
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {loggedIn ? (
        <button
          onClick={handleLogout}
          disabled={loading}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "退出中..." : "退出登录"}
        </button>
      ) : (
        <button
          onClick={handleLogin}
          disabled={loading}
          className="rounded-lg bg-[var(--accent-strong)] px-4 py-2 text-sm font-medium text-white transition-all hover:-translate-y-px hover:shadow-[0_6px_14px_rgba(0,102,204,0.24)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {loading ? "跳转中..." : "使用 SecondMe 登录"}
        </button>
      )}
    </div>
  );
}
