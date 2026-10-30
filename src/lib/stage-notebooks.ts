import { AppError } from "./errors";
import { dbAll, dbFirst, dbRun } from "./db";
import { findOnlineCommandAgent, requestCommandCancellation } from "./commands";
import { requestAutomationRun, saveAutomationVersion } from "./automations";
import { arenaApiNotebookCells } from "./arena-api-notebook-template";

const STORE_KEY = "stage-notebooks.v1";
const ATTEMPT_STORE_KEY = "stage-notebook-attempts.v1";
const CONTROLLED_TEMPLATE_MARKER = "stage-notebook-controlled-template.v1";
const CONTROLLED_NOTEBOOK_ID = "controlled-windows-ui-diagnostic-v1";
const ARENA_API_NOTEBOOK_ID = "arena-api-prompt-submit-v1";
const MAX_NOTEBOOKS = 30;
const MAX_CELLS = 100;
const MAX_ATTEMPTS = 60;

export interface StageExecutionStep {
  at: string;
  phase: string;
  level: "info" | "success" | "error";
  message: string;
}

export interface StageExecutionAttempt {
  id: string;
  notebookId: string;
  cellId: string;
  runAll: boolean;
  status: "preparing" | "queued" | "failed";
  phase: string;
  message: string;
  commandId: string | null;
  automationVersion: number | null;
  agentName: string | null;
  agentVersion: string | null;
  createdAt: string;
  updatedAt: string;
  steps: StageExecutionStep[];
  commandStatus?: string | null;
  commandError?: string | null;
  commandLastEventAt?: string | null;
}

export interface StageCell {
  id: string;
  title: string;
  language: string;
  content: string;
  notes: string;
  transition: "manual" | "on_success";
  executionMode: "blocking" | "background";
  executable: boolean;
  commandId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StageNotebook {
  id: string;
  title: string;
  goal: string;
  chatbotGuide: string;
  cells: StageCell[];
  createdAt: string;
  updatedAt: string;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function load(): Promise<StageNotebook[]> {
  const row = await dbFirst<{ value: string }>("SELECT value FROM settings WHERE key = ?", [STORE_KEY]);
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_NOTEBOOKS).map((notebook: StageNotebook) => ({
      ...notebook,
      cells: Array.isArray(notebook.cells) ? notebook.cells.slice(0, MAX_CELLS).map((cell) => ({
        ...cell,
        executionMode: cell.executionMode === "background" ? "background" : "blocking",
      })) : [],
    }));
  } catch {
    return [];
  }
}

async function persist(items: StageNotebook[]): Promise<void> {
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [STORE_KEY, JSON.stringify(items), now],
  );
}

const CONTROLLED_MESSAGEBOX_CODE = `import ctypes

MB_OK = 0x00000000
MB_ICONINFORMATION = 0x00000040
MB_TOPMOST = 0x00040000
MB_SETFOREGROUND = 0x00010000

print("CONTROLLED_TEST_STARTED: MessageBox", flush=True)
result = ctypes.windll.user32.MessageBoxW(
    0,
    "این پنجره مستقیماً توسط سلول کنترل‌شده دفترچه نمایش داده شد.",
    "تست کنترل‌شده Windows Agent",
    MB_OK | MB_ICONINFORMATION | MB_TOPMOST | MB_SETFOREGROUND,
)
if result != 1:
    raise RuntimeError(f"MessageBox نتیجه نامعتبر داد: {result}")
print("CONTROLLED_TEST_PASSED: MessageBox visible and confirmed", flush=True)
`;

