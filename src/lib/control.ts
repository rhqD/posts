// Client helpers for the household control service.
//
// Everything is optional: with NEXT_PUBLIC_YARD_API unset the whole surface
// disappears and the site behaves exactly as a plain static export.

export const CONTROL_BASE = (process.env.NEXT_PUBLIC_YARD_API ?? "").replace(/\/$/, "");

export type Session = { id: string; phone: string; name: string; role: string; avatar?: string; activated_at?: string | null; capabilities?: Partial<Record<"users"|"devices"|"permissions"|"audit", boolean>> };

export function userName(user?: { name?: string } | null): string {
  return user?.name?.trim() || "未设置姓名";
}

/** Every control API write uses the same browser CSRF protection contract. */
export function controlWrite(path: string, body?: unknown, method = "POST"): Promise<Response> {
  return fetch(CONTROL_BASE + path, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Protection": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function fetchSession(signal?: AbortSignal): Promise<Session | null> {
  if (!CONTROL_BASE) return null;
  try {
    const res = await fetch(CONTROL_BASE + "/auth/me", {
      credentials: "include",
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as Session;
  } catch {
    return null;
  }
}

/**
 * Rejects transport and HTTP failures. Successful responses remain identical
 * for known and unknown numbers, matching the server's privacy contract.
 */
export async function requestCode(phone: string): Promise<void> {
  if (!CONTROL_BASE) throw new Error("登录服务暂不可用，请稍后重试");
  let res: Response;
  try {
    res = await controlWrite("/auth/sms/send", { phone });
  } catch {
    throw new Error("无法连接登录服务，请检查网络后重试");
  }
  if (!res.ok) throw new Error("验证码请求失败，请稍后重试");
}

/** Returns the session on success, null when the code was rejected. */
export async function verifyCode(phone: string, code: string): Promise<Session | null> {
  if (!CONTROL_BASE) return null;
  try {
    const res = await controlWrite("/auth/sms/verify", { phone, code });
    if (!res.ok) return null;
    return (await res.json()) as Session;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  if (!CONTROL_BASE) return;
  const res = await controlWrite("/auth/logout");
  if (!res.ok) throw new Error("logout_failed");
}
