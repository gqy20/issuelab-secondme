"use client";

import { useEffect, useState } from "react";
import { requestApi } from "@/lib/http";

type UserInfoData = { nickname?: string; bio?: string };
type ShadesData = { shades?: string[] };

export function UserProfile() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState("未登录");
  const [bio, setBio] = useState("登录后可查看 SecondMe 用户信息");
  const [shades, setShades] = useState<string[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        const [info, shadesResult] = await Promise.all([
          requestApi<UserInfoData>("/api/user/info", { cache: "no-store" }),
          requestApi<ShadesData>("/api/user/shades", { cache: "no-store" }),
        ]);

        if (info.code !== 0) {
          setError(info.message ?? "用户信息读取失败");
          return;
        }

        setNickname(info.data?.nickname ?? "SecondMe 用户");
        setBio(info.data?.bio ?? "暂无简介");
        setShades(
          Array.isArray(shadesResult.data?.shades) ? shadesResult.data?.shades ?? [] : [],
        );
      } catch (error) {
        console.error("Load user profile failed", error);
        setError("服务请求失败");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-500">正在加载用户信息...</p>;
  }

  if (error) {
    return <p className="text-sm text-amber-700">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{nickname}</h2>
        <p className="mt-1 text-sm text-slate-600">{bio}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">兴趣标签</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {shades.length === 0 ? (
            <span className="text-sm text-slate-500">暂无标签</span>
          ) : (
            shades.map((item) => (
              <span
                key={item}
                className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs text-[var(--accent)]"
              >
                {item}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
