export type ApiEnvelope<T> = {
  code: number;
  data?: T;
  message?: string;
};

export type ApiResult<T> = ApiEnvelope<T> & {
  status: number;
  ok: boolean;
};

export async function requestApi<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 12000,
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();

    if (!text) {
      return {
        code: response.ok ? 0 : response.status,
        status: response.status,
        ok: response.ok,
        message: response.ok ? undefined : `请求失败（${response.status}）`,
      };
    }

    try {
      const parsed = JSON.parse(text) as ApiEnvelope<T>;
      return {
        ...parsed,
        status: response.status,
        ok: response.ok,
        code: typeof parsed.code === "number" ? parsed.code : response.status,
      };
    } catch {
      return {
        code: response.status,
        status: response.status,
        ok: false,
        message: "服务响应格式异常",
      };
    }
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return {
      code: -1,
      status: 0,
      ok: false,
      message: isTimeout ? "请求超时，请稍后重试" : "网络请求失败，请稍后重试",
    };
  } finally {
    clearTimeout(timer);
  }
}
