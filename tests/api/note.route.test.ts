import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_COOKIE, AUTH_USER_COOKIE } from "@/lib/auth";

const {
  mockPrisma,
  mockSecondMeRequest,
  mockReadJsonSafe,
} = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
    userNote: {
      create: vi.fn(),
    },
  },
  mockSecondMeRequest: vi.fn(),
  mockReadJsonSafe: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/secondme", () => ({
  secondMeRequest: mockSecondMeRequest,
  readJsonSafe: mockReadJsonSafe,
}));

import { POST } from "@/app/api/note/route";

function makeAuthedRequest(body: unknown) {
  return new Request("http://localhost/api/note", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `${AUTH_USER_COOKIE}=u-1; ${AUTH_TOKEN_COOKIE}=t-1`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/note", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not logged in", async () => {
    const request = new Request("http://localhost/api/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 401 });
  });

  it("returns 400 when content is empty", async () => {
    const response = await POST(makeAuthedRequest({ content: "   " }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 400 });
  });

  it("returns 404 when user does not exist", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await POST(makeAuthedRequest({ content: "note" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 404 });
  });

  it("falls back to local save when upstream note service fails", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "db-user-1" });
    mockSecondMeRequest.mockResolvedValue(new Response("upstream down", { status: 503 }));
    mockReadJsonSafe.mockResolvedValue({ code: 503, message: "upstream down" });
    mockPrisma.userNote.create.mockResolvedValue({ id: "note-1" });

    const response = await POST(makeAuthedRequest({ content: "save this" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ code: 0, data: { saved: true, source: "local" } });
    expect(mockPrisma.userNote.create).toHaveBeenCalledWith({
      data: { userId: "db-user-1", content: "save this" },
    });
  });

  it("returns upstream payload when upstream succeeds", async () => {
    const upstreamPayload = { code: 0, data: { saved: true, note_id: "n1" } };

    mockPrisma.user.findUnique.mockResolvedValue({ id: "db-user-2" });
    mockSecondMeRequest.mockResolvedValue(new Response(JSON.stringify(upstreamPayload), { status: 200 }));
    mockReadJsonSafe.mockResolvedValue(upstreamPayload);
    mockPrisma.userNote.create.mockResolvedValue({ id: "note-2" });

    const response = await POST(makeAuthedRequest({ content: "ok" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(upstreamPayload);
  });
});
