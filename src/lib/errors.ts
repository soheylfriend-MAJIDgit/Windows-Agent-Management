export class AppError extends Error {
  status: number;
  code: string;
  hint?: string;
  details?: unknown;

  constructor(message: string, options: { status?: number; code?: string; hint?: string; details?: unknown } = {}) {
    super(message);
    this.name = "AppError";
    this.status = options.status ?? 400;
    this.code = options.code ?? "bad_request";
    this.hint = options.hint;
    this.details = options.details;
  }
}

export function notConfigured(what: string, hint: string): AppError {
  return new AppError(`${what} پیکربندی نشده است.`, {
    status: 503,
    code: "not_configured",
    hint,
  });
}

export function githubFailure(status: number, body?: string): AppError {
  if (status === 401) {
    return new AppError("توکن گیت‌هاب معتبر نیست.", {
      status: 502,
      code: "github_unauthorized",
      hint: "مقدار GITHUB_TOKEN را در Cloudflare (secret) دوباره تنظیم کنید.",
    });
  }
  if (status === 403) {
    return new AppError("گیت‌هاب درخواست را رد کرد (دسترسی یا محدودیت نرخ).", {
      status: 502,
      code: "github_forbidden",
      hint: "توکن باید scope «Contents: Read and write» روی همین مخزن داشته باشد.",
    });
  }
  if (status === 404) {
    return new AppError("مخزن یا شاخه یا فایل در گیت‌هاب پیدا نشد.", {
      status: 404,
      code: "github_not_found",
      hint: "نام مالک/مخزن/شاخه را در تنظیمات بررسی کنید. برای مخزن خصوصی، توکن لازم است.",
    });
  }
  if (status === 409) {
    return new AppError("هم‌زمانی تغییر: فایل روی گیت‌هاب تازه‌تر است.", {
      status: 409,
      code: "github_conflict",
      hint: "یک بار دیگر تلاش کنید تا نسخه‌ی تازه گرفته شود.",
    });
  }
  return new AppError(`گیت‌هاب پاسخ ناموفق داد (کد ${status}).`, {
    status: 502,
    code: "github_error",
    hint: "چند لحظه بعد دوباره تلاش کنید.",
    details: body?.slice(0, 500),
  });
}

export function toUserMessage(err: unknown): { message: string; hint?: string; status: number; code: string } {
  if (err instanceof AppError) {
    return { message: err.message, hint: err.hint, status: err.status, code: err.code };
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/D1|database|SQL|no such table|binding/i.test(message)) {
    return {
      message: "پایگاه داده در دسترس نیست یا آماده نشد.",
      hint: "با اولین درخواست، جدول‌ها خودکار ساخته می‌شوند. اگر ادامه داشت، در تنظیمات وضعیت D1 را بررسی کنید.",
      status: 503,
      code: "db_unavailable",
    };
  }
  if (/fetch failed|network|timeout|aborted|ENOTFOUND|ECONN/i.test(message)) {
    return {
      message: "ارتباط با سرویس بیرونی برقرار نشد.",
      hint: "اتصال اینترنت/فیلترشکن سرور یا دسترس‌پذیری گیت‌هاب را بررسی کنید.",
      status: 502,
      code: "upstream_unreachable",
    };
  }
  return {
    message: "خطای غیرمنتظره رخ داد.",
    hint: "لاگ Worker را در Cloudflare بررسی کنید (Observability روشن است).",
    status: 500,
    code: "internal_error",
  };
}
