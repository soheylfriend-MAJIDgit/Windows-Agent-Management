"use client";

import { useState } from "react";
import { postJson, ApiRequestError } from "@/hooks/useApi";
import { Icon } from "./icons";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function LoginScreen() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!passcode.trim()) {
      setError("کد مدیریت را وارد کنید.");
      return;
    }
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      await postJson("/api/auth/login", { passcode });
      window.location.href = "/";
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
        setHint(err.hint ?? null);
      } else {
        setError("ورود ممکن نشد.");
      }
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-theme">
          <ThemeToggle />
        </div>
        <div className="login-brand">
          <div className="logo" style={{ width: 42, height: 42 }}>
            <Logo size={24} />
          </div>
          <div>
            <div className="login-title">ایجنت مدیریت</div>
            <div className="login-sub">پنل مدیریت ویندوز · ورود مدیر</div>
          </div>
        </div>
        <p className="prose" style={{ fontSize: 12.5 }}>
          برای دیدن کدها، اجرای دوباره و ارسال پرامپت، کد مدیریت را وارد کنید. این کد فقط روی سرور نگه‌داری می‌شود و در
          مرورگر ذخیره نمی‌شود.
        </p>
        <div className="field">
          <label htmlFor="passcode">
            <Icon name="lock" size={14} />
            کد مدیریت
          </label>
          <input
            id="passcode"
            className="input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="••••••••"
            dir="ltr"
          />
        </div>
        {error ? (
          <p className="form-error" role="alert">
            <Icon name="alert" size={14} />
            {error}
          </p>
        ) : null}
        {hint ? <p className="field-helper">{hint}</p> : null}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <span className="spinner" /> : <Icon name="lock" size={15} />}
          {busy ? "در حال بررسی…" : "ورود به پنل"}
        </button>
        <div className="login-foot">
          کد مدیریت از متغیر محیطی <code>MANAGER_PASSCODE</code> خوانده می‌شود.
          <br />
          اگر آن را تنظیم نکرده‌اید، پنل بدون ورود باز است.
        </div>
      </form>
    </div>
  );
}
