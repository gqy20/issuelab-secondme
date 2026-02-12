type SecondMeInit = RequestInit & {
  accessToken?: string;
};

export async function secondMeRequest(
  path: string,
  init: SecondMeInit = {},
) {
  const baseUrl = process.env.SECONDME_API_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("Missing SECONDME_API_BASE_URL");
  }

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (init.accessToken) {
    headers.set("Authorization", `Bearer ${init.accessToken}`);
  }

  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function readJsonSafe(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { code: response.status, message: text };
  }
}
