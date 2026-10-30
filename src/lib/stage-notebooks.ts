import { AppError } from "./errors";
import { dbFirst, dbRun } from "./db";
import { findOnlineCommandAgent } from "./commands";
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
    return Array.isArray(parsed) ? parsed.slice(0, MAX_NOTEBOOKS) : [];
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
    notebook.cells.push({ id: crypto.randomUUID(), title: `مرحله ${notebook.cells.length + 1}`, language: "python", content: "", notes: "", transition: "manual", executable: true, commandId: null, createdAt: now, updatedAt: now });
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

function cellSource(cells: StageCell[], notebook: StageNotebook): string {
  for (const cell of cells) {
    if (!["python", "powershell", "cmd"].includes(cell.language.toLowerCase())) {
      throw new AppError("ادامه خودکار فقط برای Python، PowerShell و CMD قابل اجرا است.", { status: 422, code: "cell_language_not_executable" });
    }
  }
  const stages = cells.map((cell) => ({ id: cell.id, title: cell.title, language: cell.language.toLowerCase(), code: cell.content }));
  return `# generated-stage-notebook-cell
import json, os, subprocess, sys
from datetime import datetime
NOTEBOOK_ID = ${py(notebook.id)}
STAGES = json.loads(${py(JSON.stringify(stages))})

def capture(stage):
    try:
        from PIL import ImageGrab
        root = os.path.join(os.environ.get("LOCALAPPDATA", "."), "Windows-Agent", "logs", "stage-notebooks")
        os.makedirs(root, exist_ok=True)
        path = os.path.join(root, f"stage_{NOTEBOOK_ID}_{stage['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
        ImageGrab.grab(all_screens=True).save(path)
        print("SERVICE_ARTIFACT: " + json.dumps({"artifactId": "stage-" + stage["id"], "kind": "screenshot", "stage": "stage-notebook-result", "name": os.path.basename(path), "localPath": path, "mimeType": "image/png"}, ensure_ascii=False))
    except Exception as exc:
        print("STAGE_SCREENSHOT_WARNING: " + str(exc), file=sys.stderr)

def execute(stage):
    language, code = stage["language"], stage["code"]
    print("STAGE_STARTED: " + stage["id"] + " · " + stage["title"], flush=True)
    if language == "python":
        exec(compile(code, "<stage-cell>", "exec"), {"__name__": "__main__"})
    else:
        command = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", code] if language == "powershell" else ["cmd.exe", "/d", "/s", "/c", code]
        result = subprocess.run(command, text=True, capture_output=True, encoding="utf-8", errors="replace")
        print(result.stdout, end="")
        print(result.stderr, end="", file=sys.stderr)
        if result.returncode:
            raise RuntimeError(f"stage exited with code {result.returncode}")
    print("STAGE_COMPLETED: " + stage["id"], flush=True)

for stage in STAGES:
    try:
        execute(stage)
    finally:
        capture(stage)
`;
}

export async function runStageNotebookCell(notebookId: string, cellId: string): Promise<{ commandId: string; version: number }> {
  const items = await load();
  const notebook = items.find((item) => item.id === notebookId);
  const cell = notebook?.cells.find((item) => item.id === cellId);
  if (!notebook || !cell) throw new AppError("دفترچه یا مرحله پیدا نشد.", { status: 404, code: "stage_not_found" });
  if (!cell.executable || !cell.content.trim()) throw new AppError("این مرحله اجرایی نیست یا کد ندارد.", { status: 422, code: "cell_not_ready" });
  const target = await findOnlineCommandAgent(["d1_automations"]);
  const startIndex = notebook.cells.findIndex((item) => item.id === cell.id);
  const chain: StageCell[] = [cell];
  let cursor = startIndex;
  while (chain[chain.length - 1].transition === "on_success" && cursor + 1 < notebook.cells.length) {
    const next = notebook.cells[++cursor];
    if (!next.executable || !next.content.trim()) break;
    chain.push(next);
  }
  const saved = await saveAutomationVersion({ slug: `stage_${notebook.id.replace(/-/g, "_")}_${cell.id.replace(/-/g, "_")}`, name: `${notebook.title} · ${cell.title}`, description: "سلول دفترچه کنترل مرحله‌ای", target: "windows", sourceCode: cellSource(chain, notebook), changeSummary: `اجرای واقعی ${chain.length} مرحله در ${new Date().toISOString()}`, actor: "manager:stage-notebook", activate: true });
  const run = await requestAutomationRun(saved.automation.id, "manager:stage-notebook", target, { source: "stage_notebook", title: `${notebook.title} · ${cell.title}`, timeoutSeconds: 3600, noProgressSeconds: 300, requiredCapabilities: ["d1_automations"], monitoringPlan: ["اجرای سلول در workspace مستقل", "ثبت stdout و stderr", "گرفتن اسکرین‌شات پایان مرحله"] });
  cell.commandId = run.commandId;
  cell.updatedAt = new Date().toISOString();
  notebook.updatedAt = cell.updatedAt;
  await persist(items);
  return { commandId: run.commandId, version: saved.version.version };
}