const CONTROLLED_APPS_CODE = `import ctypes
import os
import subprocess
import time

print("CONTROLLED_APPS_STARTED", flush=True)
notepad = subprocess.Popen(["notepad.exe"])
time.sleep(2)
if notepad.poll() is not None:
    raise RuntimeError("Notepad اجرا نشد یا بلافاصله بسته شد.")
print(f"CONTROLLED_NOTEPAD_OPENED: PID={notepad.pid}", flush=True)

os.startfile("https://www.microsoft.com/")
print("CONTROLLED_BROWSER_REQUESTED: https://www.microsoft.com/", flush=True)
time.sleep(2)

MB_OK = 0x00000000
MB_ICONINFORMATION = 0x00000040
MB_TOPMOST = 0x00040000
MB_SETFOREGROUND = 0x00010000
result = ctypes.windll.user32.MessageBoxW(
    0,
    "Notepad و سایت مایکروسافت باید باز شده باشند. برای پایان تست OK را بزنید.",
    "نتیجه تست کنترل‌شده",
    MB_OK | MB_ICONINFORMATION | MB_TOPMOST | MB_SETFOREGROUND,
)
if result != 1:
    raise RuntimeError(f"پیام نتیجه مقدار نامعتبر داد: {result}")
print("CONTROLLED_APPS_PASSED", flush=True)
`;

