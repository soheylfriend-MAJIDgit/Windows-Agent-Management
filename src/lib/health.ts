import { getRepoConfig } from "./config";
import { dbHealthy, envVar } from "./db";
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
      name: "پایگاه داده PostgreSQL",
      ok,
      message: ok ? "اتصال و جدول‌ها آماده است." : "اتصال برقرار نشد.",
      hint: ok ? undefined : "DATABASE_URL و اتصال Prisma Postgres/Neon در Vercel را بررسی کنید.",
    });
  } catch (err) {
    checks.push({
      name: "پایگاه داده PostgreSQL",
      ok: false,
      message: err instanceof Error ? err.message : "خطای نامشخص",
      hint: "اتصال PostgreSQL و اجرای prisma migrate deploy را بررسی کنید.",
    });
  }

  const token = await envVar("GITHUB_TOKEN");
  checks.push({
    name: "توکن گیت‌هاب",
    ok: Boolean(token),
    message: token ? "تنظیم شده (سمت سرور)." : "تنظیم نشده؛ دکمه‌های نوشتن غیرفعال‌اند.",
    hint: token ? undefined : "در Vercel Environment Variables یا فایل .env.local تنظیم کنید.",
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

  const blobToken = await envVar("BLOB_READ_WRITE_TOKEN");
  checks.push({
    name: "ذخیره اسکرین‌شات‌ها",
    ok: Boolean(blobToken),
    message: blobToken ? "Vercel Blob متصل و توکن فقط سمت سرور است." : "توکن Vercel Blob تنظیم نشده است.",
    hint: blobToken ? undefined : "از تب Storage پروژه یک Blob Store بسازید و آن را به پروژه متصل کنید.",
  });

  checks.push({
    name: "ورود مدیریت",
    ok: true,
    message: (await authEnabled())
      ? "کد مدیریت تنظیم شده؛ ورود لازم است."
      : "بدون رمز (باز). برای محیط عمومی، MANAGER_PASSCODE را تنظیم کنید.",
    hint: (await authEnabled()) ? undefined : "در Vercel متغیرهای MANAGER_PASSCODE و AUTH_SECRET را تنظیم کنید",
  });

  return { ok: checks.every((c) => c.ok || c.optional), checks, checkedAt: new Date().toISOString() };
}
