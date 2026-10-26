import { AppError } from "./errors";
import { ARENA_JOB_NAME, buildArenaJobFile } from "./arena-job";
import { getAutomation, requestAutomationRun, saveAutomationVersion } from "./automations";
import { findOnlineCommandAgent } from "./commands";

export type ServiceSlug = "close-folders" | "arena-batch" | "director-monitor";

export interface ServiceDefinition {
  slug: ServiceSlug;
  title: string;
  summary: string;
  category: string;
  caution: string;
  fields: Array<{
    name: string;
    label: string;
    type: "url" | "text" | "number" | "textarea" | "checkbox";
    required?: boolean;
    min?: number;
    max?: number;
    defaultValue?: string | number | boolean;
    helper?: string;
  }>;
}

export const SERVICE_CATALOG: ServiceDefinition[] = [
  {
    slug: "close-folders",
    title: "بستن تمام پوشه‌ها",
    summary: "همه پنجره‌های پوشه File Explorer را می‌بندد؛ فایل یا پوشه‌ای حذف نمی‌شود.",
    category: "کنترل ویندوز",
    caution: "فقط پنجره‌های پوشه بسته می‌شوند. پنجره‌های مرورگر و برنامه‌های دیگر دست‌نخورده می‌مانند.",
    fields: [
      {
        name: "confirmed",
        label: "تأیید می‌کنم پنجره‌های پوشه بسته شوند",
        type: "checkbox",
        required: true,
        defaultValue: false,
      },
    ],
  },
  {
    slug: "arena-batch",
    title: "اجرای ترتیبی پرامپت‌ها",
    summary: "یک فهرست پرامپت را به‌ترتیب روی صفحه Arena اجرا و تا پایان هر پاسخ صبر می‌کند.",
    category: "Arena و مدل",
    caution: "صفحه Arena یک‌بار باز می‌شود؛ پس از پایان هر پاسخ، گزینه Yes تأیید و پرامپت بعدی در همان گفت‌وگو ارسال می‌شود. سقف مجموع اجراها ۲۰ است.",
    fields: [
      { name: "url", label: "لینک صفحه مدل", type: "url", required: true, defaultValue: "https://arena.ai/", helper: "فقط لینک HTTPS" },
      {
        name: "prompts",
        label: "فهرست پرامپت‌ها",
        type: "textarea",
        required: true,
        helper: "هر پرامپت می‌تواند چندخطی باشد؛ پرامپت‌ها را با یک خط شامل --- جدا کنید. حداکثر ۲۰ مورد.",
      },
      {
        name: "autoGoal",
        label: "هدف پرامپت اول",
        type: "textarea",
        required: true,
        helper: "کاری که Agent همکار باید از پرامپت اول آغاز کند.",
      },
      {
        name: "autoNextPromptInstruction",
        label: "دستور ساخت پرامپت بعدی",
        type: "textarea",
        required: true,
        defaultValue: "در پایان هر مرحله، پرامپت کامل مرحله بعد را بساز و فایل NextPrompt.txt را با آن جایگزین و ذخیره کن. محتوای قبلی فایل را کاملاً حذف کن؛ هرگز متن جدید را به متن قبلی اضافه نکن. فایل باید فقط متن قابل‌ارسالِ پرامپت بعدی را داشته باشد و هیچ عنوان، توضیح، تاریخ یا قالب Markdown دیگری در آن نباشد. اگر کار واقعاً تمام شده است فقط [[STOP]] را در فایل بنویس.",
        helper: "این متن داخل پرامپت اول قرار می‌گیرد؛ قرارداد جایگزینی کامل فایل را حذف نکنید.",
      },
      {
        name: "autoDetails",
        label: "جزئیات تکمیلی",
        type: "textarea",
        defaultValue: "",
        helper: "محدودیت‌ها، معیار پذیرش یا اطلاعاتی که Agent همکار برای ادامه خودکار نیاز دارد.",
      },
      { name: "autoMaxIterations", label: "حداکثر تعداد اجرا (با احتساب پرامپت اول)", type: "number", required: true, min: 1, max: 20, defaultValue: 10 },
      {
        name: "nextPromptPath",
        label: "مسیر همگام‌شده فایل در ویندوز",
        type: "text",
        required: true,
        defaultValue: "C:\\Users\\alibatel\\My Drive\\Windows-Agent-DB\\NextPrompt.txt",
        helper: "اگر پسوند نوشته نشود، .txt افزوده می‌شود. Windows Agent فقط همین فایل محلی همگام‌شده را می‌خواند.",
      },
      {
        name: "nextPromptDriveUrl",
        label: "لینک فایل NextPrompt در Google Drive",
        type: "url",
        required: true,
        defaultValue: "https://drive.google.com/file/d/1KNLgiTPqwJeKOxXDUguRPV3cHofWRzFY/view",
        helper: "این لینک داخل پرامپت اول به Agent همکار داده می‌شود؛ کلید یا اعتبارنامه‌ای به Windows Agent ارسال نمی‌شود.",
      },
      { name: "rounds", label: "تعداد دور", type: "number", required: true, min: 1, max: 20, defaultValue: 1 },
      { name: "delaySeconds", label: "فاصله بین دو پرامپت (ثانیه)", type: "number", required: true, min: 3, max: 300, defaultValue: 10 },
      { name: "completionTimeoutMinutes", label: "زمان یادآوری انتظار پاسخ (دقیقه)", type: "number", required: true, min: 5, max: 720, defaultValue: 60, helper: "پیش‌فرض یک ساعت؛ در حالت درخواست تصمیم، پایان این زمان اجرای Arena را متوقف نمی‌کند." },
      { name: "askOnCompletionTimeout", label: "پس از پایان زمان، از مدیر سؤال شود و پایش ادامه یابد", type: "checkbox", defaultValue: true },
      { name: "showClickHighlights", label: "محل کلیک روی کادر پرامپت با دایره زرد نمایش داده شود", type: "checkbox", defaultValue: true },
      { name: "stopOnError", label: "در اولین خطا متوقف شود", type: "checkbox", defaultValue: true },
    ],
  },
  {
    slug: "director-monitor",
    title: "بازکردن و پایش برنامه کارگردان",
    summary: "یک لینک مشخص را باز می‌کند و دسترس‌پذیری آن را تا پایان مدت انتخاب‌شده پایش می‌کند.",
    category: "پایش سایت",
    caution: "این سرویس داخل سایت کاری انجام نمی‌دهد؛ فقط لینک را باز نگه می‌دارد و قطعی/وصل‌شدن را گزارش می‌کند.",
    fields: [
      { name: "url", label: "لینک برنامه کارگردان", type: "url", required: true, helper: "فقط لینک HTTPS" },
      { name: "durationMinutes", label: "مدت پایش (دقیقه)", type: "number", required: true, min: 1, max: 55, defaultValue: 30 },
      { name: "intervalSeconds", label: "فاصله بررسی (ثانیه)", type: "number", required: true, min: 10, max: 300, defaultValue: 30 },
      { name: "reopenAfterReconnect", label: "پس از برگشت اتصال، لینک دوباره باز شود", type: "checkbox", defaultValue: true },
      {
        name: "networkAcceptance",
        label: "حالت آزمون پذیرش قطع و وصل شبکه",
        type: "checkbox",
        defaultValue: false,
        helper: "در این حالت سرویس با وجود network_resilience=false فقط برای ثبت شواهد آزمون اجرا می‌شود.",
      },
    ],
  },
];

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("ورودی سرویس معتبر نیست.", { status: 400, code: "service_input_invalid" });
  }
  return value as Record<string, unknown>;
}