async function ensureControlledNotebook(): Promise<StageNotebook[]> {
  const items = await load();
  const now = new Date().toISOString();
  let changed = false;
  if (!items.some((item) => item.id === CONTROLLED_NOTEBOOK_ID)) {
    items.unshift({
      id: CONTROLLED_NOTEBOOK_ID,
      title: "تست کنترل‌شده رابط ویندوز",
      goal: "اثبات مستقل نمایش MessageBox، اجرای Notepad و بازشدن سایت مایکروسافت بدون API Key یا کتابخانه خارجی.",
      chatbotGuide: "این دفترچه تشخیصی است. ساختار دو سلول را حفظ کن و هیچ API Key یا کتابخانه خارجی به آن اضافه نکن.",
      createdAt: now,
      updatedAt: now,
      cells: [
        { id: "controlled-messagebox", title: "۱. نمایش MessageBox واقعی", language: "python", content: CONTROLLED_MESSAGEBOX_CODE, notes: "ابتدا فقط این سلول را اجرا کنید. باید پس از تأیید Windows Agent یک MessageBox دوم ببینید.", transition: "manual", executionMode: "blocking", executable: true, commandId: null, createdAt: now, updatedAt: now },
        { id: "controlled-apps", title: "۲. بازکردن Notepad و Microsoft", language: "python", content: CONTROLLED_APPS_CODE, notes: "پس از موفقیت سلول اول اجرا شود. به API Key، pyautogui یا فوکوس دستی نیاز ندارد.", transition: "manual", executionMode: "blocking", executable: true, commandId: null, createdAt: now, updatedAt: now },
      ],
    });
    changed = true;
  }
  if (!items.some((item) => item.id === ARENA_API_NOTEBOOK_ID)) {
    items.unshift({
      id: ARENA_API_NOTEBOOK_ID,
      title: "ارسال پرامپت بعدی API به Arena",
      goal: "دریافت امن API Key در دسکتاپ، خواندن nextPrompt، بازکردن لینک مشخص Arena در Chrome، انتظار برای توقف loading، Paste یک‌باره و Enter ساده برای Send/Submit.",
      chatbotGuide: "این دفترچه ایمنی سخت‌گیرانه دارد: API Key هرگز داخل کد یا لاگ قرار نگیرد؛ Prompt هنگام جست‌وجوی composer تکرار نشود؛ Ctrl+V فقط یک بار و Enter فقط بدون Shift/Ctrl/Alt اجرا شود. وضعیت‌های human و stop باید زنجیره را پیش از مرورگر متوقف کنند.",
      createdAt: now,
      updatedAt: now,
      cells: arenaApiNotebookCells().map((cell) => ({ ...cell, commandId: null, createdAt: now, updatedAt: now })),
    });
    changed = true;
  }
  if (changed) await persist(items);
  const marker = await dbFirst<{ value: string }>("SELECT value FROM settings WHERE key = ?", [CONTROLLED_TEMPLATE_MARKER]);
  if (marker?.value !== "seeded") {
    await dbRun(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, 'seeded', ?)
       ON CONFLICT(key) DO UPDATE SET value = 'seeded', updated_at = excluded.updated_at`,
      [CONTROLLED_TEMPLATE_MARKER, now],
    );
  }
  return items;
}

async function loadAttempts(): Promise<StageExecutionAttempt[]> {
  const row = await dbFirst<{ value: string }>("SELECT value FROM settings WHERE key = ?", [ATTEMPT_STORE_KEY]);
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ATTEMPTS) : [];
  } catch {
    return [];
  }
}

async function persistAttempts(items: StageExecutionAttempt[]): Promise<void> {
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [ATTEMPT_STORE_KEY, JSON.stringify(items.slice(0, MAX_ATTEMPTS)), now],
  );
}

async function startAttempt(notebookId: string, cellId: string, runAll: boolean): Promise<string> {
  const now = new Date().toISOString();
  const attempt: StageExecutionAttempt = {
    id: crypto.randomUUID(), notebookId, cellId, runAll,
    status: "preparing", phase: "request_received", message: "درخواست Play در مدیریت دریافت شد.",
    commandId: null, automationVersion: null, agentName: null, agentVersion: null,
    createdAt: now, updatedAt: now,
    steps: [{ at: now, phase: "request_received", level: "info", message: "درخواست Play در مدیریت دریافت شد." }],
  };
  const attempts = await loadAttempts();
  attempts.unshift(attempt);
  await persistAttempts(attempts);
  return attempt.id;
}

async function updateAttempt(id: string, patch: Partial<StageExecutionAttempt>, step?: Omit<StageExecutionStep, "at">): Promise<void> {
  const attempts = await loadAttempts();
  const attempt = attempts.find((item) => item.id === id);
  if (!attempt) return;
  Object.assign(attempt, patch, { updatedAt: new Date().toISOString() });
  if (step) attempt.steps = [...attempt.steps.slice(-29), { ...step, at: new Date().toISOString() }];
  await persistAttempts(attempts);
}

function executionError(error: unknown): { message: string; code: string; hint: string } {
  if (error instanceof AppError) {
    const detail = Array.isArray(error.details)
      ? error.details.map((item) => item && typeof item === "object" && "message" in item ? String((item as { message: unknown }).message) : "").filter(Boolean).slice(0, 3).join("؛ ")
      : typeof error.details === "string" ? error.details.slice(0, 800) : "";
    return { message: [error.message, detail].filter(Boolean).join(" — "), code: error.code, hint: error.hint ?? "" };
  }
  return { message: error instanceof Error ? error.message : String(error), code: "unexpected_error", hint: "" };
}

export async function listStageExecutionAttempts(): Promise<StageExecutionAttempt[]> {
  const attempts = await loadAttempts();
  const ids = attempts.map((item) => item.commandId).filter((id): id is string => Boolean(id));
  if (!ids.length) return attempts;
  const placeholders = ids.map(() => "?").join(",");
  const rows = await dbAll<{ id: string; status: string; error: string | null; last_event_at: string | null }>(
    `SELECT id, status, error, last_event_at FROM commands WHERE id IN (${placeholders})`, ids,
  );
  const commands = new Map(rows.map((row) => [row.id, row]));
  return attempts.map((attempt) => {
    const command = attempt.commandId ? commands.get(attempt.commandId) : undefined;
    return command ? { ...attempt, commandStatus: command.status, commandError: command.error, commandLastEventAt: command.last_event_at } : attempt;
  });
}

export async function listStageNotebooks(): Promise<StageNotebook[]> {
  return ensureControlledNotebook();
}

export async function createStageNotebook(input: unknown): Promise<StageNotebook> {
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const title = text(body.title, 120);
  if (title.length < 2) throw new AppError("نام دفترچه باید حداقل دو نویسه باشد.", { status: 422, code: "notebook_title_invalid" });
  const items = await load();
  if (items.length >= MAX_NOTEBOOKS) throw new AppError("حداکثر ۳۰ دفترچه قابل نگهداری است.", { status: 422, code: "notebook_limit" });
  const now = new Date().toISOString();
  const notebook: StageNotebook = {
    id: crypto.randomUUID(), title, goal: text(body.goal, 4000),
    chatbotGuide: text(body.chatbotGuide, 8000) || "نقش تو راهنمای مرحله‌ای است. فقط مرحله بعدی لازم را با کد کامل، معیار موفقیت و چیزی که باید در اسکرین‌شات بررسی شود ارائه کن. بر اساس خروجی و تصویر مرحله قبل تصمیم بگیر و از تکرار مرحله‌های موفق خودداری کن.",
    cells: [], createdAt: now, updatedAt: now,
  };
  items.unshift(notebook);
  await persist(items);
  return notebook;
}

export async function updateStageNotebook(id: string, input: unknown): Promise<StageNotebook> {
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const items = await load();
  const notebook = items.find((item) => item.id === id);
  if (!notebook) throw new AppError("دفترچه پیدا نشد.", { status: 404, code: "notebook_not_found" });
  if (body.addCell) {
    if (notebook.cells.length >= MAX_CELLS) throw new AppError("حداکثر ۱۰۰ مرحله قابل ثبت است.", { status: 422, code: "cell_limit" });
    const now = new Date().toISOString();
    notebook.cells.push({ id: crypto.randomUUID(), title: `مرحله ${notebook.cells.length + 1}`, language: "python", content: "", notes: "", transition: "manual", executionMode: "blocking", executable: true, commandId: null, createdAt: now, updatedAt: now });
  }
  if (typeof body.deleteCell === "string") {
    const index = notebook.cells.findIndex((item) => item.id === body.deleteCell);
    if (index < 0) throw new AppError("مرحله پیدا نشد.", { status: 404, code: "cell_not_found" });
    notebook.cells.splice(index, 1);
  }
  if (body.moveCell && typeof body.moveCell === "object") {
    const move = body.moveCell as Record<string, unknown>;
    const index = notebook.cells.findIndex((item) => item.id === move.id);
    const target = move.direction === "up" ? index - 1 : move.direction === "down" ? index + 1 : index;
    if (index < 0 || target < 0 || target >= notebook.cells.length) {
      throw new AppError("جابجایی مرحله در این جهت ممکن نیست.", { status: 422, code: "cell_move_invalid" });
    }
    const [cell] = notebook.cells.splice(index, 1);
    notebook.cells.splice(target, 0, cell);
  }
  if (Array.isArray(body.replaceCells)) {
    if (body.replaceCells.length > MAX_CELLS) throw new AppError("حداکثر ۱۰۰ مرحله قابل ثبت است.", { status: 422, code: "cell_limit" });
    const existing = new Map(notebook.cells.map((cell) => [cell.id, cell]));
    const now = new Date().toISOString();
    notebook.cells = body.replaceCells.map((value, index) => {
      const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const requestedId = text(input.id, 80);
      const previous = requestedId ? existing.get(requestedId) : undefined;
      const language = text(input.language, 40).toLowerCase();
      if (!["python", "powershell", "cmd"].includes(language)) {
        throw new AppError(`زبان سلول ${index + 1} قابل اجرا نیست.`, { status: 422, code: "cell_language_invalid" });
      }
      return {
        id: previous?.id ?? crypto.randomUUID(),
        title: text(input.title, 120) || `مرحله ${index + 1}`,
        language,
        content: typeof input.content === "string" ? input.content.slice(0, 50000) : "",
        notes: typeof input.notes === "string" ? input.notes.slice(0, 8000) : previous?.notes ?? "",
        transition: input.transition === "on_success" ? "on_success" as const : "manual" as const,
        executionMode: input.executionMode === "background" ? "background" as const : "blocking" as const,
        executable: input.executable !== false,
        commandId: previous?.commandId ?? null,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
    });
  }
  if (body.cell && typeof body.cell === "object") {
    const cellInput = body.cell as Record<string, unknown>;
    const cell = notebook.cells.find((item) => item.id === cellInput.id);
    if (!cell) throw new AppError("مرحله پیدا نشد.", { status: 404, code: "cell_not_found" });
    cell.title = text(cellInput.title, 120) || cell.title;
    cell.language = text(cellInput.language, 40).toLowerCase() || "text";
    cell.content = typeof cellInput.content === "string" ? cellInput.content.slice(0, 50000) : cell.content;
    cell.notes = typeof cellInput.notes === "string" ? cellInput.notes.slice(0, 8000) : cell.notes;
    cell.transition = cellInput.transition === "on_success" ? "on_success" : "manual";
    cell.executionMode = cellInput.executionMode === "background" ? "background" : "blocking";
    cell.executable = Boolean(cellInput.executable);
    cell.updatedAt = new Date().toISOString();
  }
  if (typeof body.title === "string") notebook.title = text(body.title, 120) || notebook.title;
  if (typeof body.goal === "string") notebook.goal = text(body.goal, 4000);
  if (typeof body.chatbotGuide === "string") notebook.chatbotGuide = text(body.chatbotGuide, 8000);
  notebook.updatedAt = new Date().toISOString();
  await persist(items);
  return notebook;
}

export async function deleteStageNotebook(id: string): Promise<void> {
  if (id === CONTROLLED_NOTEBOOK_ID || id === ARENA_API_NOTEBOOK_ID) {
    throw new AppError("دفترچه داخلی کنترل‌شده برای استفاده دوباره حذف نمی‌شود.", { status: 422, code: "controlled_notebook_protected" });
  }
  const items = await load();
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) throw new AppError("دفترچه پیدا نشد.", { status: 404, code: "notebook_not_found" });
  await persist(next);
}

function py(value: string): string { return JSON.stringify(value); }

// UUID کامل دو موجودیت، شناسه اتوماسیون را از سقف ۷۲ نویسه عبور می‌دهد.
// ۲۴ نویسه نخست هر UUID همچنان فضای یکتایی بسیار بزرگی دارد و slug را معتبر نگه می‌دارد.
function compactId(value: string): string { return value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24).toLowerCase(); }

function cellSource(cells: StageCell[], notebook: StageNotebook): string {
  for (const cell of cells) {
    if (!["python", "powershell", "cmd"].includes(cell.language.toLowerCase())) {
      throw new AppError("اجرا فقط برای Python، PowerShell و CMD قابل انجام است.", { status: 422, code: "cell_language_not_executable" });
    }
  }
  const stages = cells.map((cell) => ({ id: cell.id, title: cell.title, language: cell.language.toLowerCase(), code: cell.content, mode: cell.executionMode ?? "blocking" }));
  return `# generated-stage-notebook-cell
import json, os, subprocess, sys
from datetime import datetime
NOTEBOOK_ID = ${py(notebook.id)}
STAGES = json.loads(${py(JSON.stringify(stages))})
ROOT = os.path.join(os.environ.get("LOCALAPPDATA", "."), "Windows-Agent", "stage-notebooks", NOTEBOOK_ID)
os.makedirs(ROOT, exist_ok=True)

def capture(stage, suffix="result"):
    try:
        path = os.path.join(ROOT, f"stage_{stage['id']}_{suffix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
        env = os.environ.copy()
        env["STAGE_SCREENSHOT_PATH"] = path
        ps = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height); $g=[System.Drawing.Graphics]::FromImage($bmp); try{$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size);$bmp.Save($env:STAGE_SCREENSHOT_PATH,[System.Drawing.Imaging.ImageFormat]::Png)}finally{$g.Dispose();$bmp.Dispose()}"
        shot = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps], env=env, text=True, capture_output=True, timeout=45)
        if shot.returncode or not os.path.isfile(path):
            raise RuntimeError((shot.stderr or shot.stdout or "PowerShell screenshot failed").strip())
        print("SERVICE_ARTIFACT: " + json.dumps({"artifactId": "stage-" + stage["id"] + "-" + suffix, "kind": "screenshot", "stage": "stage-notebook-" + suffix, "name": os.path.basename(path), "localPath": path, "mimeType": "image/png"}, ensure_ascii=False), flush=True)
    except Exception as exc:
        print("STAGE_SCREENSHOT_WARNING: " + str(exc), file=sys.stderr, flush=True)

