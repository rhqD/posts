// Client helpers for the household control service.
//
// Everything is optional: with NEXT_PUBLIC_YARD_API unset the whole surface
// disappears and the site behaves exactly as a plain static export.

export const CONTROL_BASE = (process.env.NEXT_PUBLIC_YARD_API ?? "").replace(/\/$/, "");

export type Session = { id: string; phone: string; name: string; role: string };

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
 * Always resolves. The server answers identically for known and unknown
 * numbers, so the UI must not leak a different signal.
 */
export async function requestCode(phone: string): Promise<void> {
  if (!CONTROL_BASE) return;
  try {
    await fetch(CONTROL_BASE + "/auth/sms/send", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
  } catch {
    // Offline is indistinguishable from "sent" on purpose.
  }
}

/** Returns the session on success, null when the code was rejected. */
export async function verifyCode(phone: string, code: string): Promise<Session | null> {
  if (!CONTROL_BASE) return null;
  try {
    const res = await fetch(CONTROL_BASE + "/auth/sms/verify", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code }),
    });
    if (!res.ok) return null;
    return (await res.json()) as Session;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  if (!CONTROL_BASE) return;
  try {
    await fetch(CONTROL_BASE + "/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    // The cookie is HttpOnly; if the call fails the session simply expires.
  }
}
