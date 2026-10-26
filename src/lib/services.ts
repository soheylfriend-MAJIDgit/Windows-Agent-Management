import { AppError } from "./errors";
import { ARENA_JOB_NAME, buildArenaJobFile } from "./arena-job";
import { getAutomation, requestAutomationRun, saveAutomationVersion } from "./automations";
import { findOnlineCommandAgent } from "./commands";

export type ServiceSlug = "close-folders" | "arena-batch" | "director-monitor" | "drive-control";

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
    slug: "drive-control",
    title: "پل کنترل مستقیم Google Drive",
    summary: "فرمان‌های نسخه‌دار پوشه اختصاصی Drive را دریافت، در workspace جدا اجرا و نتیجه را دوباره در Drive و D1 ثبت می‌کند.",
    category: "کنترل ویندوز",
    caution: "این سرویس می‌تواند PAYLOAD.py را اجرا کند. فقط پوشه اختصاصی و فرمان‌های دارای hash، انقضا و شناسه یکتا پذیرفته می‌شوند؛ فایل پایه هیچ Agentی تغییر نمی‌کند.",
    fields: [
      {
        name: "folderPath",
        label: "مسیر mirror پوشه اختصاصی Drive در ویندوز",
        type: "text",
        required: true,
        defaultValue: "C:\\Users\\alibatel\\My Drive\\Windows-Agent-DB\\Wndows-Agent-Management",
        helper: "نسخه آنلاین Google Drive منبع فرمان است؛ این مسیر فقط mirror همگام‌شده Google Drive Desktop است.",
      },
      { name: "pollSeconds", label: "فاصله بررسی تغییرها (ثانیه)", type: "number", required: true, min: 3, max: 60, defaultValue: 5 },
      { name: "maxDurationHours", label: "مدت فعال‌بودن پل (ساعت)", type: "number", required: true, min: 1, max: 168, defaultValue: 168 },
      { name: "maxCommandMinutes", label: "حداکثر زمان هر فرمان (دقیقه)", type: "number", required: true, min: 1, max: 120, defaultValue: 20 },
      {
        name: "confirmed",
        label: "می‌پذیرم PAYLOAD.py این پوشه با کنترل hash و انقضا در workspace جدا اجرا شود",
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
        defaultValue: "در پایان هر مرحله، اگر ادامه کار لازم است پرامپت کامل مرحله بعد را بساز و فایل NextPrompt.txt را با آن جایگزین و ذخیره کن. محتوای قبلی فایل را کاملاً حذف کن؛ هرگز متن جدید را به متن قبلی اضافه نکن. فایل باید فقط متن قابل‌ارسالِ پرامپت بعدی را داشته باشد و هیچ عنوان، توضیح، تاریخ یا قالب Markdown دیگری در آن نباشد. اگر کار تمام شده است NextPrompt.txt را تغییر نده و فایل play-puase-stop.txt را روی stop بگذار.",
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

const AGENT_OUTPUT_DIRECTORY = "C:\\Users\\alibatel\\My Drive\\Windows-Agent-DB";
const CONTROL_FILE_PATH = `${AGENT_OUTPUT_DIRECTORY}\\play-puase-stop.txt`;
const MESSAGE_FILE_PATH = `${AGENT_OUTPUT_DIRECTORY}\\Message.txt`;
const REPORT_FILE_PATH = `${AGENT_OUTPUT_DIRECTORY}\\Complete MarkDown REPORT.md`;
const CONTROL_FILE_URL = "https://drive.google.com/file/d/1KLSQCrG0swD8b5PNalYSWG7IKVC4gM5A/view";
const MESSAGE_FILE_URL = "https://drive.google.com/file/d/1tQF3hTrZMBmZ0v7DgCf6CGDC_1DyzBLF/view";
const REPORT_FILE_URL = "https://drive.google.com/file/d/15PI_bpg9c0yZ0-UMF5kvGGREmmnl0ECP/view";

function agentOutputProtocol(includeNextPrompt: boolean, nextPromptDriveUrl = ""): string {
  return [
    "قرارداد الزامی خروجی و کنترل این مرحله:",
    `1. فایل کنترل: ${CONTROL_FILE_URL}`,
    "   محتوای فایل play-puase-stop.txt باید فقط یکی از play، pause یا stop باشد. برای ادامه play، برای درخواست مداخله انسانی pause و برای پایان کامل سرویس stop را با جایگزینی کامل فایل بنویس. append ممنوع است.",
    `2. پیام زنده: ${MESSAGE_FILE_URL}`,
    "   هنگام رسیدگی به کار، Message.txt را با یک پیام کوتاهِ تک‌خطی و مستقیم جایگزین کن. متن باید حداکثر ۳۰۰ نویسه و مناسب نمایش به مدیر باشد.",
    `3. گزارش کامل: ${REPORT_FILE_URL}`,
    "   دقیقاً پیش از پایان پاسخ، فایل Complete MarkDown REPORT.md را با یک گزارش Markdown مرتب از کارهای انجام‌شده، نتیجه‌ها، موارد بررسی‌شده، خطاها و گام بعدی جایگزین و ذخیره کن. گزارش قبلی را append نکن؛ سامانه هر نسخه را جداگانه بایگانی می‌کند.",
    includeNextPrompt
      ? `4. پرامپت بعدی: ${nextPromptDriveUrl}\n   اگر ادامه لازم است NextPrompt.txt را فقط با متن کامل پرامپت بعدی جایگزین کن. اگر کار تمام شده است، به‌جای نوشتن پرامپت بعدی فایل کنترل را روی stop بگذار.`
      : "4. در این حالت پرامپت بعدی از فهرست مدیریت می‌آید؛ فایل NextPrompt.txt را تغییر نده.",
    "همه فایل‌ها را overwrite/replace کن و هیچ تاریخچه‌ای داخل فایل‌های عملیاتی نساز.",
  ].join("\n");
}

function withAgentOutputProtocol(prompt: string, includeNextPrompt: boolean, nextPromptDriveUrl = ""): string {
  return `${prompt.trim()}\n\n---\n\n${agentOutputProtocol(includeNextPrompt, nextPromptDriveUrl)}`;
}

export function closeFoldersSource(): string {
  return `# generated-management-service: close-folders\nimport subprocess\n\nSCRIPT = r'''\n$closed = 0\n$shell = New-Object -ComObject Shell.Application\n$windows = @($shell.Windows())\nforeach ($window in $windows) {\n    try {\n        $path = [string]$window.FullName\n        if ([System.IO.Path]::GetFileName($path) -ieq 'explorer.exe' -and $window.Document.Folder) {\n            $window.Quit()\n            $closed++\n        }\n    } catch {}\n}\nWrite-Output (\"SERVICE_FOLDERS_CLOSED=\" + $closed)\n'''\n\nresult = subprocess.run(\n    [\"powershell.exe\", \"-NoProfile\", \"-NonInteractive\", \"-ExecutionPolicy\", \"Bypass\", \"-Command\", SCRIPT],\n    capture_output=True, text=True, encoding=\"utf-8\", errors=\"replace\", timeout=60,\n    creationflags=getattr(subprocess, \"CREATE_NO_WINDOW\", 0),\n)\nprint(result.stdout.strip())\nif result.returncode != 0:\n    raise SystemExit(result.returncode)\nprint(\"SERVICE_COMPLETED: پنجره‌های پوشه بسته شدند\")\n`;
}

export function driveControlSource(
  folderPath: string,
  pollSeconds: number,
  maxDurationHours: number,
  maxCommandMinutes: number,
): string {
  return `# generated-management-service: drive-control-v1
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import traceback
import urllib.error
import urllib.request
from datetime import datetime, timezone

FOLDER = ${pythonString(folderPath)}
POLL_SECONDS = ${pollSeconds}
MAX_DURATION_SECONDS = ${maxDurationHours * 3600}
MAX_COMMAND_SECONDS = ${maxCommandMinutes * 60}
PROTOCOL_VERSION = 1
MAX_PAYLOAD_BYTES = 1_000_000
MAX_CAPTURE_CHARS = 2_000_000
MAX_ARTIFACT_FILES = 250
MAX_ARTIFACT_BYTES = 100_000_000
MAX_ARTIFACT_FILE_BYTES = 25_000_000
COMMAND_PATH = os.path.join(FOLDER, "COMMAND.json")
PAYLOAD_PATH = os.path.join(FOLDER, "PAYLOAD.py")
CONTROL_PATH = os.path.join(FOLDER, "CONTROL.txt")
STATUS_PATH = os.path.join(FOLDER, "STATUS.json")
RESULT_PATH = os.path.join(FOLDER, "RESULT.json")
STDOUT_PATH = os.path.join(FOLDER, "STDOUT.txt")
STDERR_PATH = os.path.join(FOLDER, "STDERR.txt")
ARTIFACTS_DIR = os.path.join(FOLDER, "artifacts")
RUNTIME_ROOT = os.path.join(os.environ.get("LOCALAPPDATA", FOLDER), "Windows-Agent", "drive-control-runtime")


def utc_now():
    return datetime.now(timezone.utc)


def iso_now():
    return utc_now().isoformat().replace("+00:00", "Z")


def parse_time(value):
    if not isinstance(value, str):
        raise ValueError("timestamp must be a string")
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def atomic_write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temp = path + ".tmp"
    with open(temp, "w", encoding="utf-8", newline="\\n") as handle:
        handle.write(text)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp, path)


def write_json(path, payload):
    atomic_write(path, json.dumps(payload, ensure_ascii=False, indent=2) + "\\n")


def status(state, message, command_id=None, **extra):
    payload = {
        "protocolVersion": PROTOCOL_VERSION,
        "controllerState": state,
        "commandId": command_id,
        "updatedAt": iso_now(),
        "message": message,
        **extra,
    }
    write_json(STATUS_PATH, payload)
    print("DRIVE_CONTROL_STATUS: " + json.dumps(payload, ensure_ascii=False), flush=True)


def read_stable(path, binary=False):
    mode = "rb" if binary else "r"
    kwargs = {} if binary else {"encoding": "utf-8-sig"}
    first_stat = os.stat(path)
    with open(path, mode, **kwargs) as handle:
        first = handle.read()
    time.sleep(1)
    second_stat = os.stat(path)
    with open(path, mode, **kwargs) as handle:
        second = handle.read()
    if first_stat.st_size != second_stat.st_size or first_stat.st_mtime_ns != second_stat.st_mtime_ns or first != second:
        raise RuntimeError("فایل هنوز در حال همگام‌سازی است")
    return second


def read_control():
    try:
        value = read_stable(CONTROL_PATH).strip().lower()
    except (FileNotFoundError, OSError, RuntimeError):
        return "pause"
    return value if value in {"play", "pause", "stop"} else "pause"


def network_reachable():
    try:
        request = urllib.request.Request(
            "https://drive.google.com/generate_204",
            method="HEAD",
            headers={"User-Agent": "Windows-Agent/drive-control"},
        )
        with urllib.request.urlopen(request, timeout=12) as response:
            response.read(1)
        return True
    except urllib.error.HTTPError:
        return True
    except Exception:
        return False


def previous_result_state():
    try:
        payload = json.loads(read_stable(RESULT_PATH))
        command_id = str(payload.get("commandId") or "")
        revision = payload.get("revision")
        return command_id, revision if isinstance(revision, int) else -1
    except Exception:
        return "", -1


def safe_capture(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            value = handle.read(MAX_CAPTURE_CHARS + 1)
        if len(value) > MAX_CAPTURE_CHARS:
            return value[:MAX_CAPTURE_CHARS] + "\\n[output truncated by drive controller]\\n"
        return value
    except FileNotFoundError:
        return ""


def validate_command(command, payload_bytes, last_revision):
    if command.get("protocolVersion") != PROTOCOL_VERSION:
        raise ValueError("protocolVersion پشتیبانی نمی‌شود")
    if command.get("state") != "ready":
        return None
    command_id = command.get("commandId")
    if not isinstance(command_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{5,79}", command_id):
        raise ValueError("commandId معتبر نیست")
    revision = command.get("revision")
    if not isinstance(revision, int) or revision <= last_revision:
        raise ValueError("revision باید عدد صحیح صعودی باشد")
    if command.get("action") != "run_python" or command.get("payloadFile") != "PAYLOAD.py":
        raise ValueError("فقط action=run_python و PAYLOAD.py مجاز است")
    issued = parse_time(command.get("issuedAt"))
    expires = parse_time(command.get("expiresAt"))
    now = utc_now()
    if issued > now.replace(microsecond=0) and (issued - now).total_seconds() > 300:
        raise ValueError("زمان صدور فرمان بیش از پنج دقیقه در آینده است")
    if expires <= now:
        raise ValueError("فرمان منقضی شده است")
    if (expires - issued).total_seconds() > 86400:
        raise ValueError("اعتبار هر فرمان حداکثر ۲۴ ساعت است")
    expected_hash = command.get("payloadSha256")
    actual_hash = hashlib.sha256(payload_bytes).hexdigest()
    if not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_hash) or expected_hash != actual_hash:
        raise ValueError("SHA-256 فایل PAYLOAD.py با COMMAND.json تطبیق ندارد")
    requested_timeout = command.get("timeoutSeconds", MAX_COMMAND_SECONDS)
    if not isinstance(requested_timeout, int) or requested_timeout < 10:
        raise ValueError("timeoutSeconds معتبر نیست")
    return command_id, revision, min(requested_timeout, MAX_COMMAND_SECONDS), actual_hash


def publish_runtime_artifacts(run_dir, safe_id):
    source_root = os.path.join(run_dir, "artifacts")
    destination_root = os.path.join(ARTIFACTS_DIR, safe_id)
    manifest = []
    if not os.path.isdir(source_root):
        return manifest
    os.makedirs(destination_root, exist_ok=True)
    source_real = os.path.realpath(source_root)
    total_bytes = 0
    for current, directories, files in os.walk(source_root, followlinks=False):
        directories[:] = [name for name in sorted(directories) if not os.path.islink(os.path.join(current, name))]
        for name in sorted(files):
            if len(manifest) >= MAX_ARTIFACT_FILES:
                raise RuntimeError("تعداد artifactهای payload از حد مجاز بیشتر است")
            source = os.path.join(current, name)
            if os.path.islink(source):
                continue
            source_resolved = os.path.realpath(source)
            try:
                if os.path.commonpath([source_real, source_resolved]) != source_real:
                    raise RuntimeError("مسیر artifact از workspace فرمان خارج شده است")
            except ValueError as exc:
                raise RuntimeError("مسیر artifact معتبر نیست") from exc
            relative = os.path.relpath(source, source_root)
            size = os.path.getsize(source)
            if size > MAX_ARTIFACT_FILE_BYTES:
                raise RuntimeError("یک artifact از حد ۲۵ مگابایت بزرگ‌تر است: " + relative)
            total_bytes += size
            if total_bytes > MAX_ARTIFACT_BYTES:
                raise RuntimeError("مجموع artifactهای فرمان از حد ۱۰۰ مگابایت بیشتر است")
            destination = os.path.join(destination_root, relative)
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            shutil.copy2(source, destination)
            digest = hashlib.sha256()
            with open(destination, "rb") as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(chunk)
            manifest.append({"path": relative.replace(os.sep, "/"), "bytes": size, "sha256": digest.hexdigest()})
    return manifest


def run_payload(command, payload_bytes, command_id, revision, timeout_seconds, payload_hash):
    safe_id = re.sub(r"[^A-Za-z0-9._-]", "_", command_id)
    run_dir = os.path.join(RUNTIME_ROOT, safe_id)
    os.makedirs(run_dir, exist_ok=True)
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    runtime_payload = os.path.join(run_dir, "PAYLOAD.py")
    with open(runtime_payload, "wb") as handle:
        handle.write(payload_bytes)
    stdout_file = os.path.join(run_dir, "stdout.txt")
    stderr_file = os.path.join(run_dir, "stderr.txt")
    started_at = iso_now()
    status("running", "فرمان در workspace جدا در حال اجرا است.", command_id, revision=revision, payloadSha256=payload_hash)
    print(f"DRIVE_CONTROL_COMMAND_STARTED: id={command_id} revision={revision} timeout={timeout_seconds}", flush=True)
    env = os.environ.copy()
    env.update({
        "DRIVE_CONTROL_FOLDER": FOLDER,
        "DRIVE_CONTROL_COMMAND_ID": command_id,
        "DRIVE_CONTROL_REVISION": str(revision),
        "DRIVE_CONTROL_ARTIFACTS_DIR": ARTIFACTS_DIR,
    })
    timed_out = False
    stopped = False
    with open(stdout_file, "w", encoding="utf-8", errors="replace") as stdout_handle, open(stderr_file, "w", encoding="utf-8", errors="replace") as stderr_handle:
        process = subprocess.Popen(
            [sys.executable, "-u", runtime_payload],
            cwd=run_dir,
            env=env,
            stdout=stdout_handle,
            stderr=stderr_handle,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        deadline = time.monotonic() + timeout_seconds
        heartbeat_at = 0.0
        while process.poll() is None:
            now_mono = time.monotonic()
            if read_control() == "stop":
                stopped = True
                process.terminate()
                break
            if now_mono >= deadline:
                timed_out = True
                process.terminate()
                break
            if now_mono >= heartbeat_at:
                print(f"DRIVE_CONTROL_COMMAND_HEARTBEAT: id={command_id} pid={process.pid}", flush=True)
                heartbeat_at = now_mono + 15
            time.sleep(1)
        try:
            exit_code = process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()
            exit_code = process.wait(timeout=5)
    stdout_text = safe_capture(stdout_file)
    stderr_text = safe_capture(stderr_file)
    artifact_manifest = []
    artifact_error = None
    try:
        artifact_manifest = publish_runtime_artifacts(run_dir, safe_id)
    except Exception as exc:
        artifact_error = f"{type(exc).__name__}: {exc}"
        stderr_text = (stderr_text.rstrip() + "\\nDRIVE_CONTROL_ARTIFACT_ERROR: " + artifact_error + "\\n").lstrip("\\n")
        if exit_code == 0 and not stopped and not timed_out:
            exit_code = 74
    atomic_write(STDOUT_PATH, stdout_text or "[no stdout]\\n")
    atomic_write(STDERR_PATH, stderr_text or "[no stderr]\\n")
    final_status = "stopped" if stopped else "timeout" if timed_out else "completed" if exit_code == 0 else "failed"
    result = {
        "protocolVersion": PROTOCOL_VERSION,
        "commandId": command_id,
        "revision": revision,
        "status": final_status,
        "startedAt": started_at,
        "finishedAt": iso_now(),
        "exitCode": exit_code,
        "timedOut": timed_out,
        "stopped": stopped,
        "payloadSha256": payload_hash,
        "stdoutChars": len(stdout_text),
        "stderrChars": len(stderr_text),
        "artifactsDirectory": "artifacts/" + safe_id,
        "artifacts": artifact_manifest,
        "artifactError": artifact_error,
    }
    write_json(RESULT_PATH, result)
    status("waiting" if not stopped else "stopped", "نتیجه فرمان ثبت شد." if not stopped else "فرمان با stop متوقف شد.", command_id, lastResult=result)
    print("DRIVE_CONTROL_COMMAND_RESULT: " + json.dumps(result, ensure_ascii=False), flush=True)
    return stopped


os.makedirs(FOLDER, exist_ok=True)
os.makedirs(RUNTIME_ROOT, exist_ok=True)
os.makedirs(ARTIFACTS_DIR, exist_ok=True)
last_command_id, last_revision = previous_result_state()
processed = {last_command_id} if last_command_id else set()
deadline = time.monotonic() + MAX_DURATION_SECONDS
last_heartbeat = 0.0
offline_announced = False
status("paused", "پل آماده است؛ CONTROL.txt آنلاین را برای شروع روی play بگذارید.")
print("DRIVE_CONTROL_READY: online Drive is authoritative; local folder is a synchronized mirror", flush=True)

while time.monotonic() < deadline:
    if not network_reachable():
        if not offline_announced:
            status("offline", "اینترنت یا Google Drive در دسترس نیست؛ هیچ فرمانی اجرا نمی‌شود.")
            print("DRIVE_CONTROL_NETWORK_PAUSED", flush=True)
            offline_announced = True
        time.sleep(60)
        continue
    if offline_announced:
        print("DRIVE_CONTROL_NETWORK_RESUMED", flush=True)
        offline_announced = False
    control = read_control()
    if control == "stop":
        status("stopped", "CONTROL.txt آنلاین روی stop قرار گرفت؛ پل خاتمه یافت.")
        print("DRIVE_CONTROL_STOPPED", flush=True)
        break
    if control == "pause":
        if time.monotonic() >= last_heartbeat:
            status("paused", "CONTROL.txt روی pause است؛ هیچ فرمان تازه‌ای اجرا نمی‌شود.")
            last_heartbeat = time.monotonic() + 30
        time.sleep(POLL_SECONDS)
        continue
    try:
        command_text = read_stable(COMMAND_PATH)
        payload_bytes = read_stable(PAYLOAD_PATH, binary=True)
        if len(payload_bytes) > MAX_PAYLOAD_BYTES:
            raise ValueError("PAYLOAD.py بزرگ‌تر از یک مگابایت است")
        command = json.loads(command_text)
        if not isinstance(command, dict):
            raise ValueError("COMMAND.json باید object باشد")
        if command.get("state") != "ready":
            if time.monotonic() >= last_heartbeat:
                status("waiting", "فرمان ready آنلاین وجود ندارد.")
                last_heartbeat = time.monotonic() + 30
            time.sleep(POLL_SECONDS)
            continue
        command_id = str(command.get("commandId") or "")
        if command_id in processed:
            if time.monotonic() >= last_heartbeat:
                status("waiting", "فرمان جاری قبلاً پردازش شده است.", command_id)
                last_heartbeat = time.monotonic() + 30
            time.sleep(POLL_SECONDS)
            continue
        validated = validate_command(command, payload_bytes, last_revision)
        if validated is None:
            time.sleep(POLL_SECONDS)
            continue
        command_id, revision, timeout_seconds, payload_hash = validated
        # Receipt پیش از اجرا در Drive mirror نوشته می‌شود و هم‌زمان رویداد آن به D1 می‌رود.
        status("accepted", "فرمان پایدار، تازه و دارای hash صحیح پذیرفته شد.", command_id, revision=revision, payloadSha256=payload_hash)
        processed.add(command_id)
        last_revision = revision
        should_stop = run_payload(command, payload_bytes, command_id, revision, timeout_seconds, payload_hash)
        if should_stop:
            break
    except (FileNotFoundError, json.JSONDecodeError, UnicodeDecodeError, OSError, RuntimeError, ValueError) as exc:
        message = f"فرمان اجرا نشد: {type(exc).__name__}: {exc}"
        status("rejected", message)
        print("DRIVE_CONTROL_COMMAND_REJECTED: " + message, flush=True)
        time.sleep(POLL_SECONDS)
    except BaseException as exc:
        message = f"خطای غیرمنتظره controller: {type(exc).__name__}: {exc}"
        status("error", message, traceback=traceback.format_exc()[-4000:])
        print("DRIVE_CONTROL_ERROR: " + message, flush=True)
        time.sleep(POLL_SECONDS)
else:
    status("stopped", "مدت فعال‌بودن پل به پایان رسید.")
    print("DRIVE_CONTROL_DURATION_FINISHED", flush=True)

print("SERVICE_COMPLETED: پل کنترل مستقیم Drive خاتمه یافت", flush=True)
`;
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
  let nextPromptDriveUrl = "";
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
    nextPromptDriveUrl = httpsUrl(input.nextPromptDriveUrl);
    if (new URL(nextPromptDriveUrl).hostname !== "drive.google.com") {
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
      `- لینک Google Drive: ${nextPromptDriveUrl}`,
      `- نام فایل: NextPrompt.txt`,
      "- فایل را با عملیات جایگزینی کامل (overwrite/replace) ذخیره کن؛ append ممنوع است.",
      "- قبل از ذخیره، محتوای قبلی را حذف کن تا فایل همیشه فقط یک پرامپت داشته باشد.",
      "- متن فایل باید مستقیم قابل ارسال به Arena باشد؛ عنوان، تاریخ، توضیح جانبی و حصار Markdown ننویس.",
      "- اگر هیچ مرحله بعدی لازم نیست، NextPrompt.txt را تغییر نده و فایل کنترل را روی stop بگذار.",
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

  prompts = prompts.map((prompt) => withAgentOutputProtocol(prompt, sourceMode === "next_file", nextPromptDriveUrl));

  const arena = await getAutomation(ARENA_JOB_NAME.replace(/^job_/, "").replace(/\.py$/, ""), true);
  if (!arena.activeVersion?.sourceCode) throw new AppError("نسخه فعال Arena وجود ندارد.", { status: 409, code: "arena_version_missing" });
  const batchRunId = `service-batch-${Date.now().toString(36)}`;
  let source = buildArenaJobFile({
    source: arena.activeVersion.sourceCode,
    prompt: prompts[0],
    telegramMode: "off",
    requestId: batchRunId,
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

  const networkCheckpointAnchor = `def wait_for_network():\n    \"\"\"`;
  if (!source.includes(networkCheckpointAnchor)) {
    throw new AppError("checkpoint پایش کنترل برای Arena پیدا نشد.", { status: 409, code: "service_control_checkpoint_missing" });
  }
  source = source.replace(networkCheckpointAnchor, `def wait_for_network(check_pause=True):\n    service_control_checkpoint(block_on_pause=check_pause)\n    \"\"\"`);
  for (const functionName of ["wait_for_security_verification_clear", "wait_for_arena_completion"]) {
    const functionStart = source.indexOf(`def ${functionName}(`);
    const functionEnd = functionStart < 0 ? -1 : source.indexOf("\ndef ", functionStart + 5);
    if (functionStart < 0 || functionEnd < 0) {
      throw new AppError(`تابع پایش ${functionName} برای کنترل pause پیدا نشد.`, { status: 409, code: "service_pause_monitor_upgrade_failed" });
    }
    const section = source.slice(functionStart, functionEnd).replaceAll("wait_for_network()", "wait_for_network(check_pause=False)");
    source = source.slice(0, functionStart) + section + source.slice(functionEnd);
  }
  source = source.replace("        time.sleep(NETWORK_RECHECK_SECONDS)\n", "        service_interruptible_sleep(NETWORK_RECHECK_SECONDS)\n");
  source = source.replace("        time.sleep(8)\n        wait_for_network(check_pause=False)\n", "        service_interruptible_sleep(8, block_on_pause=False)\n        wait_for_network(check_pause=False)\n");
  const wrappedFailureAnchor = "    except BaseException as exc:\n        elapsed = (datetime.now() - started_at).total_seconds()\n";
  if (!source.includes(wrappedFailureAnchor)) {
    throw new AppError("بخش توقف کنترل‌شده Arena پیدا نشد.", { status: 409, code: "service_control_stop_upgrade_failed" });
  }
  source = source.replace(
    wrappedFailureAnchor,
    "    except ServiceStopRequested:\n        raise\n    except BaseException as exc:\n        elapsed = (datetime.now() - started_at).total_seconds()\n",
  );

  const originalEntry = `if __name__ == "__main__":\n    main()\n`;
  const batchEntry = `import base64\nimport threading\n\nPROMPT_BATCH = ${JSON.stringify(prompts)}\nBATCH_ROUNDS = ${rounds}\nBATCH_MAX_ITEMS = ${total}\nBATCH_SOURCE_MODE = ${pythonString(sourceMode)}\nBATCH_RUN_ID = ${pythonString(batchRunId)}\nNEXT_PROMPT_FILE = ${pythonString(nextPromptPath)}\nCONTROL_FILE = ${pythonString(CONTROL_FILE_PATH)}\nMESSAGE_FILE = ${pythonString(MESSAGE_FILE_PATH)}\nREPORT_FILE = ${pythonString(REPORT_FILE_PATH)}\nAGENT_OUTPUT_PROTOCOL = ${pythonString(agentOutputProtocol(sourceMode === "next_file", nextPromptDriveUrl))}\nNEXT_PROMPT_POLL_SECONDS = 3\nNEXT_PROMPT_STABLE_READS = 3\nNEXT_PROMPT_MAX_BYTES = 65536\nNEXT_PROMPT_MAX_CHARS = 4000\nNEXT_PROMPT_STOP_TOKEN = \"[[STOP]]\"\nBATCH_DELAY_SECONDS = ${delay}\nBATCH_STOP_ON_ERROR = True\nBATCH_NETWORK_ACCEPTANCE = ${boolField(input, "networkAcceptance", false) ? "True" : "False"}\nBATCH_UNRECOVERABLE_ACCEPTANCE = ${boolField(input, "unrecoverableAcceptance", false) ? "True" : "False"}\nSERVICE_ARENA_SESSION_OPENED = False\nNEXT_PROMPT_REJECTED_HASHES = set()\nSERVICE_CONTROL_STATE = \"play\"\nSERVICE_CONTROL_REPORTED = \"play\"\nSERVICE_STOP_EVENT = threading.Event()\nSERVICE_MONITOR_STOP_EVENT = threading.Event()\nSERVICE_REPORT_LOCK = threading.Lock()\nSERVICE_MESSAGE_HASH = None\nSERVICE_REPORT_HASH = None\nSERVICE_REPORT_COUNT = 0\nSERVICE_REPORT_ITEM = 0\nSERVICE_CURRENT_ITEM = 0\nSERVICE_FILE_CANDIDATES = {}\n\nclass ServiceStopRequested(Exception):\n    pass\n\ndef service_read_text_file(path, max_bytes=65536):\n    try:\n        before = os.stat(path)\n        if before.st_size > max_bytes:\n            return None, None, \"too_large\"\n        with open(path, \"rb\") as handle:\n            raw = handle.read(max_bytes + 1)\n        after = os.stat(path)\n    except FileNotFoundError:\n        return None, None, \"missing\"\n    except OSError as exc:\n        return None, None, \"read_error:\" + str(exc)\n    if len(raw) > max_bytes:\n        return None, None, \"too_large\"\n    if before.st_size != after.st_size or getattr(before, \"st_mtime_ns\", 0) != getattr(after, \"st_mtime_ns\", 0):\n        return None, None, \"changed_while_reading\"\n    if not raw:\n        return \"\", hashlib.sha256(raw).hexdigest(), \"ok\"\n    text = None\n    encodings = (\"utf-16\", \"utf-8-sig\", \"cp1256\") if raw.startswith((b\"\\xff\\xfe\", b\"\\xfe\\xff\")) else (\"utf-8-sig\", \"cp1256\")\n    for encoding in encodings:\n        try:\n            text = raw.decode(encoding)\n            break\n        except UnicodeError:\n            continue\n    if text is None:\n        return None, None, \"decode_error\"\n    text = text.replace(chr(13) + chr(10), chr(10)).replace(chr(13), chr(10)).strip()\n    return text, hashlib.sha256(text.encode(\"utf-8\")).hexdigest(), \"ok\"\n\ndef service_atomic_write(path, text):\n    parent = os.path.dirname(path)\n    if not parent or not os.path.isdir(parent):\n        raise RuntimeError(\"پوشه فایل همگام‌شده پیدا نشد: \" + parent)\n    temp_path = path + f\".management-{os.getpid()}.tmp\"\n    payload = text.encode(\"utf-8\")\n    try:\n        with open(temp_path, \"wb\") as handle:\n            handle.write(payload)\n        os.replace(temp_path, path)\n    except OSError:\n        try:\n            if os.path.exists(temp_path):\n                os.remove(temp_path)\n            with open(path, \"wb\") as handle:\n                handle.write(payload)\n        except OSError as exc:\n            raise RuntimeError(\"نوشتن امن فایل همگام‌شده ممکن نشد: \" + str(exc)) from exc\n\ndef service_stable_text(path, label, max_bytes=65536):\n    text, digest, status = service_read_text_file(path, max_bytes)\n    if status != \"ok\":\n        SERVICE_FILE_CANDIDATES.pop(label, None)\n        return None, None, status\n    previous = SERVICE_FILE_CANDIDATES.get(label)\n    reads = previous[1] + 1 if previous and previous[0] == digest else 1\n    SERVICE_FILE_CANDIDATES[label] = (digest, reads)\n    if reads < 2:\n        return None, digest, \"stabilizing\"\n    return text, digest, \"ok\"\n\ndef service_emit_report(content, digest, item_number):\n    global SERVICE_REPORT_COUNT, SERVICE_REPORT_HASH, SERVICE_REPORT_ITEM\n    with SERVICE_REPORT_LOCK:\n        if digest == SERVICE_REPORT_HASH:\n            return\n        SERVICE_REPORT_COUNT += 1\n        SERVICE_REPORT_HASH = digest\n        SERVICE_REPORT_ITEM = item_number\n        report_index = SERVICE_REPORT_COUNT\n    report_id = f\"report-{report_index}-{digest[:12]}\"\n    safe_request = \"\".join(ch if ch.isalnum() or ch in \"-_\" else \"_\" for ch in PROMPT_REQUEST_ID)\n    report_dir = os.path.join(os.path.dirname(SCREENSHOT_DIR), \"logs\", \"agent-reports\")\n    os.makedirs(report_dir, exist_ok=True)\n    report_path = os.path.join(report_dir, f\"agent-report-{safe_request}-{digest[:12]}.md\")\n    with open(report_path, \"w\", encoding=\"utf-8\", newline=chr(10)) as handle:\n        handle.write(content + chr(10))\n    register_step_artifact(report_path, f\"agent-report-{report_id}\", kind=\"agent-report\", mime_type=\"text/markdown\")\n    encoded = base64.b64encode(content.encode(\"utf-8\")).decode(\"ascii\")\n    chunks = [encoded[index:index + 1200] for index in range(0, len(encoded), 1200)] or [\"\"]\n    meta = {\"id\": report_id, \"index\": report_index, \"item\": item_number, \"parts\": len(chunks), \"chars\": len(content), \"sha256\": digest, \"name\": os.path.basename(report_path)}\n    print(\"SERVICE_AGENT_REPORT_BEGIN: \" + json.dumps(meta, ensure_ascii=False))\n    for part, chunk in enumerate(chunks, 1):\n        print(f\"SERVICE_AGENT_REPORT_CHUNK: {report_id}:{part}/{len(chunks)}:{chunk}\")\n    print(\"SERVICE_AGENT_REPORT_END: \" + json.dumps(meta, ensure_ascii=False))\n\ndef service_scan_companion_files():\n    global SERVICE_CONTROL_STATE, SERVICE_CONTROL_REPORTED, SERVICE_MESSAGE_HASH\n    message, message_hash, message_status = service_stable_text(MESSAGE_FILE, \"message\", 4096)\n    if message_status == \"ok\" and message and message_hash != SERVICE_MESSAGE_HASH:\n        SERVICE_MESSAGE_HASH = message_hash\n        one_line = \" \".join(message.split())[:300]\n        print(\"SERVICE_AGENT_DIRECT_MESSAGE: \" + one_line)\n    report, report_hash, report_status = service_stable_text(REPORT_FILE, \"report\", 131072)\n    if report_status == \"ok\" and report and report_hash != SERVICE_REPORT_HASH:\n        service_emit_report(report, report_hash, SERVICE_CURRENT_ITEM)\n    control, _, control_status = service_stable_text(CONTROL_FILE, \"control\", 128)\n    if control_status == \"ok\":\n        normalized = control.casefold().strip()\n        if normalized in (\"play\", \"pause\", \"stop\") and normalized != SERVICE_CONTROL_STATE:\n            SERVICE_CONTROL_STATE = normalized\n            print(\"SERVICE_CONTROL_CHANGED: \" + normalized)\n        elif normalized not in (\"play\", \"pause\", \"stop\") and normalized:\n            print(\"SERVICE_CONTROL_INVALID: مقدار فایل کنترل باید فقط play، pause یا stop باشد\")\n    if SERVICE_CONTROL_STATE == \"stop\":\n        SERVICE_STOP_EVENT.set()\n    if SERVICE_CONTROL_STATE == \"pause\" and SERVICE_CONTROL_REPORTED != \"pause\":\n        print(\"SERVICE_HUMAN_INTERVENTION_REQUIRED: \" + json.dumps({\"reason\": \"agent_requested_pause\", \"requestId\": PROMPT_REQUEST_ID, \"message\": \"Agent همکار با فایل کنترل درخواست مداخله انسانی کرد.\", \"guidance\": \"پس از انجام مداخله، مقدار play-puase-stop.txt را در Drive به play تغییر دهید؛ اتوماسیون خودکار ادامه می‌یابد.\"}, ensure_ascii=False))\n        SERVICE_CONTROL_REPORTED = \"pause\"\n    elif SERVICE_CONTROL_STATE == \"play\" and SERVICE_CONTROL_REPORTED == \"pause\":\n        print(\"SERVICE_HUMAN_INTERVENTION_CLEARED: \" + json.dumps({\"reason\": \"agent_requested_pause\", \"requestId\": PROMPT_REQUEST_ID, \"message\": \"فایل کنترل دوباره روی play قرار گرفت؛ ادامه از checkpoint امن.\"}, ensure_ascii=False))\n        SERVICE_CONTROL_REPORTED = \"play\"\n\ndef service_companion_monitor():\n    while not SERVICE_MONITOR_STOP_EVENT.is_set():\n        try:\n            service_scan_companion_files()\n        except Exception as exc:\n            print(\"SERVICE_COMPANION_MONITOR_RETRY: \" + str(exc))\n        SERVICE_MONITOR_STOP_EVENT.wait(1.5)\n\ndef service_control_checkpoint(block_on_pause=True):\n    while True:\n        if SERVICE_STOP_EVENT.is_set() or SERVICE_CONTROL_STATE == \"stop\":\n            raise ServiceStopRequested(\"Agent همکار وضعیت کنترل را روی stop قرار داد\")\n        if SERVICE_CONTROL_STATE != \"pause\" or not block_on_pause:\n            return\n        time.sleep(1)\n\ndef service_interruptible_sleep(seconds, block_on_pause=True):\n    deadline = time.monotonic() + max(0, seconds)\n    while time.monotonic() < deadline:\n        service_control_checkpoint(block_on_pause=block_on_pause)\n        time.sleep(min(1, max(0, deadline - time.monotonic())))\n\ndef service_wait_for_report_update(item_number, previous_count):\n    deadline = time.monotonic() + 20\n    while time.monotonic() < deadline and SERVICE_REPORT_COUNT <= previous_count:\n        service_scan_companion_files()\n        if SERVICE_REPORT_COUNT > previous_count:\n            return True\n        service_interruptible_sleep(1)\n    if SERVICE_REPORT_COUNT <= previous_count:\n        print(f\"SERVICE_AGENT_REPORT_MISSING: گزارش تازه‌ای برای پرامپت {item_number} دریافت نشد؛ طبق حالت best-effort ادامه می‌دهیم\")\n        return False\n    return True\n\ndef service_prepare_companion_files():\n    global SERVICE_MESSAGE_HASH, SERVICE_REPORT_HASH, SERVICE_CONTROL_STATE, SERVICE_CONTROL_REPORTED\n    service_atomic_write(CONTROL_FILE, \"play\")\n    service_atomic_write(MESSAGE_FILE, \"\")\n    report, report_hash, report_status = service_read_text_file(REPORT_FILE, 131072)\n    SERVICE_REPORT_HASH = report_hash if report_status == \"ok\" and report else None\n    SERVICE_MESSAGE_HASH = hashlib.sha256(b\"\").hexdigest()\n    SERVICE_CONTROL_STATE = \"play\"\n    SERVICE_CONTROL_REPORTED = \"play\"\n    print(\"SERVICE_COMPANION_FILES_READY: کنترل روی play و پیام زنده خالی شد؛ گزارش قدیمی به‌عنوان خط پایه ثبت شد\")\n    threading.Thread(target=service_companion_monitor, name=\"arena-companion-monitor\", daemon=True).start()\n\ndef service_read_next_prompt_file():\n    try:\n        before = os.stat(NEXT_PROMPT_FILE)\n        if before.st_size > NEXT_PROMPT_MAX_BYTES:\n            return None, None, \"too_large\"\n        with open(NEXT_PROMPT_FILE, \"rb\") as handle:\n            raw = handle.read(NEXT_PROMPT_MAX_BYTES + 1)\n        after = os.stat(NEXT_PROMPT_FILE)\n    except FileNotFoundError:\n        return None, None, \"missing\"\n    except OSError as exc:\n        return None, None, \"read_error:\" + str(exc)\n    if len(raw) > NEXT_PROMPT_MAX_BYTES:\n        return None, None, \"too_large\"\n    if before.st_size != after.st_size or getattr(before, \"st_mtime_ns\", 0) != getattr(after, \"st_mtime_ns\", 0):\n        return None, None, \"changed_while_reading\"\n    if not raw:\n        return \"\", hashlib.sha256(raw).hexdigest(), \"ok\"\n    text = None\n    for encoding in (\"utf-8-sig\", \"utf-16\", \"cp1256\"):\n        try:\n            text = raw.decode(encoding)\n            break\n        except UnicodeError:\n            continue\n    if text is None:\n        return None, None, \"decode_error\"\n    text = text.replace(chr(13) + chr(10), chr(10)).replace(chr(13), chr(10)).strip()\n    digest = hashlib.sha256(text.encode(\"utf-8\")).hexdigest()\n    return text, digest, \"ok\"\n\ndef service_clear_next_prompt_file(reason):\n    parent = os.path.dirname(NEXT_PROMPT_FILE)\n    if not parent or not os.path.isdir(parent):\n        raise RuntimeError(\"پوشه فایل همگام‌شده NextPrompt در ویندوز پیدا نشد: \" + parent)\n    previous_text, previous_hash, previous_status = service_read_next_prompt_file()\n    if previous_status == \"ok\" and previous_text:\n        NEXT_PROMPT_REJECTED_HASHES.add(previous_hash)\n    temp_path = NEXT_PROMPT_FILE + f\".management-{os.getpid()}.tmp\"\n    try:\n        with open(temp_path, \"wb\"):\n            pass\n        os.replace(temp_path, NEXT_PROMPT_FILE)\n    except OSError:\n        try:\n            if os.path.exists(temp_path):\n                os.remove(temp_path)\n            with open(NEXT_PROMPT_FILE, \"wb\"):\n                pass\n        except OSError as exc:\n            raise RuntimeError(\"پاک‌کردن امن فایل NextPrompt ممکن نشد: \" + str(exc)) from exc\n    check_text, _, check_status = service_read_next_prompt_file()\n    if check_status != \"ok\" or check_text != \"\":\n        raise RuntimeError(\"فایل NextPrompt پس از پاک‌سازی خالی نماند\")\n    print(f\"SERVICE_NEXT_PROMPT_FILE_CLEARED: {reason}\")\n\ndef service_prepare_next_prompt_file():\n    text, digest, status = service_read_next_prompt_file()\n    if status == \"ok\" and text:\n        NEXT_PROMPT_REJECTED_HASHES.add(digest)\n        print(\"SERVICE_NEXT_PROMPT_STALE_REMOVED: محتوای قدیمی پیش از شروع حذف شد\")\n    service_clear_next_prompt_file(\"startup\")\n    stable_empty = 0\n    deadline = time.monotonic() + 60\n    while stable_empty < 2:\n        time.sleep(NEXT_PROMPT_POLL_SECONDS)\n        text, digest, status = service_read_next_prompt_file()\n        if status == \"ok\" and text == \"\":\n            stable_empty += 1\n            continue\n        stable_empty = 0\n        if status == \"ok\" and text:\n            NEXT_PROMPT_REJECTED_HASHES.add(digest)\n            print(\"SERVICE_NEXT_PROMPT_STALE_REMOVED: همگام‌سازی محتوای قدیمی را برگرداند؛ دوباره حذف شد\")\n            service_clear_next_prompt_file(\"stale-sync-return\")\n        elif status == \"missing\":\n            service_clear_next_prompt_file(\"recreate-missing\")\n        if time.monotonic() >= deadline:\n            raise RuntimeError(\"فایل NextPrompt طی یک دقیقه به حالت خالی و پایدار نرسید\")\n    print(\"SERVICE_NEXT_PROMPT_FILE_READY: فایل خالی و پایدار است\")\n\ndef service_wait_for_next_prompt(item_number):\n    print(f\"SERVICE_NEXT_PROMPT_WAITING: {item_number}/{BATCH_MAX_ITEMS}\")\n    candidate_hash = None\n    stable_reads = 0\n    last_status = None\n    last_wait_report = time.monotonic()\n    while True:\n        wait_for_network()\n        text, digest, status = service_read_next_prompt_file()\n        if status == \"ok\" and text:\n            if digest in NEXT_PROMPT_REJECTED_HASHES:\n                if last_status != \"duplicate\":\n                    print(\"SERVICE_NEXT_PROMPT_DUPLICATE_IGNORED: محتوای قدیمی یا تکراری حذف شد\")\n                service_clear_next_prompt_file(\"duplicate\")\n                candidate_hash = None\n                stable_reads = 0\n                last_status = \"duplicate\"\n                continue\n            if digest != candidate_hash:\n                candidate_hash = digest\n                stable_reads = 1\n                print(f\"SERVICE_NEXT_PROMPT_CHANGE_DETECTED: {item_number}/{BATCH_MAX_ITEMS} hash={digest[:12]} chars={len(text)}\")\n            else:\n                stable_reads += 1\n            last_status = \"candidate\"\n            if stable_reads >= NEXT_PROMPT_STABLE_READS:\n                if len(text) < 2 or len(text) > NEXT_PROMPT_MAX_CHARS:\n                    raise RuntimeError(f\"محتوای پایدار NextPrompt باید بین ۲ تا {NEXT_PROMPT_MAX_CHARS} نویسه باشد\")\n                NEXT_PROMPT_REJECTED_HASHES.add(digest)\n                service_clear_next_prompt_file(f\"consumed-{item_number}\")\n                if text == NEXT_PROMPT_STOP_TOKEN:\n                    print(f\"SERVICE_NEXT_PROMPT_STOP: {item_number}/{BATCH_MAX_ITEMS}\")\n                    return None\n                print(f\"SERVICE_NEXT_PROMPT_CONSUMED: {item_number}/{BATCH_MAX_ITEMS} hash={digest[:12]} chars={len(text)}\")\n                capture_named_step(f\"next-prompt-{item_number}-consumed\")\n                return text + chr(10) + chr(10) + \"---\" + chr(10) + chr(10) + AGENT_OUTPUT_PROTOCOL\n        else:\n            if status not in (\"ok\", \"missing\", \"changed_while_reading\") and status != last_status:\n                print(\"SERVICE_NEXT_PROMPT_READ_RETRY: \" + status)\n            candidate_hash = None\n            stable_reads = 0\n            last_status = status\n        now = time.monotonic()\n        if now - last_wait_report >= 60:\n            print(f\"SERVICE_NEXT_PROMPT_STILL_WAITING: {item_number}/{BATCH_MAX_ITEMS}\")\n            last_wait_report = now\n        time.sleep(NEXT_PROMPT_POLL_SECONDS)\n\ndef service_confirm_result_yes():\n    for attempt in range(1, DIALOG_CHECK_ATTEMPTS + 1):\n        wait_for_network()\n        wait_for_security_verification_clear(stage=\"before-result-confirmation\")\n        capture_named_step(\"result-confirmation-before\")\n        output = run_hidden_powershell(DIALOG_PS_SCRIPT, timeout=60)\n        if \"ARENA_DIALOG_CLICKED\" in output:\n            print(\"SERVICE_BATCH_RESULT_YES: نتیجه با گزینه Yes تأیید شد\")\n            time.sleep(DIALOG_CLICK_WAIT)\n            capture_named_step(\"result-confirmation-after\")\n            return\n        if \"ARENA_DIALOG_FOUND_BUT_NO_YES\" in output:\n            raise RuntimeError(\"پنجره پایان Arena دیده شد اما گزینه Yes قابل کلیک نبود\")\n        if attempt < DIALOG_CHECK_ATTEMPTS:\n            time.sleep(DIALOG_CHECK_GAP)\n    raise RuntimeError(\"پنجره پایان Arena برای تأیید Yes پیدا نشد\")\n\ndef batch_main():\n    global PROMPT_TEXT, PROMPT_REQUEST_ID, FAILURE_INTERVENTION_REPORTED_FOR, SERVICE_CURRENT_ITEM\n    completed = 0\n    failures = 0\n    total = BATCH_MAX_ITEMS if BATCH_SOURCE_MODE == \"next_file\" else len(PROMPT_BATCH) * BATCH_ROUNDS\n    if not OCR_PYTHON or not OCR_HELPER or not os.path.isfile(OCR_PYTHON) or not os.path.isfile(OCR_HELPER):\n        raise RuntimeError(\"PaddleOCR محلی Windows Agent برای این سرویس آماده نیست\")\n    print(\"SERVICE_OCR_READY: مسیرهای PaddleOCR محلی تأیید شد\")\n    service_prepare_companion_files()\n    print(\"SERVICE_MONITORING_PLAN_ACTIVE: کنترل play/pause/stop، پیام زنده، گزارش Markdown، تصاویر مرحله‌ای و تکمیل Arena پایش می‌شوند\")\n    if BATCH_SOURCE_MODE == \"next_file\":\n        print(\"SERVICE_NEXT_PROMPT_MODE_READY: پایش فایل همگام‌شده فعال شد\")\n        service_prepare_next_prompt_file()\n    if BATCH_NETWORK_ACCEPTANCE:\n        print(\"SERVICE_ACCEPTANCE_DISCONNECT_NOW: اینترنت را اکنون قطع کنید؛ شروع تعامل Arena سی ثانیه دیگر است\")\n        time.sleep(30)\n    if BATCH_UNRECOVERABLE_ACCEPTANCE:\n        print(\"SERVICE_ACCEPTANCE_UNRECOVERABLE_WAIT: انتظار برای بازگشت شبکه بدون تعامل Arena\")\n        wait_for_network()\n        raise RuntimeError(\"SERVICE_ACCEPTANCE_UNRECOVERABLE: checkpoint پس از اتصال مجدد قابل ادامه نیست\")\n    manual_items = [item for _round in range(BATCH_ROUNDS) for item in PROMPT_BATCH]\n    next_prompt = PROMPT_BATCH[0]\n    for item_number in range(1, total + 1):\n        if BATCH_SOURCE_MODE == \"next_file\":\n            prompt_text = next_prompt\n        else:\n            prompt_text = manual_items[item_number - 1]\n        PROMPT_REQUEST_ID = f\"{BATCH_RUN_ID}-p{item_number}\"\n        tracking_marker = f\"[شناسه رهگیری مدیریت — نیازی به اقدام نیست: {PROMPT_REQUEST_ID}]\"\n        PROMPT_TEXT = prompt_text.rstrip() + chr(10) + chr(10) + tracking_marker\n        SERVICE_CURRENT_ITEM = item_number\n        report_count_before = SERVICE_REPORT_COUNT\n        print(f\"SERVICE_BATCH_ITEM_STARTED: {item_number}/{total}\")\n        try:\n            main()\n        except ServiceStopRequested as exc:\n            print(\"SERVICE_CONTROL_STOPPED: \" + str(exc))\n            break\n        except Exception as exc:\n            failures += 1\n            print(f\"SERVICE_BATCH_ITEM_FAILED: {item_number}/{total}: {exc}\")\n            if BATCH_STOP_ON_ERROR:\n                raise\n        else:\n            try:\n                wait_for_network()\n                service_confirm_result_yes()\n            except ServiceStopRequested as exc:\n                print(\"SERVICE_CONTROL_STOPPED: \" + str(exc))\n                break\n            except Exception as exc:\n                detail = f\"تأیید نتیجه پرامپت {item_number}/{total} ناموفق بود: {exc}\"\n                artifacts = save_failure_artifacts(detail + chr(10) + traceback.format_exc())\n                print(\"SERVICE_HUMAN_INTERVENTION_REQUIRED: \" + json.dumps({\n                    \"reason\": \"arena_result_confirmation_failure\",\n                    \"requestId\": PROMPT_REQUEST_ID,\n                    \"message\": detail,\n                    \"artifactPaths\": artifacts,\n                    \"guidance\": \"اجرای ترتیبی بدون رفتن به پرامپت بعدی متوقف شد.\",\n                }, ensure_ascii=False))\n                FAILURE_INTERVENTION_REPORTED_FOR = PROMPT_REQUEST_ID\n                send_telegram_status(\"نیازمند مداخله انسانی\", detail)\n                raise\n            try:\n                service_wait_for_report_update(item_number, report_count_before)\n            except ServiceStopRequested as exc:\n                print(\"SERVICE_CONTROL_STOPPED: \" + str(exc))\n                break\n            completed += 1\n            print(f\"SERVICE_BATCH_RESULT_CONFIRMED: {item_number}/{total}\")\n            print(f\"SERVICE_BATCH_ITEM_COMPLETED: {completed}/{total}\")\n        if item_number < total:\n            try:\n                service_interruptible_sleep(BATCH_DELAY_SECONDS)\n                if BATCH_SOURCE_MODE == \"next_file\":\n                    PROMPT_REQUEST_ID = f\"{BATCH_RUN_ID}-p{item_number + 1}\"\n                    next_prompt = service_wait_for_next_prompt(item_number + 1)\n                    if next_prompt is None:\n                        break\n            except ServiceStopRequested as exc:\n                print(\"SERVICE_CONTROL_STOPPED: \" + str(exc))\n                break\n    SERVICE_MONITOR_STOP_EVENT.set()\n    print(f\"SERVICE_BATCH_SUMMARY: موفق={completed} ناموفق={failures} مجموع={total}\")\n    if failures:\n        raise RuntimeError(f\"{failures} مورد از {total} پرامپت ناموفق بود\")\n    print(f\"SERVICE_COMPLETED: {completed} پرامپت کامل شد\")\n\nif __name__ == \"__main__\":\n    try:\n        batch_main()\n    except BaseException as exc:\n        if FAILURE_INTERVENTION_REPORTED_FOR != PROMPT_REQUEST_ID:\n            detail = f\"اجرای ترتیبی متوقف شد: {type(exc).__name__}: {exc}\"\n            artifacts = save_failure_artifacts(detail + chr(10) + traceback.format_exc())\n            print(\"SERVICE_HUMAN_INTERVENTION_REQUIRED: \" + json.dumps({\n                \"reason\": \"sequential_service_failure\",\n                \"requestId\": PROMPT_REQUEST_ID,\n                \"message\": detail,\n                \"artifactPaths\": artifacts,\n                \"guidance\": \"فرآیند بدون رفتن به پرامپت بعدی متوقف شد.\",\n            }, ensure_ascii=False))\n            send_telegram_status(\"نیازمند مداخله انسانی\", detail)\n        raise\n`;
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
  } else if (service.slug === "drive-control") {
    if (!boolField(input, "confirmed")) {
      throw new AppError("تأیید اجرای payload پوشه اختصاصی Drive الزامی است.", {
        status: 422,
        code: "service_drive_control_confirmation_required",
      });
    }
    const folderPath = typeof input.folderPath === "string" ? input.folderPath.trim() : "";
    if (
      folderPath.length < 10 || folderPath.length > 240 ||
      !/^[A-Za-z]:\\/.test(folderPath) || folderPath.includes("..") ||
      !folderPath.toLowerCase().endsWith("\\wndows-agent-management")
    ) {
      throw new AppError("مسیر پوشه اختصاصی Drive معتبر نیست یا به Wndows-Agent-Management ختم نمی‌شود.", {
        status: 422,
        code: "service_drive_control_path_invalid",
      });
    }
    const pollSeconds = numberField(input, "pollSeconds", 3, 60);
    const maxDurationHours = numberField(input, "maxDurationHours", 1, 168);
    const maxCommandMinutes = numberField(input, "maxCommandMinutes", 1, 120);
    source = driveControlSource(folderPath, pollSeconds, maxDurationHours, maxCommandMinutes);
    timeoutSeconds = Math.min(604_800, maxDurationHours * 3600 + 300);
    noProgressSeconds = 120;
    requiredCapabilities = ["d1_automations"];
    summary = `پل کنترل مستقیم پوشه Drive برای ${maxDurationHours} ساعت`;
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
    monitoringPlan: service.slug === "arena-batch" ? [
      "پایش پیوسته فایل play-puase-stop.txt و توقف امن روی pause یا stop",
      "نمایش زنده تغییرهای Message.txt به‌عنوان پیام مستقیم Agent همکار",
      "بایگانی مستقل هر نسخه تازه Complete MarkDown REPORT.md",
      "ثبت تصویر مرحله‌ای و ارائه لینک Google Drive برای هر تصویر",
      "تأیید ورود متن، ارسال واقعی، پایان پاسخ Arena و انتخاب Yes",
      input.promptSourceMode === "next_file"
        ? "پایش تغییر پایدار NextPrompt.txt و جلوگیری از محتوای قدیمی، ناقص یا تکراری"
        : "اجرای ترتیبی فهرست دستی بدون استفاده از NextPrompt.txt",
    ] : service.slug === "drive-control" ? [
      "Google Drive آنلاین منبع ایجاد COMMAND.json و PAYLOAD.py است؛ مسیر محلی فقط mirror همگام‌شده است",
      "هیچ فرمانی هنگام قطع اینترنت یا CONTROL=pause اجرا نمی‌شود",
      "اعتبار commandId، revision، انقضا و SHA-256 پیش از هر اجرا بررسی می‌شود",
      "هر payload در workspace جدا اجرا می‌شود و فایل پایه Agentها دست‌نخورده می‌ماند",
      "STATUS.json، RESULT.json، STDOUT.txt و STDERR.txt پس از هر مرحله overwrite می‌شوند",
      "رویدادهای receipt، heartbeat و نتیجه هم‌زمان در D1 ثبت می‌شوند",
    ] : undefined,
  });
  return { commandId: run.commandId, version: saved.version.version, service };
}
