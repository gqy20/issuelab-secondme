import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readJsonSafe, secondMeRequest } from "@/lib/secondme";

describe("secondme utilities", () => {
  const originalEnv = process.env.SECONDME_API_BASE_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SECONDME_API_BASE_URL = "https://api.example.com";
  });

  afterEach(() => {
    process.env.SECONDME_API_BASE_URL = originalEnv;
  });

  it("throws when SECONDME_API_BASE_URL is missing", async () => {
    process.env.SECONDME_API_BASE_URL = "";
    await expect(secondMeRequest("/x")).rejects.toThrow("Missing SECONDME_API_BASE_URL");
  });

  it("adds headers and forwards request", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await secondMeRequest("/api/secondme/user/info", {
      method: "GET",
      accessToken: "token-123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/api/secondme/user/info");

    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer token-123");
  });

  it("readJsonSafe returns null on empty body", async () => {
    const response = new Response(null, { status: 204 });
    await expect(readJsonSafe(response)).resolves.toBeNull();
  });

  it("readJsonSafe parses JSON body", async () => {
    const response = new Response('{"code":0,"data":{"ok":true}}', { status: 200 });
    await expect(readJsonSafe(response)).resolves.toEqual({ code: 0, data: { ok: true } });
  });

  it("readJsonSafe falls back to raw message when JSON parse fails", async () => {
    const response = new Response("upstream failure", { status: 502 });
    await expect(readJsonSafe(response)).resolves.toEqual({
      code: 502,
      message: "upstream failure",
    });
  });
});