def command_for(stage, background=False):
    language, code = stage["language"], stage["code"]
    if language == "python":
        prefix = "background_" if background else "cell_"
        script = os.path.join(ROOT, prefix + stage["id"] + ".py")
        with open(script, "w", encoding="utf-8") as handle:
            handle.write(code)
        return [sys.executable, "-u", script]
    if language == "powershell":
        return ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", code]
    return ["cmd.exe", "/d", "/s", "/c", code]

def execute(stage):
    print("STAGE_STARTED: " + stage["id"] + " · " + stage["title"] + " · " + stage["mode"], flush=True)
    if stage["mode"] == "background":
        log_path = os.path.join(ROOT, "background_" + stage["id"] + ".log")
        pid_path = os.path.join(ROOT, "background_" + stage["id"] + ".pid")
        log = open(log_path, "ab", buffering=0)
        flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)
        process = subprocess.Popen(command_for(stage, True), stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, creationflags=flags, close_fds=True)
        with open(pid_path, "w", encoding="ascii") as handle:
            handle.write(str(process.pid))
        print("STAGE_BACKGROUND_STARTED: " + stage["id"] + " · PID=" + str(process.pid) + " · LOG=" + log_path, flush=True)
        capture(stage, "background-started")
        return
    result = subprocess.run(command_for(stage), text=True, capture_output=True, encoding="utf-8", errors="replace")
    print(result.stdout, end="", flush=True)
    print(result.stderr, end="", file=sys.stderr, flush=True)
    if result.returncode:
        raise RuntimeError(f"stage exited with code {result.returncode}")
    print("STAGE_COMPLETED: " + stage["id"], flush=True)
    capture(stage)

