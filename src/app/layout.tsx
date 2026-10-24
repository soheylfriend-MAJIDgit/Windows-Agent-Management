import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/vazirmatn";
import "./globals.css";
import { readSession } from "@/lib/auth";
import { ToastProvider } from "@/components/ToastProvider";
import { OverviewProvider } from "@/components/OverviewProvider";
import { AppShell } from "@/components/AppShell";
import { LoginScreen } from "@/components/LoginScreen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "ایجنت مدیریت — پنل ویندوز",
    template: "%s · ایجنت مدیریت",
  },
  description:
    "پنل مدیریت کدهای ایجنت همکار: فهرست job_*.py، اجرای دوباره، ارسال پرامپت و گزارش اجرای پنل ویندوز.",
  applicationName: "ایجنت مدیریت",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#161511" },
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
  ],
};

// تم ذخیره‌شده پیش از رندر اعمال می‌شود تا پرش رنگ نداشته باشیم.
const themeScript = `(function(){try{var t=localStorage.getItem('wam-theme');if(t!=='light'&&t!=='dark'){t='dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  let session: { enabled: boolean; authed: boolean } = { enabled: false, authed: true };
  try {
    session = await readSession();
  } catch {
    session = { enabled: false, authed: true };
  }

  return (
    <html lang="fa" dir="rtl" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>
          {session.enabled && !session.authed ? (
            <LoginScreen />
          ) : (
            <OverviewProvider>
              <AppShell session={session}>{children}</AppShell>
            </OverviewProvider>
          )}
        </ToastProvider>
      </body>
    </html>
  );
}
