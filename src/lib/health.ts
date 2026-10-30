import { getRepoConfig } from "./config";
import { dbHealthy, envVar, getScreenshotBucket } from "./db";
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

  try {
    await getScreenshotBucket();
    checks.push({ name: "ذخیره اسکرین‌شات‌ها", ok: true, message: "Cloudflare R2 با binding=SCREENSHOTS متصل است." });
  } catch (error) {
    checks.push({ name: "ذخیره اسکرین‌شات‌ها", ok: false, message: error instanceof Error ? error.message : "R2 متصل نیست.", hint: "bucket خصوصی windows-agent-management-screenshots و binding=SCREENSHOTS را ایجاد کنید." });
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
