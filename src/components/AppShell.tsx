"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useOverview } from "./OverviewProvider";
import { Clock } from "./Clock";
import { ThemeToggle } from "./ThemeToggle";
import { Icon, type IconName } from "./icons";
import { Logo } from "./Logo";
import { Banner } from "./ui";
import { faNumber, relativeFa } from "@/lib/jalali";
import { postJson } from "@/hooks/useApi";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

const PRIMARY = [
  { href: "/", label: "داشبورد", icon: "dashboard" },
  { href: "/codes", label: "فهرست کدها", icon: "code" },
  { href: "/prompt", label: "ارسال پرامپت", icon: "send" },
  { href: "/reports", label: "گزارش اجرا", icon: "report" },
] satisfies NavItem[];

const TOOLS = [
  { href: "/settings", label: "تنظیمات", icon: "settings" },
  { href: "/help", label: "راهنما", icon: "help" },
] satisfies NavItem[];

export function AppShell({
  children,
  session,
}: {
  children: ReactNode;
  session: { enabled: boolean; authed: boolean };
}) {
  const pathname = usePathname();
  const { data, error, syncState } = useOverview();
  const [loggingOut, setLoggingOut] = useState(false);

  const stats = data?.stats;
  const pending = stats?.pending ?? 0;
  const failed = stats?.failed ?? 0;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  async function logout() {
    setLoggingOut(true);
    try {
      await postJson("/api/auth/logout");
    } catch {
      // بارگذاری دوباره، وضعیت نشست را از سرور می‌پرسد.
    }
    window.location.href = "/";
  }

  return (
    <>
      <a className="skip-link" href="#main">
        رفتن به محتوا
      </a>

      <div className="topbar">
        <div className="container" style={{ paddingBottom: 0 }}>
          <header className="app-header">
            <Link href="/" className="brand" aria-label="ایجنت مدیریت — داشبورد">
              <span className="logo" aria-hidden="true">
                <Logo size={24} />
              </span>
              <span className="brand-text">
                <span className="brand-title">ایجنت مدیریت</span>
                <span className="brand-sub">
                  پنل ویندوز <span aria-hidden="true">·</span> نظارت بر ایجنت همکار
                </span>
              </span>
            </Link>

            <div className="header-side">
              <Clock />
              <ThemeToggle />
              {session.enabled ? (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={logout}
                  disabled={loggingOut}
                  title="خروج از پنل"
                  aria-label="خروج از پنل"
                >
                  {loggingOut ? <span className="spinner" /> : <Icon name="logout" size={17} />}
                </button>
              ) : null}
            </div>
          </header>

          <div className="nav-stack">
            <nav className="tabs primary-tabs" aria-label="بخش‌های اصلی">
              {PRIMARY.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`tab ${isActive(item.href) ? "active" : ""}`}
                  aria-current={isActive(item.href) ? "page" : undefined}
                >
                  <Icon name={item.icon} size={16} />
                  <span>{item.label}</span>
                  {item.href === "/codes" && pending > 0 ? (
                    <span className="tab-badge" title="کدهای در انتظار اجرا">
                      {faNumber(pending)}
                    </span>
                  ) : null}
                  {item.href === "/reports" && failed > 0 ? (
                    <span className="tab-badge danger" title="کدهایی که آخرین اجرایشان ناموفق بوده">
                      {faNumber(failed)}
                    </span>
                  ) : null}
                </Link>
              ))}
            </nav>

            <div className="tools-row">
              <span className="tabs-row-label">ابزار مدیر</span>
              <nav className="tabs tools-tabs" aria-label="ابزارهای مدیریت">
                {TOOLS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`tab ${isActive(item.href) ? "active" : ""}`}
                    aria-current={isActive(item.href) ? "page" : undefined}
                  >
                    <Icon name={item.icon} size={14} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </div>

      <main className="container" id="main">
        {error?.status === 401 ? (
          <Banner
            tone="warn"
            title="نشست شما منقضی شده است"
            actions={
              <a className="btn btn-small" href="/">
                ورود دوباره
              </a>
            }
          >
            برای ادامه، کد مدیریت را دوباره وارد کنید.
          </Banner>
        ) : null}

        {children}

        <footer className="app-foot">
          <span className="foot-group">
            <span>ایجنت مدیریت · نسخه ۱.۰.۰</span>
            {data?.repos.collab ? (
              <span className="mono" dir="ltr" title="مخزن ایجنت همکار">
                {data.repos.collab.owner}/{data.repos.collab.repo}
              </span>
            ) : null}
          </span>
          <span className="foot-group">
            {syncState?.configured ? (
              <span>
                <span
                  className={`status-mark ${syncState.lastError ? "is-danger" : "is-ok"}`}
                  aria-hidden="true"
                />
                {syncState.lastError ? "آخرین همگام‌سازی ناموفق بود" : "همگام‌سازی درایو فعال"}
                {syncState.lastSyncAt ? ` · ${relativeFa(syncState.lastSyncAt)}` : ""}
              </span>
            ) : (
              <span>درایو متصل نیست · ورود دستی گزارش‌ها فعال است</span>
            )}
            <span aria-hidden="true">·</span>
            <span>ساعت تهران</span>
          </span>
        </footer>
      </main>
    </>
  );
}
