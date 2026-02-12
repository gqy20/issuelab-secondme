"use client";

import { useState } from "react";

export function LoginButton() {
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setLoading(true);
    window.location.href = "/api/auth/login";
  };

  const handleLogout = async () => {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleLogin}
        disabled={loading}
        className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "处理中..." : "使用 SecondMe 登录"}
      </button>
      <button
        onClick={handleLogout}
        disabled={loading}
        className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-[#f7eecf] disabled:cursor-not-allowed disabled:opacity-60"
      >
        退出登录
      </button>
    </div>
  );
}