function numberField(input: Record<string, unknown>, name: string, min: number, max: number): number {
  const value = Number(input[name]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AppError(`مقدار ${name} باید بین ${min} و ${max} باشد.`, { status: 422, code: "service_number_invalid" });
  }
  return value;
}

function boolField(input: Record<string, unknown>, name: string, fallback = false): boolean {
  const value = input[name];
  return typeof value === "boolean" ? value : fallback;
}

function httpsUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) {
    throw new AppError("لینک سرویس معتبر نیست.", { status: 422, code: "service_url_invalid" });
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AppError("لینک سرویس معتبر نیست.", { status: 422, code: "service_url_invalid" });
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new AppError("فقط لینک HTTPS بدون نام کاربری و رمز پذیرفته می‌شود.", { status: 422, code: "service_url_unsafe" });
  }
  return url.toString();
}

function pythonString(value: string): string {
  return JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function replacePythonAssignment(source: string, name: string, value: string): string {
  const pattern = new RegExp(`^${name}\\s*=.*$`, "m");
  if (!pattern.test(source)) throw new AppError(`متغیر ${name} در اتوماسیون پیدا نشد.`, { status: 409, code: "service_source_incompatible" });
  return source.replace(pattern, `${name} = ${pythonString(value)}`);
}

function replacePythonExpression(source: string, name: string, expression: string): string {
  const pattern = new RegExp(`^${name}\\s*=.*$`, "m");
  if (!pattern.test(source)) throw new AppError(`متغیر ${name} در اتوماسیون پیدا نشد.`, { status: 409, code: "service_source_incompatible" });
  return source.replace(pattern, `${name} = ${expression}`);
}

function parsePromptBlocks(value: string): string[] {
  return value
    .split(/\r?\n[\t ]*---[\t ]*(?=\r?\n|$)/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function closeFoldersSource(): string {
  return `# generated-management-service: close-folders\nimport subprocess\n\nSCRIPT = r'''\n$closed = 0\n$shell = New-Object -ComObject Shell.Application\n$windows = @($shell.Windows())\nforeach ($window in $windows) {\n    try {\n        $path = [string]$window.FullName\n        if ([System.IO.Path]::GetFileName($path) -ieq 'explorer.exe' -and $window.Document.Folder) {\n            $window.Quit()\n            $closed++\n        }\n    } catch {}\n}\nWrite-Output (\"SERVICE_FOLDERS_CLOSED=\" + $closed)\n'''\n\nresult = subprocess.run(\n    [\"powershell.exe\", \"-NoProfile\", \"-NonInteractive\", \"-ExecutionPolicy\", \"Bypass\", \"-Command\", SCRIPT],\n    capture_output=True, text=True, encoding=\"utf-8\", errors=\"replace\", timeout=60,\n    creationflags=getattr(subprocess, \"CREATE_NO_WINDOW\", 0),\n)\nprint(result.stdout.strip())\nif result.returncode != 0:\n    raise SystemExit(result.returncode)\nprint(\"SERVICE_COMPLETED: پنجره‌های پوشه بسته شدند\")\n`;
}

export function directorMonitorSource(url: string, durationMinutes: number, intervalSeconds: number, reopen: boolean): string {
  return `# generated-management-service: director-monitor\nimport time\nimport urllib.error\nimport urllib.request\nimport webbrowser\n\nURL = ${pythonString(url)}\nDURATION_SECONDS = ${durationMinutes * 60}\nINTERVAL_SECONDS = ${intervalSeconds}\nREOPEN_AFTER_RECONNECT = ${reopen ? "True" : "False"}\n\ndef reachable():\n    try:\n        request = urllib.request.Request(URL, method=\"HEAD\", headers={\"User-Agent\": \"Windows-Agent/service\"})\n        with urllib.request.urlopen(request, timeout=12) as response:\n            response.read(1)\n        return True\n    except urllib.error.HTTPError:\n        return True\n    except Exception:\n        return False\n\nprint(\"SERVICE_OPENING_URL: \" + URL)\nwebbrowser.open(URL, new=2)\ndeadline = time.monotonic() + DURATION_SECONDS\nwas_offline = False\ncheck = 0\nwhile time.monotonic() < deadline:\n    check += 1\n    online = reachable()\n    if online:\n        print(f\"SERVICE_MONITOR_OK: بررسی {check}\")\n        if was_offline and REOPEN_AFTER_RECONNECT:\n            webbrowser.open(URL, new=2)\n            print(\"SERVICE_URL_REOPENED: اتصال برگشت\")\n        was_offline = False\n    else:\n        if not was_offline:\n            print(\"SERVICE_NETWORK_PAUSED: سایت یا اینترنت در دسترس نیست\")\n        else:\n            print(\"SERVICE_NETWORK_STILL_PAUSED: پایش ادامه دارد\")\n        was_offline = True\n    time.sleep(min(INTERVAL_SECONDS, max(0, deadline - time.monotonic())))\nprint(\"SERVICE_COMPLETED: مدت پایش تمام شد\")\n`;
}

async function arenaBatchSource(input: Record<string, unknown>): Promise<{
  source: string;
  total: number;
  delay: number;
  completionTimeoutSeconds: number;
  askOnCompletionTimeout: boolean;
  sourceMode: "manual" | "next_file";
}> {
  const url = httpsUrl(input.url);
  const sourceMode = input.promptSourceMode === "next_file" ? "next_file" : "manual";
  const delay = numberField(input, "delaySeconds", 3, 300);
  const completionTimeoutSeconds = numberField(input, "completionTimeoutMinutes", 5, 720) * 60;
  const askOnCompletionTimeout = boolField(input, "askOnCompletionTimeout", true);
  const showClickHighlights = boolField(input, "showClickHighlights", true);

  let prompts: string[];
  let rounds: number;
  let total: number;
  let nextPromptPath = "";
  let initialPrompt = "";

  if (sourceMode === "manual") {
    prompts = Array.isArray(input.promptItems)
      ? input.promptItems.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      : typeof input.prompts === "string"
        ? parsePromptBlocks(input.prompts)
        : [];
    if (!prompts.length || prompts.length > 20 || prompts.some((item) => item.length < 2 || item.length > 4000)) {
      throw new AppError("بین ۱ تا ۲۰ پرامپت وارد کنید؛ هر پرامپت باید بین ۲ تا ۴۰۰۰ نویسه باشد.", {
        status: 422,
        code: "service_prompts_invalid",
      });
    }
    rounds = numberField(input, "rounds", 1, 20);
    total = prompts.length * rounds;
    if (total > 20) throw new AppError("مجموع پرامپت‌ها در همه دورها نباید بیشتر از ۲۰ باشد.", { status: 422, code: "service_batch_too_large" });
  } else {
    const goal = typeof input.autoGoal === "string" ? input.autoGoal.trim() : "";
    const instruction = typeof input.autoNextPromptInstruction === "string" ? input.autoNextPromptInstruction.trim() : "";
    const details = typeof input.autoDetails === "string" ? input.autoDetails.trim() : "";
    if (goal.length < 2 || goal.length > 4000) {
      throw new AppError("هدف پرامپت اول باید بین ۲ تا ۴۰۰۰ نویسه باشد.", { status: 422, code: "service_auto_goal_invalid" });
    }
    if (instruction.length < 20 || instruction.length > 4000) {
      throw new AppError("دستور ساخت پرامپت بعدی باید بین ۲۰ تا ۴۰۰۰ نویسه باشد.", { status: 422, code: "service_auto_instruction_invalid" });
    }
    if (details.length > 4000) {
      throw new AppError("جزئیات تکمیلی نباید بیشتر از ۴۰۰۰ نویسه باشد.", { status: 422, code: "service_auto_details_invalid" });
    }
    const rawPath = typeof input.nextPromptPath === "string" ? input.nextPromptPath.trim() : "";
    if (!/^[A-Za-z]:\\[^\r\n\0]+$/.test(rawPath) || rawPath.split("\\").includes("..") || rawPath.length > 500) {
      throw new AppError("مسیر فایل باید یک مسیر مطلق و امن ویندوز باشد؛ نمونه: C:\\Users\\...\\NextPrompt.txt", {
        status: 422,
        code: "service_next_prompt_path_invalid",
      });
    }
    nextPromptPath = /\.txt$/i.test(rawPath) ? rawPath : `${rawPath}.txt`;
    const driveUrl = httpsUrl(input.nextPromptDriveUrl);
    if (new URL(driveUrl).hostname !== "drive.google.com") {
      throw new AppError("لینک فایل پرامپت بعدی باید از drive.google.com باشد.", { status: 422, code: "service_next_prompt_drive_url_invalid" });
    }
    total = numberField(input, "autoMaxIterations", 1, 20);
    rounds = 1;
    initialPrompt = [
      "هدف اصلی:",
      goal,
      "",
      "قرارداد الزامی تولید پرامپت بعدی:",
      instruction,
      "",
      "فایل تعیین‌شده برای پرامپت بعدی:",
      `- لینک Google Drive: ${driveUrl}`,
      `- نام فایل: NextPrompt.txt`,
      "- فایل را با عملیات جایگزینی کامل (overwrite/replace) ذخیره کن؛ append ممنوع است.",
      "- قبل از ذخیره، محتوای قبلی را حذف کن تا فایل همیشه فقط یک پرامپت داشته باشد.",
      "- متن فایل باید مستقیم قابل ارسال به Arena باشد؛ عنوان، تاریخ، توضیح جانبی و حصار Markdown ننویس.",
      "- اگر هیچ مرحله بعدی لازم نیست، فایل را فقط با [[STOP]] جایگزین کن.",
      "",
      details ? `جزئیات تکمیلی:\n${details}` : "",
      "",
      `این اجرای خودکار حداکثر ${total.toLocaleString("fa-IR")} مرحله با احتساب همین پرامپت اول دارد. پاسخ این مرحله را انجام بده و پیش از پایان، فایل مرحله بعد را مطابق قرارداد بالا جایگزین کن.`,
    ].filter((line, index, all) => line || (index > 0 && all[index - 1])).join("\n").trim();
    if (initialPrompt.length > 8000) {
      throw new AppError("پرامپت اول ساخته‌شده بیش از ۸۰۰۰ نویسه است؛ هدف، دستور یا جزئیات را کوتاه‌تر کنید.", {
        status: 422,
        code: "service_auto_initial_prompt_too_long",
      });
    }
    prompts = [initialPrompt];
  }

  const arena = await getAutomation(ARENA_JOB_NAME.replace(/^job_/, "").replace(/\.py$/, ""), true);
  if (!arena.activeVersion?.sourceCode) throw new AppError("نسخه فعال Arena وجود ندارد.", { status: 409, code: "arena_version_missing" });
  let source = buildArenaJobFile({
    source: arena.activeVersion.sourceCode,
    prompt: prompts[0],
    telegramMode: "off",
    requestId: `service-batch-${Date.now()}`,
  });
  source = replacePythonAssignment(source, "URL", url);
  source = replacePythonExpression(source, "ARENA_COMPLETION_TIMEOUT", String(completionTimeoutSeconds));
  source = replacePythonExpression(source, "ARENA_ASK_ON_COMPLETION_TIMEOUT", askOnCompletionTimeout ? "True" : "False");
  source = replacePythonExpression(source, "ARENA_SHOW_CLICK_HIGHLIGHTS", showClickHighlights ? "True" : "False");
  source = replacePythonExpression(
    source,
    "OCR_PYTHON",
    'os.environ.get("WINDOWS_AGENT_OCR_PYTHON", "") or os.path.join(os.environ.get("LOCALAPPDATA", ""), "Windows-Agent", "vision", ".venv", "Scripts", "python.exe")',
  );
  source = replacePythonExpression(
    source,
    "OCR_HELPER",
    'os.environ.get("WINDOWS_AGENT_OCR_HELPER", "") or os.path.join(os.environ.get("LOCALAPPDATA", ""), "Windows-Agent", "vision", "paddle_ocr_helper.py")',
  );

  const openEveryTime = `    # ۱) پیش از بازکردن صفحه، اتصال پایش می‌شود.\n    wait_for_network()\n    open_site()\n`;
  const openOnce = `    # ۱) سرویس ترتیبی همان گفت‌وگوی Arena را برای همه پرامپت‌ها نگه می‌دارد.\n    global SERVICE_ARENA_SESSION_OPENED\n    wait_for_network()\n    if not SERVICE_ARENA_SESSION_OPENED:\n        open_site()\n        SERVICE_ARENA_SESSION_OPENED = True\n    else:\n        print(\"SERVICE_ARENA_SESSION_REUSED: ادامه در همان گفت‌وگوی Arena\")\n`;
  if (!source.includes(openEveryTime)) {
    throw new AppError("بخش بازکردن صفحه Arena برای اجرای ترتیبی سازگار نیست.", {
      status: 409,
      code: "service_arena_session_upgrade_failed",
    });
  }
  source = source.replace(openEveryTime, openOnce);

  const originalEntry = `if __name__ == "__main__":\n    main()\n`;
  const batchEntry = `PROMPT_BATCH = ${JSON.stringify(prompts)}\nBATCH_ROUNDS = ${rounds}\nBATCH_MAX_ITEMS = ${total}\nBATCH_SOURCE_MODE = ${pythonString(sourceMode)}\nNEXT_PROMPT_FILE = ${pythonString(nextPromptPath)}\nNEXT_PROMPT_POLL_SECONDS = 3\nNEXT_PROMPT_STABLE_READS = 3\nNEXT_PROMPT_MAX_BYTES = 65536\nNEXT_PROMPT_MAX_CHARS = 4000\nNEXT_PROMPT_STOP_TOKEN = \"[[STOP]]\"\nBATCH_DELAY_SECONDS = ${delay}\nBATCH_STOP_ON_ERROR = True\nBATCH_NETWORK_ACCEPTANCE = ${boolField(input, "networkAcceptance", false) ? "True" : "False"}\nBATCH_UNRECOVERABLE_ACCEPTANCE = ${boolField(input, "unrecoverableAcceptance", false) ? "True" : "False"}\nSERVICE_ARENA_SESSION_OPENED = False\nNEXT_PROMPT_REJECTED_HASHES = set()\n\ndef service_read_next_prompt_file():\n    try:\n        before = os.stat(NEXT_PROMPT_FILE)\n        if before.st_size > NEXT_PROMPT_MAX_BYTES:\n            return None, None, \"too_large\"\n        with open(NEXT_PROMPT_FILE, \"rb\") as handle:\n            raw = handle.read(NEXT_PROMPT_MAX_BYTES + 1)\n        after = os.stat(NEXT_PROMPT_FILE)\n    except FileNotFoundError:\n        return None, None, \"missing\"\n    except OSError as exc:\n        return None, None, \"read_error:\" + str(exc)\n    if len(raw) > NEXT_PROMPT_MAX_BYTES:\n        return None, None, \"too_large\"\n    if before.st_size != after.st_size or getattr(before, \"st_mtime_ns\", 0) != getattr(after, \"st_mtime_ns\", 0):\n        return None, None, \"changed_while_reading\"\n    if not raw:\n        return \"\", hashlib.sha256(raw).hexdigest(), \"ok\"\n    text = None\n    for encoding in (\"utf-8-sig\", \"utf-16\", \"cp1256\"):\n        try:\n            text = raw.decode(encoding)\n            break\n        except UnicodeError:\n            continue\n    if text is None:\n        return None, None, \"decode_error\"\n    text = text.replace(chr(13) + chr(10), chr(10)).replace(chr(13), chr(10)).strip()\n    digest = hashlib.sha256(text.encode(\"utf-8\")).hexdigest()\n    return text, digest, \"ok\"\n\ndef service_clear_next_prompt_file(reason):\n    parent = os.path.dirname(NEXT_PROMPT_FILE)\n    if not parent or not os.path.isdir(parent):\n        raise RuntimeError(\"پوشه فایل همگام‌شده NextPrompt در ویندوز پیدا نشد: \" + parent)\n    previous_text, previous_hash, previous_status = service_read_next_prompt_file()\n    if previous_status == \"ok\" and previous_text:\n        NEXT_PROMPT_REJECTED_HASHES.add(previous_hash)\n    temp_path = NEXT_PROMPT_FILE + f\".management-{os.getpid()}.tmp\"\n    try:\n        with open(temp_path, \"wb\"):\n            pass\n        os.replace(temp_path, NEXT_PROMPT_FILE)\n    except OSError:\n        try:\n            if os.path.exists(temp_path):\n                os.remove(temp_path)\n            with open(NEXT_PROMPT_FILE, \"wb\"):\n                pass\n        except OSError as exc:\n            raise RuntimeError(\"پاک‌کردن امن فایل NextPrompt ممکن نشد: \" + str(exc)) from exc\n    check_text, _, check_status = service_read_next_prompt_file()\n    if check_status != \"ok\" or check_text != \"\":\n        raise RuntimeError(\"فایل NextPrompt پس از پاک‌سازی خالی نماند\")\n    print(f\"SERVICE_NEXT_PROMPT_FILE_CLEARED: {reason}\")\n\ndef service_prepare_next_prompt_file():\n    text, digest, status = service_read_next_prompt_file()\n    if status == \"ok\" and text:\n        NEXT_PROMPT_REJECTED_HASHES.add(digest)\n        print(\"SERVICE_NEXT_PROMPT_STALE_REMOVED: محتوای قدیمی پیش از شروع حذف شد\")\n    service_clear_next_prompt_file(\"startup\")\n    stable_empty = 0\n    deadline = time.monotonic() + 60\n    while stable_empty < 2:\n        time.sleep(NEXT_PROMPT_POLL_SECONDS)\n        text, digest, status = service_read_next_prompt_file()\n        if status == \"ok\" and text == \"\":\n            stable_empty += 1\n            continue\n        stable_empty = 0\n        if status == \"ok\" and text:\n            NEXT_PROMPT_REJECTED_HASHES.add(digest)\n            print(\"SERVICE_NEXT_PROMPT_STALE_REMOVED: همگام‌سازی محتوای قدیمی را برگرداند؛ دوباره حذف شد\")\n            service_clear_next_prompt_file(\"stale-sync-return\")\n        elif status == \"missing\":\n            service_clear_next_prompt_file(\"recreate-missing\")\n        if time.monotonic() >= deadline:\n            raise RuntimeError(\"فایل NextPrompt طی یک دقیقه به حالت خالی و پایدار نرسید\")\n    print(\"SERVICE_NEXT_PROMPT_FILE_READY: فایل خالی و پایدار است\")\n\ndef service_wait_for_next_prompt(item_number):\n    print(f\"SERVICE_NEXT_PROMPT_WAITING: {item_number}/{BATCH_MAX_ITEMS}\")\n    candidate_hash = None\n    stable_reads = 0\n    last_status = None\n    last_wait_report = time.monotonic()\n    while True:\n        wait_for_network()\n        text, digest, status = service_read_next_prompt_file()\n        if status == \"ok\" and text:\n            if digest in NEXT_PROMPT_REJECTED_HASHES:\n                if last_status != \"duplicate\":\n                    print(\"SERVICE_NEXT_PROMPT_DUPLICATE_IGNORED: محتوای قدیمی یا تکراری حذف شد\")\n                service_clear_next_prompt_file(\"duplicate\")\n                candidate_hash = None\n                stable_reads = 0\n                last_status = \"duplicate\"\n                continue\n            if digest != candidate_hash:\n                candidate_hash = digest\n                stable_reads = 1\n                print(f\"SERVICE_NEXT_PROMPT_CHANGE_DETECTED: {item_number}/{BATCH_MAX_ITEMS} hash={digest[:12]} chars={len(text)}\")\n            else:\n                stable_reads += 1\n            last_status = \"candidate\"\n            if stable_reads >= NEXT_PROMPT_STABLE_READS:\n                if len(text) < 2 or len(text) > NEXT_PROMPT_MAX_CHARS:\n                    raise RuntimeError(f\"محتوای پایدار NextPrompt باید بین ۲ تا {NEXT_PROMPT_MAX_CHARS} نویسه باشد\")\n                NEXT_PROMPT_REJECTED_HASHES.add(digest)\n                service_clear_next_prompt_file(f\"consumed-{item_number}\")\n                if text == NEXT_PROMPT_STOP_TOKEN:\n                    print(f\"SERVICE_NEXT_PROMPT_STOP: {item_number}/{BATCH_MAX_ITEMS}\")\n                    return None\n                print(f\"SERVICE_NEXT_PROMPT_CONSUMED: {item_number}/{BATCH_MAX_ITEMS} hash={digest[:12]} chars={len(text)}\")\n                capture_named_step(f\"next-prompt-{item_number}-consumed\")\n                return text\n        else:\n            if status not in (\"ok\", \"missing\", \"changed_while_reading\") and status != last_status:\n                print(\"SERVICE_NEXT_PROMPT_READ_RETRY: \" + status)\n            candidate_hash = None\n            stable_reads = 0\n            last_status = status\n        now = time.monotonic()\n        if now - last_wait_report >= 60:\n            print(f\"SERVICE_NEXT_PROMPT_STILL_WAITING: {item_number}/{BATCH_MAX_ITEMS}\")\n            last_wait_report = now\n        time.sleep(NEXT_PROMPT_POLL_SECONDS)\n\ndef service_confirm_result_yes():\n    for attempt in range(1, DIALOG_CHECK_ATTEMPTS + 1):\n        wait_for_network()\n        wait_for_security_verification_clear(stage=\"before-result-confirmation\")\n        capture_named_step(\"result-confirmation-before\")\n        output = run_hidden_powershell(DIALOG_PS_SCRIPT, timeout=60)\n        if \"ARENA_DIALOG_CLICKED\" in output:\n            print(\"SERVICE_BATCH_RESULT_YES: نتیجه با گزینه Yes تأیید شد\")\n            time.sleep(DIALOG_CLICK_WAIT)\n            capture_named_step(\"result-confirmation-after\")\n            return\n        if \"ARENA_DIALOG_FOUND_BUT_NO_YES\" in output:\n            raise RuntimeError(\"پنجره پایان Arena دیده شد اما گزینه Yes قابل کلیک نبود\")\n        if attempt < DIALOG_CHECK_ATTEMPTS:\n            time.sleep(DIALOG_CHECK_GAP)\n    raise RuntimeError(\"پنجره پایان Arena برای تأیید Yes پیدا نشد\")\n\ndef batch_main():\n    global PROMPT_TEXT, PROMPT_REQUEST_ID, FAILURE_INTERVENTION_REPORTED_FOR\n    completed = 0\n    failures = 0\n    total = BATCH_MAX_ITEMS if BATCH_SOURCE_MODE == \"next_file\" else len(PROMPT_BATCH) * BATCH_ROUNDS\n    if not OCR_PYTHON or not OCR_HELPER or not os.path.isfile(OCR_PYTHON) or not os.path.isfile(OCR_HELPER):\n        raise RuntimeError(\"PaddleOCR محلی Windows Agent برای این سرویس آماده نیست\")\n    print(\"SERVICE_OCR_READY: مسیرهای PaddleOCR محلی تأیید شد\")\n    if BATCH_SOURCE_MODE == \"next_file\":\n        print(\"SERVICE_NEXT_PROMPT_MODE_READY: پایش فایل همگام‌شده فعال شد\")\n        service_prepare_next_prompt_file()\n    if BATCH_NETWORK_ACCEPTANCE:\n        print(\"SERVICE_ACCEPTANCE_DISCONNECT_NOW: اینترنت را اکنون قطع کنید؛ شروع تعامل Arena سی ثانیه دیگر است\")\n        time.sleep(30)\n    if BATCH_UNRECOVERABLE_ACCEPTANCE:\n        print(\"SERVICE_ACCEPTANCE_UNRECOVERABLE_WAIT: انتظار برای بازگشت شبکه بدون تعامل Arena\")\n        wait_for_network()\n        raise RuntimeError(\"SERVICE_ACCEPTANCE_UNRECOVERABLE: checkpoint پس از اتصال مجدد قابل ادامه نیست\")\n    manual_items = [item for _round in range(BATCH_ROUNDS) for item in PROMPT_BATCH]\n    next_prompt = PROMPT_BATCH[0]\n    for item_number in range(1, total + 1):\n        if BATCH_SOURCE_MODE == \"next_file\":\n            prompt_text = next_prompt\n        else:\n            prompt_text = manual_items[item_number - 1]\n        PROMPT_TEXT = prompt_text\n        PROMPT_REQUEST_ID = f\"service-batch-p{item_number}\"\n        print(f\"SERVICE_BATCH_ITEM_STARTED: {item_number}/{total}\")\n        try:\n            main()\n        except Exception as exc:\n            failures += 1\n            print(f\"SERVICE_BATCH_ITEM_FAILED: {item_number}/{total}: {exc}\")\n            if BATCH_STOP_ON_ERROR:\n                raise\n        else:\n            try:\n                wait_for_network()\n                service_confirm_result_yes()\n            except Exception as exc:\n                detail = f\"تأیید نتیجه پرامپت {item_number}/{total} ناموفق بود: {exc}\"\n                artifacts = save_failure_artifacts(detail + chr(10) + traceback.format_exc())\n                print(\"SERVICE_HUMAN_INTERVENTION_REQUIRED: \" + json.dumps({\n                    \"reason\": \"arena_result_confirmation_failure\",\n                    \"requestId\": PROMPT_REQUEST_ID,\n                    \"message\": detail,\n                    \"artifactPaths\": artifacts,\n                    \"guidance\": \"اجرای ترتیبی بدون رفتن به پرامپت بعدی متوقف شد.\",\n                }, ensure_ascii=False))\n                FAILURE_INTERVENTION_REPORTED_FOR = PROMPT_REQUEST_ID\n                send_telegram_status(\"نیازمند مداخله انسانی\", detail)\n                raise\n            completed += 1\n            print(f\"SERVICE_BATCH_RESULT_CONFIRMED: {item_number}/{total}\")\n            print(f\"SERVICE_BATCH_ITEM_COMPLETED: {completed}/{total}\")\n        if item_number < total:\n            time.sleep(BATCH_DELAY_SECONDS)\n            if BATCH_SOURCE_MODE == \"next_file\":\n                PROMPT_REQUEST_ID = f\"service-batch-p{item_number + 1}\"\n                next_prompt = service_wait_for_next_prompt(item_number + 1)\n                if next_prompt is None:\n                    break\n    print(f\"SERVICE_BATCH_SUMMARY: موفق={completed} ناموفق={failures} مجموع={total}\")\n    if failures:\n        raise RuntimeError(f\"{failures} مورد از {total} پرامپت ناموفق بود\")\n    print(f\"SERVICE_COMPLETED: {completed} پرامپت کامل شد\")\n\nif __name__ == \"__main__\":\n    try:\n        batch_main()\n    except BaseException as exc:\n        if FAILURE_INTERVENTION_REPORTED_FOR != PROMPT_REQUEST_ID:\n            detail = f\"اجرای ترتیبی متوقف شد: {type(exc).__name__}: {exc}\"\n            artifacts = save_failure_artifacts(detail + chr(10) + traceback.format_exc())\n            print(\"SERVICE_HUMAN_INTERVENTION_REQUIRED: \" + json.dumps({\n                \"reason\": \"sequential_service_failure\",\n                \"requestId\": PROMPT_REQUEST_ID,\n                \"message\": detail,\n                \"artifactPaths\": artifacts,\n                \"guidance\": \"فرآیند بدون رفتن به پرامپت بعدی متوقف شد.\",\n            }, ensure_ascii=False))\n            send_telegram_status(\"نیازمند مداخله انسانی\", detail)\n        raise\n`;
  const entryIndex = source.lastIndexOf(originalEntry);
  if (entryIndex < 0) throw new AppError("نقطه شروع Arena برای سرویس ترتیبی پیدا نشد.", { status: 409, code: "service_arena_entry_missing" });
  source = source.slice(0, entryIndex) + batchEntry + source.slice(entryIndex + originalEntry.length);
  return { source, total, delay, completionTimeoutSeconds, askOnCompletionTimeout, sourceMode };
}

async function automationIdFor(slug: string): Promise<string | undefined> {
  try {
    return (await getAutomation(slug, false)).automation.id;
  } catch (error) {
    if (error instanceof AppError && error.status === 404) return undefined;
    throw error;
  }
}

export async function runService(slugValue: unknown, inputValue: unknown): Promise<{ commandId: string; version: number; service: ServiceDefinition }> {
  if (typeof slugValue !== "string") throw new AppError("شناسه سرویس معتبر نیست.", { status: 400, code: "service_slug_invalid" });
  const service = SERVICE_CATALOG.find((item) => item.slug === slugValue);
  if (!service) throw new AppError("سرویس پیدا نشد.", { status: 404, code: "service_not_found" });
  const input = object(inputValue);

  let source: string;
  let timeoutSeconds = 300;
  let noProgressSeconds = 120;
  let requiredCapabilities = ["d1_automations"];
  let summary: string;
  const acceptanceMode = boolField(input, "networkAcceptance", false);
  const unrecoverableAcceptance = boolField(input, "unrecoverableAcceptance", false);
  if (unrecoverableAcceptance && (service.slug !== "arena-batch" || !acceptanceMode)) {
    throw new AppError("شبیه‌سازی خطای غیرقابل‌بازیابی فقط همراه حالت آزمون پذیرش Arena مجاز است.", {
      status: 422,
      code: "service_unrecoverable_acceptance_invalid",
    });
  }

  if (service.slug === "close-folders") {
    if (!boolField(input, "confirmed")) throw new AppError("تأیید بستن پوشه‌ها الزامی است.", { status: 422, code: "service_confirmation_required" });
    source = closeFoldersSource();
    summary = "اجرای تعاملی بستن پنجره‌های پوشه";
  } else if (service.slug === "director-monitor") {
    const url = httpsUrl(input.url);
    const duration = numberField(input, "durationMinutes", 1, 55);
    const interval = numberField(input, "intervalSeconds", 10, 300);
    source = directorMonitorSource(url, duration, interval, boolField(input, "reopenAfterReconnect", true));
    timeoutSeconds = Math.min(3600, duration * 60 + 180);
    noProgressSeconds = Math.min(300, Math.max(60, interval * 2 + 20));
    requiredCapabilities = acceptanceMode
      ? ["d1_automations"]
      : ["d1_automations", "network_resilience"];
    summary = acceptanceMode
      ? `آزمون پذیرش شبکه با پایش ${duration} دقیقه‌ای لینک کارگردان`
      : `پایش ${duration} دقیقه‌ای لینک کارگردان`;
  } else {
    const batch = await arenaBatchSource(input);
    if (acceptanceMode && batch.total !== 1) {
      throw new AppError("در حالت آزمون پذیرش شبکه دقیقاً یک پرامپت و یک دور مجاز است.", {
        status: 422,
        code: "service_acceptance_single_prompt_required",
      });
    }
    source = batch.source;
    timeoutSeconds = batch.askOnCompletionTimeout || batch.sourceMode === "next_file"
      ? 604_800 // انتظار پاسخ یا فایل تازه job را خاتمه نمی‌دهد؛ سقف ایمنی فرمان هفت روز است.
      : Math.min(604_800, Math.max(900, batch.total * (batch.completionTimeoutSeconds + batch.delay + 300)));
    noProgressSeconds = Math.min(900, Math.max(180, Math.floor(batch.completionTimeoutSeconds / 4)));
    // این سرویس تاب‌آوری شبکه را داخل کد immutable خود اجرا می‌کند و آزمون زنده
    // قطع/وصل و شکست غیرقابل‌بازیابی را گذرانده است؛ marker سراسری برای مسیرهای
    // عمومی Arena همچنان الزامی می‌ماند، اما این سرویس مستقل به آن وابسته نیست.
    requiredCapabilities = ["d1_automations", "arena_vision_ocr"];
    summary = acceptanceMode
      ? "آزمون پذیرش شبکه با یک پرامپت Arena"
      : batch.sourceMode === "next_file"
        ? `اجرای خودکار Arena از فایل NextPrompt تا سقف ${batch.total} مرحله`
        : `اجرای ترتیبی ${batch.total} پرامپت Arena`;
  }

  // پیش از ساخت نسخه immutable مطمئن می‌شویم ایجنتی با همه قابلیت‌های لازم آنلاین است.
  const commandTarget = await findOnlineCommandAgent(requiredCapabilities);
  const automationSlug = `service_${service.slug.replace(/-/g, "_")}`;
  const saved = await saveAutomationVersion({
    automationId: await automationIdFor(automationSlug),
    slug: automationSlug,
    name: `سرویس: ${service.title}`,
    description: service.summary,
    target: "windows",
    sourceCode: source,
    changeSummary: summary,
    actor: "manager:service",
    activate: true,
  });
  const run = await requestAutomationRun(saved.automation.id, "manager:service", commandTarget, {
    source: acceptanceMode ? "service_network_acceptance" : "service_catalog",
    title: acceptanceMode ? `آزمون پذیرش شبکه · ${service.title}` : `سرویس · ${service.title}`,
    timeoutSeconds,
    noProgressSeconds,
    requiredCapabilities,
  });
  return { commandId: run.commandId, version: saved.version.version, service };
}
