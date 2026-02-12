import { describe, expect, it } from "vitest";
import {
  AUTH_TOKEN_COOKIE,
  AUTH_USER_COOKIE,
  clearAuthCookies,
  clearOauthStateCookie,
  getSessionFromRequest,
  readOauthStateFromRequest,
  setAuthCookies,
  setOauthStateCookie,
} from "@/lib/auth";

type CookieCall = { key: string; value?: string; options?: Record<string, unknown> };

type MockResponse = {
  cookies: {
    set: (key: string, value: string, options: Record<string, unknown>) => void;
    delete: (key: string) => void;
  };
  calls: {
    set: CookieCall[];
    delete: CookieCall[];
  };
};

function createMockResponse(): MockResponse {
  const calls = { set: [] as CookieCall[], delete: [] as CookieCall[] };
  return {
    calls,
    cookies: {
      set: (key, value, options) => calls.set.push({ key, value, options }),
      delete: (key) => calls.delete.push({ key }),
    },
  };
}

describe("auth utilities", () => {
  it("reads user session from cookies", () => {
    const request = new Request("http://localhost", {
      headers: {
        cookie: `${AUTH_USER_COOKIE}=user-1; ${AUTH_TOKEN_COOKIE}=token-1`,
      },
    });

    expect(getSessionFromRequest(request)).toEqual({
      userId: "user-1",
      accessToken: "token-1",
    });
  });

  it("decodes encoded cookie values", () => {
    const request = new Request("http://localhost", {
      headers: {
        cookie: `${AUTH_USER_COOKIE}=user%20name; ${AUTH_TOKEN_COOKIE}=token%2Fabc`,
      },
    });

    expect(getSessionFromRequest(request)).toEqual({
      userId: "user name",
      accessToken: "token/abc",
    });
  });

  it("reads oauth state cookie", () => {
    const request = new Request("http://localhost", {
      headers: { cookie: "secondme_oauth_state=state-123" },
    });

    expect(readOauthStateFromRequest(request)).toBe("state-123");
  });

  it("sets auth cookies with expected options", () => {
    const response = createMockResponse();
    setAuthCookies(response as never, { userId: "u1", accessToken: "a1" });

    expect(response.calls.set).toHaveLength(2);
    expect(response.calls.set[0]).toMatchObject({ key: AUTH_USER_COOKIE, value: "u1" });
    expect(response.calls.set[1]).toMatchObject({ key: AUTH_TOKEN_COOKIE, value: "a1" });
    expect(response.calls.set[0].options?.path).toBe("/");
    expect(response.calls.set[1].options?.httpOnly).toBe(true);
  });

  it("sets and clears oauth state cookie", () => {
    const response = createMockResponse();
    setOauthStateCookie(response as never, "state-abc");
    clearOauthStateCookie(response as never);

    expect(response.calls.set[0]).toMatchObject({ key: "secondme_oauth_state", value: "state-abc" });
    expect(response.calls.delete[0]).toMatchObject({ key: "secondme_oauth_state" });
  });

  it("clears auth cookies", () => {
    const response = createMockResponse();
    clearAuthCookies(response as never);

    expect(response.calls.delete).toEqual([
      { key: AUTH_USER_COOKIE },
      { key: AUTH_TOKEN_COOKIE },
    ]);
  });
});
