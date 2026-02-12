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
      <div className="text-sm text-slate-500" aria-live="polite">
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
          className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-[#f7eecf] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "退出中..." : "退出登录"}
        </button>
      ) : (
        <button
          onClick={handleLogin}
          disabled={loading}
          className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "跳转中..." : "使用 SecondMe 登录"}
        </button>
      )}
    </div>
  );
}
