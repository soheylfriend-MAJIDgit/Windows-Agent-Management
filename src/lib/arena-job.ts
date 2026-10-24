import { AppError } from "./errors";

export type TelegramReportMode = "off" | "final" | "start_final";

export const ARENA_JOB_NAME = "job_arena.py";
const BRIDGE_MARKER = "# management-arena-bridge: 1";

function pythonString(value: string): string {
  // رشته‌ی JSON از نظر escape برای literal رشته‌ی پایتون نیز معتبر است.
  return JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function replaceAssignment(source: string, name: string, value: string): string {
  const pattern = new RegExp(`^${name}\\s*=.*$`, "m");
  if (!pattern.test(source)) {
    throw new AppError(`ساختار ${ARENA_JOB_NAME} قابل شناسایی نیست.`, {
      status: 409,
      code: "arena_job_incompatible",
      hint: `متغیر ${name} در فایل پیدا نشد؛ فایل پایه‌ی Arena را بررسی کنید.`,
    });
  }
  return source.replace(pattern, `${name} = ${pythonString(value)}`);
}

const TELEGRAM_BRIDGE = `${BRIDGE_MARKER}
# گزارش نتیجه از راه صف محلی رباتِ خود Windows Agent ارسال می‌شود؛
# هیچ توکن تلگرامی داخل این فایل یا گیت‌هاب قرار نمی‌گیرد.
TELEGRAM_REPORT_MODE = "final"
PROMPT_REQUEST_ID = "initial"
BOT_API_CONFIG = os.path.join(
    os.environ.get("LOCALAPPDATA", ""), "Windows-Agent", "bot_api.json"
)


def send_telegram_status(kind, detail):
    """گزارش را به مقصد پیش‌فرض ربات می‌فرستد؛ شکست تلگرام اجرای کار را خراب نمی‌کند."""
    if TELEGRAM_REPORT_MODE == "off":
        return False
    try:
        with open(BOT_API_CONFIG, encoding="utf-8") as fh:
            cfg = json.load(fh)
        text = (
            f"[Arena / {kind}]\\n"
            f"درخواست: {PROMPT_REQUEST_ID}\\n"
            f"پرامپت: {PROMPT_TEXT[:700]}\\n"
            f"جزئیات: {str(detail)[:1800]}"
        )
        body = json.dumps({"text": text, "delay": 0, "chat_id": None}).encode("utf-8")
        request = urllib.request.Request(
            cfg["send"],
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-Agent-Token": cfg["token"],
            },
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            response.read()
        print(f"گزارش تلگرام در صف قرار گرفت: {kind}")
        return True
    except Exception as exc:
        print(f"هشدار: ثبت گزارش تلگرام ممکن نشد: {exc}")
        return False
`;

const WRAPPED_MAIN = `def main():
    started_at = datetime.now()
    if TELEGRAM_REPORT_MODE == "start_final":
        send_telegram_status("شروع", "اجرای پرامپت در ویندوز آغاز شد.")
    try:
        _run_arena_task()
    except BaseException as exc:
        elapsed = (datetime.now() - started_at).total_seconds()
        summary = f"پس از {elapsed:.1f} ثانیه ناموفق شد: {type(exc).__name__}: {exc}"
        print(summary)
        send_telegram_status("ناموفق", summary + "\\n" + traceback.format_exc()[-1200:])
        raise
    else:
        elapsed = (datetime.now() - started_at).total_seconds()
        send_telegram_status("موفق", f"پرامپت پس از {elapsed:.1f} ثانیه تایپ و ارسال شد.")


if __name__ == "__main__":
    main()
`;

export function buildArenaJobFile(options: {
  source: string;
  prompt: string;
  telegramMode: TelegramReportMode;
  requestId: string;
}): string {
  let source = options.source.replace(/\r\n/g, "\n");
  source = replaceAssignment(source, "PROMPT_TEXT", options.prompt.trim());

  if (source.includes(BRIDGE_MARKER)) {
    source = replaceAssignment(source, "TELEGRAM_REPORT_MODE", options.telegramMode);
    source = replaceAssignment(source, "PROMPT_REQUEST_ID", options.requestId);
    return source.endsWith("\n") ? source : `${source}\n`;
  }

  const importAnchor = "import os\n";
  if (!source.includes(importAnchor)) {
    throw new AppError(`ساختار ${ARENA_JOB_NAME} قابل ارتقا نیست.`, {
      status: 409,
      code: "arena_job_incompatible",
      hint: "بخش import os پیدا نشد؛ فایل پایه‌ی Arena را به نسخه‌ی شناخته‌شده برگردانید.",
    });
  }
  source = source.replace(
    importAnchor,
    "import json\nimport os\nimport traceback\nimport urllib.request\n",
  );

  const functionAnchor = "\ndef open_site():";
  if (!source.includes(functionAnchor)) {
    throw new AppError(`ساختار ${ARENA_JOB_NAME} قابل ارتقا نیست.`, {
      status: 409,
      code: "arena_job_incompatible",
      hint: "تابع open_site پیدا نشد؛ فایل پایه‌ی Arena را بررسی کنید.",
    });
  }
  source = source.replace(functionAnchor, `\n${TELEGRAM_BRIDGE}\n\ndef open_site():`);
  source = replaceAssignment(source, "TELEGRAM_REPORT_MODE", options.telegramMode);
  source = replaceAssignment(source, "PROMPT_REQUEST_ID", options.requestId);

  const mainAnchor = "\ndef main():\n";
  if (!source.includes(mainAnchor)) {
    throw new AppError(`تابع اصلی ${ARENA_JOB_NAME} پیدا نشد.`, {
      status: 409,
      code: "arena_job_incompatible",
    });
  }
  source = source.replace(mainAnchor, "\ndef _run_arena_task():\n");

  // خطاهای اصلی باید تا wrapper بالا بیایند تا نتیجه‌ی «ناموفق» تلگرام واقعی باشد.
  source = source.replace(
    '    else:\n        print("هشدار: حضور متن در کادر چت تأیید نشد")',
    '    else:\n        raise RuntimeError("حضور متن در کادر چت تأیید نشد")',
  );
  source = source.replace(
    '    else:\n        print("هشدار: ارسال پیام قطعی تأیید نشد؛ اسکرین‌شات را بررسی کنید")',
    '    else:\n        raise RuntimeError("ارسال پیام در Arena قطعی تأیید نشد")',
  );
  source = source.replace(
    '    except Exception as exc:\n        print(f"خطا در تایپ/ارسال متن: {exc}")',
    '    except Exception as exc:\n        print(f"خطا در تایپ/ارسال متن: {exc}")\n        raise',
  );
  source = source.replace(
    '    except Exception as exc:\n        print(f"خطا در گرفتن اسکرین‌شات: {exc}")',
    '    except Exception as exc:\n        print(f"خطا در گرفتن اسکرین‌شات: {exc}")\n        raise',
  );

  const footerPattern = /\nif __name__ == ["']__main__["']:\n\s+main\(\)\s*$/;
  if (!footerPattern.test(source)) {
    throw new AppError(`پایان ${ARENA_JOB_NAME} قابل شناسایی نیست.`, {
      status: 409,
      code: "arena_job_incompatible",
    });
  }
  source = source.replace(footerPattern, `\n\n${WRAPPED_MAIN.trimEnd()}\n`);
  return source;
}
