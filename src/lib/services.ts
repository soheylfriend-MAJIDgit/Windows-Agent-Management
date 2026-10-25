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
    type: "url" | "number" | "textarea" | "checkbox";
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
      { name: "rounds", label: "تعداد دور", type: "number", required: true, min: 1, max: 20, defaultValue: 1 },
      { name: "delaySeconds", label: "فاصله بین دو پرامپت (ثانیه)", type: "number", required: true, min: 3, max: 300, defaultValue: 10 },
      { name: "stopOnError", label: "در اولین خطا متوقف شود", type: "checkbox", defaultValue: true },
      {
        name: "networkAcceptance",
        label: "حالت آزمون پذیرش شبکه (فقط یک پرامپت و یک دور)",
        type: "checkbox",
        defaultValue: false,
        helper: "این گزینه فقط برای آزمون کنترل‌شده پیش از فعال‌شدن network_resilience است.",
      },
      {
        name: "unrecoverableAcceptance",
        label: "شبیه‌سازی checkpoint غیرقابل‌بازیابی پس از اتصال مجدد",
        type: "checkbox",
        defaultValue: false,
        helper: "فقط برای مرحله جداگانه پذیرش؛ پس از برگشت اینترنت بدون تعامل Arena با وضعیت failed متوقف می‌شود.",
      },
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