def main():
    for stage in STAGES:
        execute(stage)

if __name__ == "__main__":
    main()
`;
}

export async function runStageNotebookCell(notebookId: string, cellId: string, runAll = false, requireManualConfirmation = true): Promise<{ commandId: string; version: number; attemptId: string; agent: { name: string; version: string | null; autoMode: boolean; busyAtDispatch: string | null } }> {
  const attemptId = await startAttempt(notebookId, cellId, runAll);
  let phase = "request_received";
  try {
    const items = await load();
    const notebook = items.find((item) => item.id === notebookId);
    const cell = notebook?.cells.find((item) => item.id === cellId);
    if (!notebook || !cell) throw new AppError("دفترچه یا مرحله پیدا نشد.", { status: 404, code: "stage_not_found" });
    if (!cell.executable || !cell.content.trim()) throw new AppError("این مرحله اجرایی نیست یا کد ندارد.", { status: 422, code: "cell_not_ready" });
    if (cell.content.includes("کلید_API_خودت_رو_اینجا_بذار")) {
      throw new AppError("کد هنوز API_KEY نمونه دارد و پیش از عملیات رابط کاربری متوقف می‌شود.", {
        status: 422,
        code: "stage_secret_placeholder",
        hint: "برای تست بدون کلید، دفترچه «تست کنترل‌شده رابط ویندوز» را باز و سلول اول آن را اجرا کنید.",
      });
    }
    phase = "notebook_validated";
    await updateAttempt(attemptId, { phase, message: "دفترچه، سلول و محتوای اجرایی معتبر است." }, { phase, level: "success", message: `سلول «${cell.title}» با زبان ${cell.language} معتبر است.` });

    phase = "agent_selection";
    await updateAttempt(attemptId, { phase, message: "در حال یافتن Windows Agent با Heartbeat تازه و قابلیت PostgreSQL است." }, { phase, level: "info", message: "جست‌وجوی Agent آنلاین با Heartbeat کمتر از ۹۰ ثانیه آغاز شد." });
    const target = await findOnlineCommandAgent(["d1_automations"]);
    phase = "agent_selected";
    await updateAttempt(attemptId, { phase, message: "Windows Agent سازگار و آنلاین انتخاب شد.", agentName: target.agentName, agentVersion: target.agentVersion }, { phase, level: "success", message: `${target.agentName} نسخه ${target.agentVersion ?? "نامشخص"} · ${target.autoMode ? "Automatic" : "Manual"}${target.busy ? ` · مشغول: ${target.busy}` : " · آزاد"}` });
    if (requireManualConfirmation && target.autoMode) {
      throw new AppError("Windows Agent در حالت Automatic است؛ برای نمایش پنجره Yes/No ابتدا آن را روی Manual قرار دهید.", {
        status: 409,
        code: "stage_manual_confirmation_required",
        hint: `حالت محلی ${target.agentName}${target.agentVersion ? ` نسخه ${target.agentVersion}` : ""} را به Manual تغییر دهید و دوباره Play را بزنید.`,
      });
    }

    const startIndex = notebook.cells.findIndex((item) => item.id === cell.id);
    let chain: StageCell[];
    if (runAll) {
      chain = notebook.cells.slice(startIndex).filter((item) => item.executable && item.content.trim());
    } else {
      chain = [cell];
      let cursor = startIndex;
      while (chain[chain.length - 1].transition === "on_success" && cursor + 1 < notebook.cells.length) {
        const next = notebook.cells[++cursor];
        if (!next.executable || !next.content.trim()) break;
        chain.push(next);
      }
    }
    const sourceCode = cellSource(chain, notebook);
    phase = "source_built";
    await updateAttempt(attemptId, { phase, message: `کد wrapper برای ${chain.length} سلول تولید شد.` }, { phase, level: "success", message: `source تولید شد · ${sourceCode.length} نویسه · ${chain.length} سلول` });

    const saved = await saveAutomationVersion({ slug: `stage_${compactId(notebook.id)}_${compactId(cell.id)}`, name: `${notebook.title} · ${runAll ? "اجرای دفترچه" : cell.title}`, description: "سلول‌های دفترچه کنترل مرحله‌ای", target: "windows", sourceCode, changeSummary: `اجرای واقعی ${chain.length} مرحله در ${new Date().toISOString()}`, actor: "manager:stage-notebook", activate: true });
    phase = "automation_saved";
    await updateAttempt(attemptId, { phase, message: "نسخه immutable اتوماسیون در PostgreSQL ذخیره و فعال شد.", automationVersion: saved.version.version }, { phase, level: "success", message: `نسخه ${saved.version.version} اتوماسیون ذخیره شد.` });

    const run = await requestAutomationRun(saved.automation.id, "manager:stage-notebook", target, { source: "stage_notebook", title: `${notebook.title} · ${runAll ? "اجرای همه مراحل" : cell.title}`, timeoutSeconds: 3600, noProgressSeconds: 300, requiredCapabilities: ["d1_automations"], monitoringPlan: ["اجرای ترتیبی سلول‌های عادی", "راه‌اندازی مستقل سلول‌های پایشی پس‌زمینه", "ثبت stdout و stderr", "گرفتن اسکرین‌شات هر مرحله"] });
    phase = "command_created";
    await updateAttempt(attemptId, { status: "queued", phase, message: "فرمان در PostgreSQL ساخته شد و منتظر claim ایجنت است.", commandId: run.commandId }, { phase, level: "success", message: `فرمان ${run.commandId} ساخته شد؛ مرحله بعد باید claim یا waiting_confirmation باشد.` });

    for (const item of chain) {
      item.commandId = run.commandId;
      item.updatedAt = new Date().toISOString();
    }
    notebook.updatedAt = new Date().toISOString();
    await persist(items);
    return {
      commandId: run.commandId,
      version: saved.version.version,
      attemptId,
      agent: { name: target.agentName, version: target.agentVersion, autoMode: target.autoMode, busyAtDispatch: target.busy },
    };
  } catch (error) {
    const info = executionError(error);
    await updateAttempt(attemptId, { status: "failed", phase, message: info.message }, { phase, level: "error", message: `${info.code}: ${info.message}${info.hint ? ` · راهنما: ${info.hint}` : ""}` });
    throw error;
  }
}

export async function pauseStageNotebookCell(notebookId: string, cellId: string): Promise<{ commandId: string }> {
  const items = await load();
  const notebook = items.find((item) => item.id === notebookId);
  const cell = notebook?.cells.find((item) => item.id === cellId);
  if (!notebook || !cell) throw new AppError("دفترچه یا مرحله پیدا نشد.", { status: 404, code: "stage_not_found" });
  if (cell.executionMode !== "background") {
    if (!cell.commandId) throw new AppError("برای این مرحله اجرای فعالی ثبت نشده است.", { status: 409, code: "cell_not_running" });
    await requestCommandCancellation(cell.commandId, `توقف سلول ${cell.title} از دفترچه مرحله‌ای`);
    return { commandId: cell.commandId };
  }
  const target = await findOnlineCommandAgent(["d1_automations"]);
  const rootPart = py(notebook.id);
  const cellPart = py(cell.id);
  const source = `# stop-stage-notebook-background
