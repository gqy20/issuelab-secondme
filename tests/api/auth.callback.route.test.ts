import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockReadJsonSafe } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      upsert: vi.fn(),
    },
  },
  mockReadJsonSafe: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/secondme", () => ({
  readJsonSafe: mockReadJsonSafe,
}));

import { GET } from "@/app/api/auth/callback/route";

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SECONDME_TOKEN_ENDPOINT = "https://oauth.example.com/token";
    process.env.SECONDME_CLIENT_ID = "client-id";
    process.env.SECONDME_CLIENT_SECRET = "client-secret";
    process.env.SECONDME_REDIRECT_URI = "http://localhost/api/auth/callback";
  });

  it("redirects with oauth_denied when provider returns error", async () => {
    const request = new Request("http://localhost/api/auth/callback?error=access_denied");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost/?error=oauth_denied");
  });

  it("redirects with missing_code when code is absent", async () => {
    const request = new Request("http://localhost/api/auth/callback?state=s1");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost/?error=missing_code");
  });

  it("redirects with missing_env when oauth env is incomplete", async () => {
    process.env.SECONDME_TOKEN_ENDPOINT = "";

    const request = new Request("http://localhost/api/auth/callback?code=abc&state=s1");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost/?error=missing_env");
  });

  it("redirects with token_failed when token exchange has no access token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 400 }));
    mockReadJsonSafe.mockResolvedValue({ message: "bad code" });

    const request = new Request("http://localhost/api/auth/callback?code=abc&state=s1", {
      headers: { cookie: "secondme_oauth_state=s1" },
    });
    const response = await GET(request);

    expect(response.headers.get("location")).toContain("/?error=token_failed&reason=bad%20code");
    expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
  });

  it("upserts user and redirects to home on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    mockReadJsonSafe.mockResolvedValue({
      data: {
        access_token: "access-1",
        refresh_token: "refresh-1",
        user_id: "user-1",
        expires_in: 3600,
      },
    });

    const request = new Request("http://localhost/api/auth/callback?code=abc&state=s1", {
      headers: { cookie: "secondme_oauth_state=s1" },
    });
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost/");
    expect(mockPrisma.user.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.upsert.mock.calls[0][0]).toMatchObject({
      where: { secondmeUserId: "user-1" },
      create: {
        secondmeUserId: "user-1",
        accessToken: "access-1",
        refreshToken: "refresh-1",
      },
      update: {
        accessToken: "access-1",
        refreshToken: "refresh-1",
      },
    });

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("secondme_user_id=");
  });
});