async function arenaBatchSource(input: Record<string, unknown>): Promise<{ source: string; total: number; delay: number }> {
  const url = httpsUrl(input.url);
  if (typeof input.prompts !== "string") throw new AppError("فهرست پرامپت‌ها خالی است.", { status: 422, code: "service_prompts_empty" });
  const prompts = parsePromptBlocks(input.prompts);
  if (!prompts.length || prompts.length > 20 || prompts.some((item) => item.length < 2 || item.length > 4000)) {
    throw new AppError("بین ۱ تا ۲۰ بلوک پرامپت وارد کنید؛ هر بلوک حداکثر ۴۰۰۰ نویسه و جداکننده یک خط شامل --- باشد.", {
      status: 422,
      code: "service_prompts_invalid",
    });
  }
  const rounds = numberField(input, "rounds", 1, 20);
  const delay = numberField(input, "delaySeconds", 3, 300);
  const total = prompts.length * rounds;
  if (total > 20) throw new AppError("مجموع پرامپت‌ها در همه دورها نباید بیشتر از ۲۰ باشد.", { status: 422, code: "service_batch_too_large" });

  const arena = await getAutomation(ARENA_JOB_NAME.replace(/^job_/, "").replace(/\.py$/, ""), true);
  if (!arena.activeVersion?.sourceCode) throw new AppError("نسخه فعال Arena وجود ندارد.", { status: 409, code: "arena_version_missing" });
  let source = buildArenaJobFile({
    source: arena.activeVersion.sourceCode,
    prompt: prompts[0],
    telegramMode: "off",
    requestId: `service-batch-${Date.now()}`,
  });
  source = replacePythonAssignment(source, "URL", url);
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
  const batchEntry = `PROMPT_BATCH = ${JSON.stringify(prompts)}\nBATCH_ROUNDS = ${rounds}\nBATCH_DELAY_SECONDS = ${delay}\nBATCH_STOP_ON_ERROR = ${boolField(input, "stopOnError", true) ? "True" : "False"}\nBATCH_NETWORK_ACCEPTANCE = ${boolField(input, "networkAcceptance", false) ? "True" : "False"}\nBATCH_UNRECOVERABLE_ACCEPTANCE = ${boolField(input, "unrecoverableAcceptance", false) ? "True" : "False"}\nSERVICE_ARENA_SESSION_OPENED = False\n\ndef service_confirm_result_yes():\n    for attempt in range(1, DIALOG_CHECK_ATTEMPTS + 1):\n        output = run_hidden_powershell(DIALOG_PS_SCRIPT, timeout=60)\n        if \"ARENA_DIALOG_CLICKED\" in output:\n            print(\"SERVICE_BATCH_RESULT_YES: نتیجه با گزینه Yes تأیید شد\")\n            time.sleep(DIALOG_CLICK_WAIT)\n            return\n        if \"ARENA_DIALOG_FOUND_BUT_NO_YES\" in output:\n            raise RuntimeError(\"پنجره پایان Arena دیده شد اما گزینه Yes قابل کلیک نبود\")\n        if attempt < DIALOG_CHECK_ATTEMPTS:\n            time.sleep(DIALOG_CHECK_GAP)\n    raise RuntimeError(\"پنجره پایان Arena برای تأیید Yes پیدا نشد\")\n\ndef batch_main():\n    global PROMPT_TEXT, PROMPT_REQUEST_ID\n    completed = 0\n    failures = 0\n    total = len(PROMPT_BATCH) * BATCH_ROUNDS\n    if not OCR_PYTHON or not OCR_HELPER or not os.path.isfile(OCR_PYTHON) or not os.path.isfile(OCR_HELPER):\n        raise RuntimeError(\"PaddleOCR محلی Windows Agent برای این سرویس آماده نیست\")\n    print(\"SERVICE_OCR_READY: مسیرهای PaddleOCR محلی تأیید شد\")\n    if BATCH_NETWORK_ACCEPTANCE:\n        print(\"SERVICE_ACCEPTANCE_DISCONNECT_NOW: اینترنت را اکنون قطع کنید؛ شروع تعامل Arena سی ثانیه دیگر است\")\n        time.sleep(30)\n    if BATCH_UNRECOVERABLE_ACCEPTANCE:\n        print(\"SERVICE_ACCEPTANCE_UNRECOVERABLE_WAIT: انتظار برای بازگشت شبکه بدون تعامل Arena\")\n        wait_for_network()\n        raise RuntimeError(\"SERVICE_ACCEPTANCE_UNRECOVERABLE: checkpoint پس از اتصال مجدد قابل ادامه نیست\")\n    for round_index in range(BATCH_ROUNDS):\n        for prompt_index, prompt_text in enumerate(PROMPT_BATCH):\n            item_number = round_index * len(PROMPT_BATCH) + prompt_index + 1\n            PROMPT_TEXT = prompt_text\n            PROMPT_REQUEST_ID = f\"service-batch-r{round_index + 1}-p{prompt_index + 1}\"\n            print(f\"SERVICE_BATCH_ITEM_STARTED: {item_number}/{total}\")\n            try:\n                main()\n            except Exception as exc:\n                failures += 1\n                print(f\"SERVICE_BATCH_ITEM_FAILED: {item_number}/{total}: {exc}\")\n                if BATCH_STOP_ON_ERROR:\n                    raise\n            else:\n                wait_for_network()\n                service_confirm_result_yes()\n                completed += 1\n                print(f\"SERVICE_BATCH_RESULT_CONFIRMED: {item_number}/{total}\")\n                print(f\"SERVICE_BATCH_ITEM_COMPLETED: {completed}\")\n            if item_number < total:\n                time.sleep(BATCH_DELAY_SECONDS)\n    print(f\"SERVICE_BATCH_SUMMARY: موفق={completed} ناموفق={failures} مجموع={total}\")\n    if failures:\n        raise RuntimeError(f\"{failures} مورد از {total} پرامپت ناموفق بود\")\n    print(f\"SERVICE_COMPLETED: {completed} پرامپت کامل شد\")\n\nif __name__ == "__main__":\n    batch_main()\n`;
  const entryIndex = source.lastIndexOf(originalEntry);
  if (entryIndex < 0) throw new AppError("نقطه شروع Arena برای سرویس ترتیبی پیدا نشد.", { status: 409, code: "service_arena_entry_missing" });
  source = source.slice(0, entryIndex) + batchEntry + source.slice(entryIndex + originalEntry.length);
  return { source, total, delay };
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
    timeoutSeconds = Math.min(3600, Math.max(900, batch.total * (210 + batch.delay)));
    noProgressSeconds = 180;
    requiredCapabilities = acceptanceMode
      ? ["d1_automations", "arena_vision_ocr"]
      : ["d1_automations", "arena_vision_ocr", "network_resilience"];
    summary = acceptanceMode
      ? "آزمون پذیرش شبکه با یک پرامپت Arena"
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
