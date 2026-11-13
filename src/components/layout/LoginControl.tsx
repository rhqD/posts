"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CONTROL_BASE, fetchSession, requestCode, signOut, verifyCode, type Session } from "../../lib/control";

// Login lives in the header because it is site-wide, not a viewer feature.
// It renders nothing at all when no control plane is configured, so a plain
// static deployment never shows a dead button.
export default function LoginControl({ color, muted }: { color: string; muted: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!CONTROL_BASE) return;
    const controller = new AbortController();
    fetchSession(controller.signal).then(setSession);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const reset = useCallback(() => {
    setPhase("phone");
    setCode("");
    setNote("");
    setBusy(false);
  }, []);

  if (!CONTROL_BASE) return null;

  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNote("");
    await requestCode(phone.trim());
    // Deliberately the same message whether or not the number is on the list.
    setPhase("code");
    setBusy(false);
    setNote("验证码已发送");
  };

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await verifyCode(phone.trim(), code.trim());
    setBusy(false);
    if (!result) {
      setNote("验证码不正确或已过期");
      return;
    }
    setSession(result);
    setOpen(false);
    reset();
    window.dispatchEvent(new Event("auth-change"));
  };

  const logout = async () => {
    setBusy(true);
    await signOut();
    setSession(null);
    setOpen(false);
    reset();
    window.dispatchEvent(new Event("auth-change"));
  };

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => { setOpen(value => !value); if (open) reset(); }}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap text-xs sm:text-sm"
        style={{ color: session ? color : muted }}
      >
        {session ? session.phone : "登录"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={session ? "账号" : "登录"}
          className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-black/10 dark:border-white/10 bg-white/95 dark:bg-neutral-900/95 backdrop-blur p-3 shadow-xl text-left"
        >
          {session ? (
            <div className="space-y-2">
              <div className="text-xs text-black/60 dark:text-white/60">
                {session.role === "admin" ? "管理员" : "家庭成员"}
              </div>
              <button
                type="button"
                onClick={logout}
                disabled={busy}
                className="w-full rounded-lg border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
              >
                退出登录
              </button>
            </div>
          ) : (
            <form onSubmit={phase === "phone" ? sendCode : submitCode} className="space-y-2">
              <label className="block text-xs text-black/60 dark:text-white/60" htmlFor="login-phone">
                手机号
              </label>
              <input
                ref={inputRef}
                id="login-phone"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                readOnly={phase === "code"}
                placeholder="13800000000"
                className="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-2 py-1.5 text-sm"
              />
              {phase === "code" && (
                <>
                  <label className="block text-xs text-black/60 dark:text-white/60" htmlFor="login-code">
                    验证码
                  </label>
                  <input
                    id="login-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="6 位数字"
                    className="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-2 py-1.5 text-sm"
                  />
                </>
              )}
              <button
                type="submit"
                disabled={busy || phone.trim().length < 5 || (phase === "code" && code.trim().length < 4)}
                className="w-full rounded-lg bg-black dark:bg-white text-white dark:text-black px-2 py-1.5 text-sm disabled:opacity-40"
              >
                {phase === "phone" ? "发送验证码" : "登录"}
              </button>
              {note && <p className="text-xs text-black/50 dark:text-white/50">{note}</p>}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
