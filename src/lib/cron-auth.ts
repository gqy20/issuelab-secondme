export function assertCronAuth(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing CRON_SECRET");
  }

  const bearer = request.headers.get("authorization")?.trim();
  const header = request.headers.get("x-cron-secret")?.trim();
  if (header === secret) return;
  if (bearer === `Bearer ${secret}`) return;

  throw new Error("Unauthorized cron request");
}
