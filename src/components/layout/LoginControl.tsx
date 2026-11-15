"use client";

import Link from "next/link";
import { Avatar, AvatarEditor } from "../account/Avatar";
import { canManage, managementRequest } from "../../lib/manage";
import styles from "../account/account.module.css";
import { ChevronRight, LogOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CONTROL_BASE, fetchSession, requestCode, signOut, userName, verifyCode, type Session } from "../../lib/control";

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
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!CONTROL_BASE) return;
    let controller: AbortController;
    const reload=()=>{controller?.abort();controller=new AbortController();fetchSession(controller.signal).then(setSession);};
    const openLogin=()=>{setOpen(true);};
    reload();window.addEventListener('auth-change',reload);window.addEventListener('auth-open',openLogin);
    return ()=>{controller?.abort();window.removeEventListener('auth-change',reload);window.removeEventListener('auth-open',openLogin);};
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
    setEditingName(false);
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
    setNote("");
    try {
      await signOut();
      setSession(null);
      setOpen(false);
      reset();
      window.dispatchEvent(new Event("auth-change"));
    } catch {
      setNote("退出未成功，请重试");
    } finally {
      setBusy(false);
    }
  };

  const saveName = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setNote("");
    try {
      const updated = await managementRequest<Session>("/auth/profile", { name: name.trim() }, "PATCH");
      setSession(updated); setEditingName(false);
      window.dispatchEvent(new Event("auth-change"));
    } catch (error) {
      setNote(error instanceof Error ? error.message : "姓名保存失败，请重试。");
    } finally { setBusy(false); }
  };

  return (
    <div ref={boxRef} className={styles.root}>
      <button
        type="button"
        onClick={() => { setOpen(value => !value); if (open) reset(); }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={session ? `${userName(session)}，账号菜单` : "登录"}
        className={styles.trigger}
        style={{ color: session ? color : muted }}
      >
        {session ? <><Avatar name={userName(session)} src={session.avatar} size={24}/><span className={styles.triggerName}>{userName(session)}</span></> : "登录"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={session ? "账号" : "登录"}
          className={styles.popover}
        >
          {session ? (
            <div className={styles.account}>
              <div className={styles.identity}><strong>{userName(session)}</strong><span>{canManage(session.capabilities) ? "已授予管理权限" : "内置用户"}</span></div>
              <AvatarEditor name={userName(session)} value={session.avatar||''} compact disabled={busy} onChange={async avatar=>{const updated=await managementRequest<Session>('/auth/profile',{avatar},'PATCH');setSession(updated);window.dispatchEvent(new Event('auth-change'));}}/>
              {editingName ? <form className={styles.nameForm} onSubmit={saveName}>
                <label>姓名<input required maxLength={40} value={name} onChange={e=>setName(e.target.value)} autoComplete="name" autoFocus disabled={busy}/></label>
                <div className={styles.nameActions}><button type="button" className={styles.quietButton} disabled={busy} onClick={()=>{setEditingName(false);setNote("");}}>取消</button><button type="submit" className={styles.smallButton} disabled={busy||!name.trim()}>{busy?"保存中…":"保存姓名"}</button></div>
              </form> : <button type="button" className={styles.action} onClick={()=>{setName(session.name||"");setEditingName(true);setNote("");}}>编辑姓名<ChevronRight size={15}/></button>}
              <div className={styles.actions}>
              {canManage(session.capabilities)&&<Link href="/manage/" onClick={()=>setOpen(false)} className={styles.action}>管理控制台<ChevronRight size={15}/></Link>}
              <button
                type="button"
                onClick={logout}
                disabled={busy}
                className={styles.action}
              >
                退出登录<LogOut size={15}/>
              </button>
              </div>
              {note && <p role="alert" className={styles.error}>{note}</p>}
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
