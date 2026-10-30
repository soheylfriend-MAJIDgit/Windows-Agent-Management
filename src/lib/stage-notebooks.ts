import { AppError } from "./errors";
import { dbFirst, dbRun } from "./db";
import { findOnlineCommandAgent, requestCommandCancellation } from "./commands";
import { requestAutomationRun, saveAutomationVersion } from "./automations";

const STORE_KEY = "stage-notebooks.v1";
const MAX_NOTEBOOKS = 30;
const MAX_CELLS = 100;

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

export async function listStageNotebooks(): Promise<StageNotebook[]> {
  return load();
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
        from PIL import ImageGrab
        path = os.path.join(ROOT, f"stage_{stage['id']}_{suffix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
        ImageGrab.grab(all_screens=True).save(path)
        print("SERVICE_ARTIFACT: " + json.dumps({"artifactId": "stage-" + stage["id"] + "-" + suffix, "kind": "screenshot", "stage": "stage-notebook-" + suffix, "name": os.path.basename(path), "localPath": path, "mimeType": "image/png"}, ensure_ascii=False), flush=True)
    except Exception as exc:
        print("STAGE_SCREENSHOT_WARNING: " + str(exc), file=sys.stderr, flush=True)

def command_for(stage, background=False):
    language, code = stage["language"], stage["code"]
    if language == "python":
        if not background:
            return None
        script = os.path.join(ROOT, "background_" + stage["id"] + ".py")
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
    if stage["language"] == "python":
        exec(compile(stage["code"], "<stage-cell>", "exec"), {"__name__": "__main__"})
    else:
        result = subprocess.run(command_for(stage), text=True, capture_output=True, encoding="utf-8", errors="replace")
        print(result.stdout, end="", flush=True)
        print(result.stderr, end="", file=sys.stderr, flush=True)
        if result.returncode:
            raise RuntimeError(f"stage exited with code {result.returncode}")
    print("STAGE_COMPLETED: " + stage["id"], flush=True)
    capture(stage)

for stage in STAGES:
    execute(stage)
`;
}

export async function runStageNotebookCell(notebookId: string, cellId: string, runAll = false): Promise<{ commandId: string; version: number }> {
  const items = await load();
  const notebook = items.find((item) => item.id === notebookId);
  const cell = notebook?.cells.find((item) => item.id === cellId);
  if (!notebook || !cell) throw new AppError("دفترچه یا مرحله پیدا نشد.", { status: 404, code: "stage_not_found" });
  if (!cell.executable || !cell.content.trim()) throw new AppError("این مرحله اجرایی نیست یا کد ندارد.", { status: 422, code: "cell_not_ready" });
  const target = await findOnlineCommandAgent(["d1_automations"]);
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
  const saved = await saveAutomationVersion({ slug: `stage_${compactId(notebook.id)}_${compactId(cell.id)}`, name: `${notebook.title} · ${runAll ? "اجرای دفترچه" : cell.title}`, description: "سلول‌های دفترچه کنترل مرحله‌ای", target: "windows", sourceCode: cellSource(chain, notebook), changeSummary: `اجرای واقعی ${chain.length} مرحله در ${new Date().toISOString()}`, actor: "manager:stage-notebook", activate: true });
  const run = await requestAutomationRun(saved.automation.id, "manager:stage-notebook", target, { source: "stage_notebook", title: `${notebook.title} · ${runAll ? "اجرای همه مراحل" : cell.title}`, timeoutSeconds: 3600, noProgressSeconds: 300, requiredCapabilities: ["d1_automations"], monitoringPlan: ["اجرای ترتیبی سلول‌های عادی", "راه‌اندازی مستقل سلول‌های پایشی پس‌زمینه", "ثبت stdout و stderr", "گرفتن اسکرین‌شات هر مرحله"] });
  for (const item of chain) {
    item.commandId = run.commandId;
    item.updatedAt = new Date().toISOString();
  }
  notebook.updatedAt = new Date().toISOString();
  await persist(items);
  return { commandId: run.commandId, version: saved.version.version };
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
