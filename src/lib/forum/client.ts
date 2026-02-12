type JsonRecord = Record<string, unknown>;

export type ForumComment = {
  id: string;
  threadId: string;
  authorId?: string;
  content: string;
  createdAt?: string;
};

function getEnv(name: string, optional = false) {
  const value = process.env[name]?.trim();
  if (!value && !optional) {
    throw new Error(`Missing ${name}`);
  }
  return value ?? "";
}

function asObject(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function getCommentsFromPayload(payload: unknown): ForumComment[] {
  const root = asObject(payload);
  if (!root) return [];

  const dataObj = asObject(root.data);
  const rawComments =
    (Array.isArray(dataObj?.comments) ? dataObj?.comments : null) ??
    (Array.isArray(root.comments) ? root.comments : null) ??
    [];

  return rawComments.reduce<ForumComment[]>((acc, item) => {
    const obj = asObject(item);
    if (!obj) return acc;

    const id = asString(obj.id || obj.commentId);
    const threadId = asString(obj.threadId || obj.topicId || obj.postId);
    const content = asString(obj.content || obj.body || obj.text);
    if (!id || !threadId || !content) return acc;

    const authorId = asString(obj.authorId || obj.userId) || undefined;
    const createdAt = asString(obj.createdAt || obj.created_at) || undefined;
    acc.push({ id, threadId, content, authorId, createdAt });
    return acc;
  }, []);
}

export class ForumClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly listPath: string;
  private readonly replyPath: string;

  constructor() {
    this.baseUrl = getEnv("FORUM_API_BASE_URL");
    this.token = getEnv("FORUM_API_TOKEN");
    this.listPath = getEnv("FORUM_LIST_PATH", true) || "/mentions";
    this.replyPath = getEnv("FORUM_REPLY_PATH", true) || "/replies";
  }

  async listMentions(sinceIso: string, mentionTarget: string) {
    const url = new URL(`${this.baseUrl}${this.listPath}`);
    url.searchParams.set("since", sinceIso);
    url.searchParams.set("mention", mentionTarget);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const payload = await readJson(response);
    if (!response.ok) {
      throw new Error(`Forum list failed: ${response.status}`);
    }

    return getCommentsFromPayload(payload);
  }

  async reply(params: { threadId: string; commentId: string; content: string }) {
    const response = await fetch(`${this.baseUrl}${this.replyPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        threadId: params.threadId,
        commentId: params.commentId,
        content: params.content,
      }),
      cache: "no-store",
    });

    const payload = await readJson(response);
    if (!response.ok) {
      throw new Error(`Forum reply failed: ${response.status}`);
    }
    return payload;
  }
}