import os, subprocess
root = os.path.join(os.environ.get("LOCALAPPDATA", "."), "Windows-Agent", "stage-notebooks", ${rootPart})
pid_path = os.path.join(root, "background_" + ${cellPart} + ".pid")
if not os.path.isfile(pid_path):
    raise RuntimeError("فایل PID اجرای پایشی پیدا نشد")
with open(pid_path, "r", encoding="ascii") as handle:
    pid = int(handle.read().strip())
result = subprocess.run(["taskkill.exe", "/PID", str(pid), "/T", "/F"], text=True, capture_output=True)
print(result.stdout, end="")
print(result.stderr, end="")
if result.returncode not in (0, 128):
    raise RuntimeError("توقف پردازش پایشی ناموفق بود: " + str(result.returncode))
try:
    os.remove(pid_path)
except FileNotFoundError:
    pass
print("STAGE_BACKGROUND_STOPPED: " + ${cellPart})
`;
  const saved = await saveAutomationVersion({ slug: `stage_stop_${compactId(notebook.id)}_${compactId(cell.id)}`, name: `${notebook.title} · توقف ${cell.title}`, description: "توقف پردازش پایشی دفترچه", target: "windows", sourceCode: source, changeSummary: `درخواست توقف واقعی در ${new Date().toISOString()}`, actor: "manager:stage-notebook", activate: true });
  const run = await requestAutomationRun(saved.automation.id, "manager:stage-notebook", target, { source: "stage_notebook_pause", title: `${notebook.title} · توقف ${cell.title}`, timeoutSeconds: 120, noProgressSeconds: 60, requiredCapabilities: ["d1_automations"], monitoringPlan: ["خواندن PID ثبت‌شده", "پایان process tree سلول پایشی"] });
  cell.commandId = run.commandId;
  cell.updatedAt = new Date().toISOString();
  notebook.updatedAt = cell.updatedAt;
  await persist(items);
  return { commandId: run.commandId };
}
