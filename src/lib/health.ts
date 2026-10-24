import { getRepoConfig } from "./config";
import { dbHealthy, envVar } from "./db";
import { driveStatus, getDriveState, testDrive } from "./drive";
import { fetchArchive, fetchRateLimit } from "./github";
import { authEnabled } from "./auth";
import type { HealthCheck } from "./types";

export interface HealthResult {
  ok: boolean;
  checks: HealthCheck[];
  checkedAt: string;
}

export async function runHealthCheck(deep: boolean): Promise<HealthResult> {
  const checks: HealthCheck[] = [];

  try {
    const ok = await dbHealthy();
    checks.push({
      name: "پایگاه داده D1",
      ok,
      message: ok ? "اتصال و جدول‌ها آماده است." : "اتصال برقرار نشد.",
      hint: ok ? undefined : "binding با نام DB در wrangler.jsonc و اجرای اولیه‌ی Worker را بررسی کنید.",
    });
  } catch (err) {
    checks.push({
      name: "پایگاه داده D1",
      ok: false,
      message: err instanceof Error ? err.message : "خطای نامشخص",
      hint: "با اولین deploy، D1 خودکار ساخته می‌شود؛ سپس جدول‌ها در اولین درخواست.",
    });
  }

  const token = await envVar("GITHUB_TOKEN");
  checks.push({
    name: "توکن گیت‌هاب",
    ok: Boolean(token),
    message: token ? "تنظیم شده (سمت سرور)." : "تنظیم نشده؛ دکمه‌های نوشتن غیرفعال‌اند.",
    hint: token ? undefined : "wrangler secret put GITHUB_TOKEN — یا در .dev.vars برای اجرای محلی.",
  });
  if (deep && token) {
    const rate = await fetchRateLimit(token);
    checks.push({
      name: "اعتبار توکن گیت‌هاب",
      ok: Boolean(rate),
      message: rate ? `معتبر است؛ ${rate.remaining} از ${rate.limit} درخواست باقی مانده.` : "اعتبار توکن تأیید نشد.",
      hint: rate ? undefined : "توکن را با scope محتویات مخزن دوباره بسازید.",
    });
  }

  try {
    const config = await getRepoConfig("collab", false);
    if (deep) {
      const archive = await fetchArchive(config, { force: true });
      checks.push({
        name: "گیت‌هاب (ایجنت همکار)",
        ok: true,
        message: `متصل؛ ${archive.files.length} فایل job_*.py در ریشه.`,
        detail: `${config.owner}/${config.repo}@${config.branch}`,
      });
    } else {
      checks.push({
        name: "گیت‌هاب (ایجنت همکار)",
        ok: true,
        message: "پیکربندی انجام شده؛ برای آزمون واقعی «بررسی عمیق» را بزنید.",
        detail: `${config.owner}/${config.repo}@${config.branch}`,
      });
    }
  } catch (err) {
    checks.push({
      name: "گیت‌هاب (ایجنت همکار)",
      ok: false,
      message: err instanceof Error ? err.message : "اتصال برقرار نشد.",
      hint: "نام مخزن/شاخه را در تنظیمات بررسی کنید یا بعداً دوباره تلاش کنید.",
    });
  }

  const driveConfigured = (await driveStatus()).configured;
  checks.push({
    name: "همگام‌سازی گوگل درایو",
    ok: driveConfigured,
    optional: !driveConfigured,
    message: driveConfigured ? "حساب سرویس و پوشه تنظیم شده‌اند." : "پیکربندی نشده؛ گزارش‌ها را دستی وارد کنید.",
    hint: driveConfigured
      ? undefined
      : "GOOGLE_SERVICE_ACCOUNT_JSON و GOOGLE_DRIVE_LOGS_FOLDER_ID را تنظیم کنید (راهنما در تنظیمات).",
  });
  if (deep && driveConfigured) {
    const result = await testDrive();
    checks.push({
      name: "اتصال گوگل درایو",
      ok: result.ok,
      message: result.message,
      hint: result.hint,
    });
  }
  if (driveConfigured) {
    const state = await getDriveState();
    checks.push({
      name: "آخرین همگام‌سازی درایو",
      ok: !state.lastError,
      message: state.lastSyncAt
        ? state.lastError
          ? `آخرین تلاش ناموفق: ${state.lastError}`
          : "آخرین همگام‌سازی موفق بود."
        : "هنوز همگام‌سازی انجام نشده.",
      detail: state.lastSyncAt ?? undefined,
    });
  }

  checks.push({
    name: "ورود مدیریت",
    ok: true,
    message: (await authEnabled())
      ? "کد مدیریت تنظیم شده؛ ورود لازم است."
      : "بدون رمز (باز). برای محیط عمومی، MANAGER_PASSCODE را تنظیم کنید.",
    hint: (await authEnabled()) ? undefined : "wrangler secret put MANAGER_PASSCODE",
  });

  return { ok: checks.every((c) => c.ok || c.optional), checks, checkedAt: new Date().toISOString() };
}
