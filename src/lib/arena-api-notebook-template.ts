const ROOT_SETUP = String.raw`import json, os, tempfile, time
ROOT = os.path.join(os.environ.get("LOCALAPPDATA", "."), "Windows-Agent", "stage-notebooks", "arena-api-prompt-submit-v1")
os.makedirs(ROOT, exist_ok=True)
STATE_PATH = os.path.join(ROOT, "state.json")

def read_state():
    try:
        with open(STATE_PATH, "r", encoding="utf-8") as handle:
            value = json.load(handle)
            return value if isinstance(value, dict) else {}
    except (FileNotFoundError, OSError, ValueError):
        return {}

def progress_path(stage):
    return os.path.join(ROOT, stage + "-progress.jsonl")

def reset_progress(stage):
    with open(progress_path(stage), "w", encoding="utf-8"):
        pass

_PROGRESS_CURRENT = {}
def progress_event(stage, step_id, status, detail=""):
    event = {"id": str(step_id), "status": str(status), "detail": str(detail), "at": time.strftime("%H:%M:%S")}
    if status == "running":
        _PROGRESS_CURRENT[stage] = str(step_id)
    elif _PROGRESS_CURRENT.get(stage) == str(step_id):
        _PROGRESS_CURRENT.pop(stage, None)
    with open(progress_path(stage), "a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")

def fail_current_progress(stage, detail):
    step_id = _PROGRESS_CURRENT.get(stage)
    if step_id:
        progress_event(stage, step_id, "failed", detail)

def write_state(**changes):
    state = read_state()
    message = str(changes.get("message") or "").strip()
    for stage_key in ("dashboard", "credentials", "prompt", "browser", "paste", "submit"):
        if stage_key not in changes:
            continue
        if changes[stage_key] == "waiting":
            changes[stage_key + "Report"] = "هنوز گزارشی ثبت نشده است."
        elif message:
            changes[stage_key + "Report"] = message
    state.update(changes)
    state["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    fd, temporary = tempfile.mkstemp(prefix="state-", suffix=".json", dir=ROOT)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(state, handle, ensure_ascii=False, indent=2)
        os.replace(temporary, STATE_PATH)
    finally:
        if os.path.exists(temporary):
            os.remove(temporary)
`;

const DASHBOARD_CODE = String.raw`${ROOT_SETUP}
import tkinter as tk
from tkinter import ttk

STAGES = [
    ("dashboard", "۱. رابط وضعیت مرحله‌ها"),
    ("credentials", "۲. دریافت API Key سالی‌تست"),
    ("prompt", "۳. خواندن decision از GET /handoff"),
    ("browser", "۴. بازکردن Chrome و انتظار برای پایداری"),
    ("paste", "۵. Paste و Send یک‌باره با pywinauto"),
    ("submit", "۶. ثبت نتیجه ارسال (بدون Enter مجدد)"),
]
LABELS = {"waiting": "منتظر", "running": "در حال اجرا", "done": "انجام شد", "failed": "متوقف شد", "skipped": "اجرا نمی‌شود"}
COLORS = {"waiting": "#64748b", "running": "#f59e0b", "done": "#10b981", "failed": "#ef4444", "skipped": "#8b5cf6"}
SUBSTEPS = [
    ("s5-01", "۵.۱ کنترل decision و هش Prompt"), ("s5-02", "۵.۲ بررسی/نصب pywinauto"),
    ("s5-03", "۵.۳ یافتن و foreground کردن Chrome Arena"), ("s5-04", "۵.۴ ثبت تصویر قبل از OCR"),
    ("s5-05", "۵.۵ اجرای PaddleOCR محلی"), ("s5-06", "۵.۶ جست‌وجوی UIA و انتخاب کاندید امن"),
    ("s5-07", "۵.۷ کلیک و اثبات فوکوس composer"), ("s5-08", "۵.۸ قرار دادن sentinel در Clipboard"),
    ("s5-09", "۵.۹ Ctrl+A و Ctrl+C پیش از Paste"), ("s5-10", "۵.۱۰ طبقه‌بندی Clipboard: خالی/همان Prompt/متن دیگر"),
    ("s5-11", "۵.۱۱ قرار دادن کامل Prompt در Clipboard"), ("s5-12", "۵.۱۲ ارسال دقیقاً یک Ctrl+V"),
    ("s5-13", "۵.۱۳ تصویر بعد از Paste و قبل از Send"), ("s5-14", "۵.۱۴ کنترل فوکوس پس از Paste"),
    ("s5-15", "۵.۱۵ Ctrl+A/C و خواندن دوباره Clipboard"), ("s5-16", "۵.۱۶ تطبیق طول، هش و متن نرمال‌شده"),
    ("s5-17", "۵.۱۷ ثبت محافظ ضد Enter تکراری"), ("s5-18", "۵.۱۸ ارسال دقیقاً یک Enter"),
    ("s5-19", "۵.۱۹ تصویر و ثبت نتیجه نهایی"),
    ("s6-01", "۶.۱ خواندن state و هش Prompt"), ("s6-02", "۶.۲ تطبیق ثبت ارسال مرحله ۵"),
    ("s6-03", "۶.۳ تضمین عدم ارسال کلید مجدد"),
]
write_state(dashboard="running", message="رابط گزارش باز شد؛ وضعیت و نتیجه مرحله‌های قبلی حفظ شده است.")

window = tk.Tk()
window.title("Arena · اجرای پرامپت بعدی")
window.geometry("1040x900")
window.minsize(820, 680)
window.configure(bg="#0f172a")
window.attributes("-topmost", True)
window.after(1800, lambda: window.attributes("-topmost", False))
style = ttk.Style(window)
style.theme_use("clam")
style.configure("Stage.TFrame", background="#172033")

header = tk.Frame(window, bg="#0f172a")
header.pack(fill="x", padx=24, pady=(22, 12))
tk.Label(header, text="اجرای مرحله‌ای پرامپت Arena", bg="#0f172a", fg="#f8fafc", font=("Segoe UI", 18, "bold"), anchor="e").pack(fill="x")
tk.Label(header, text="هر مرحله فقط پس از موفقیت مرحله قبل اجرا می‌شود. در خطا، زنجیره امن متوقف می‌شود.", bg="#0f172a", fg="#94a3b8", font=("Segoe UI", 10), anchor="e").pack(fill="x", pady=(6, 0))
body = tk.Frame(window, bg="#0f172a")
body.pack(fill="both", expand=True, padx=24)
rows = {}
for key, title in STAGES:
    row = tk.Frame(body, bg="#172033", highlightthickness=1, highlightbackground="#26334a")
    row.pack(fill="x", pady=4)
    badge = tk.Label(row, text="منتظر", width=13, bg="#334155", fg="white", font=("Segoe UI", 9, "bold"), pady=12)
    badge.pack(side="left", padx=8, pady=7)
    details = tk.Frame(row, bg="#172033")
    details.pack(side="right", fill="both", expand=True, padx=14, pady=7)
    tk.Label(details, text=title, bg="#172033", fg="#e2e8f0", font=("Segoe UI", 11, "bold"), anchor="e").pack(fill="x")
    report = tk.Label(details, text="هنوز گزارشی ثبت نشده است.", bg="#172033", fg="#94a3b8", font=("Segoe UI", 9), anchor="e", justify="right", wraplength=600)
    report.pack(fill="x", pady=(4, 0))
    rows[key] = (badge, report)
subframe = tk.Frame(window, bg="#111827", highlightthickness=1, highlightbackground="#334155")
subframe.pack(fill="both", expand=True, padx=24, pady=(8, 0))
tk.Label(subframe, text="ریزگزارش مرحله‌های ۵ و ۶ · وضعیت Clipboard، Paste و Enter", bg="#111827", fg="#f8fafc", font=("Segoe UI", 10, "bold"), anchor="e").pack(fill="x", padx=10, pady=(8, 4))
subscroll = tk.Scrollbar(subframe)
subscroll.pack(side="left", fill="y")
substeps_view = tk.Text(subframe, height=13, bg="#0b1220", fg="#cbd5e1", insertbackground="white", relief="flat", font=("Segoe UI", 9), wrap="word", yscrollcommand=subscroll.set)
substeps_view.pack(side="right", fill="both", expand=True, padx=(0, 8), pady=(0, 8))
subscroll.configure(command=substeps_view.yview)
substeps_view.configure(state="disabled")
footer_text = tk.StringVar(value="پنجره وضعیت فعال است…")
tk.Label(window, textvariable=footer_text, bg="#0f172a", fg="#7dd3fc", font=("Segoe UI", 9), anchor="e").pack(fill="x", padx=24, pady=14)

def read_progress_events():
    latest = {}
    for stage in ("stage5", "stage6"):
        try:
            with open(progress_path(stage), "r", encoding="utf-8-sig") as handle:
                for line in handle:
                    try:
                        event = json.loads(line.lstrip("\ufeff"))
                        if isinstance(event, dict) and event.get("id"):
                            latest[str(event["id"])] = event
                    except (ValueError, TypeError):
                        pass
        except OSError:
            pass
    return latest

def refresh():
    state = read_state()
    for key, _ in STAGES:
        status = str(state.get(key, "waiting"))
        if key == "dashboard" and status == "running":
            status = "done"
        badge, report = rows[key]
        badge.configure(text=LABELS.get(status, status), bg=COLORS.get(status, "#334155"))
        fallback = "مرحله با موفقیت انجام شده است." if status == "done" else "هنوز گزارشی ثبت نشده است."
        report.configure(text=str(state.get(key + "Report") or fallback), fg="#86efac" if status == "done" else "#fca5a5" if status == "failed" else "#94a3b8")
    latest = read_progress_events()
    symbols = {"done": "✓", "running": "◉", "failed": "✗", "skipped": "—", "waiting": "○"}
    lines = []
    for step_id, title in SUBSTEPS:
        event = latest.get(step_id, {})
        status = str(event.get("status") or "waiting")
        detail = str(event.get("detail") or "")
        at = str(event.get("at") or "")
        lines.append(f"{symbols.get(status, '○')}  {title}" + (f"  [{at}] — {detail}" if detail else ""))
    substeps_view.configure(state="normal")
    substeps_view.delete("1.0", "end")
    substeps_view.insert("1.0", "\n".join(lines))
    substeps_view.configure(state="disabled")
    footer_text.set(str(state.get("message") or "در انتظار مرحله بعد…"))
    window.after(700, refresh)
refresh()
window.mainloop()
`;

const CREDENTIALS_CODE = String.raw`${ROOT_SETUP}
import base64, ctypes, getpass
import tkinter as tk
from ctypes import wintypes
from tkinter import messagebox, ttk

API_URL = "https://salitest.ir/api/agent/v1/handoff"
write_state(credentials="running", message="لطفاً فقط API Key سالی‌تست را در پنجره Python وارد کنید.")

class DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]

def protect(secret):
    raw = secret.encode("utf-8")
    source_buffer = ctypes.create_string_buffer(raw)
    source = DATA_BLOB(len(raw), ctypes.cast(source_buffer, ctypes.POINTER(ctypes.c_byte)))
    target = DATA_BLOB()
    if not ctypes.windll.crypt32.CryptProtectData(ctypes.byref(source), "Arena API Key", None, None, None, 0, ctypes.byref(target)):
        raise ctypes.WinError()
    try:
        return base64.b64encode(ctypes.string_at(target.pbData, target.cbData)).decode("ascii")
    finally:
        ctypes.windll.kernel32.LocalFree(target.pbData)

result = {}
window = tk.Tk()
window.title("تنظیم دسترسی API پرامپت بعدی")
window.geometry("690x430")
window.resizable(False, False)
window.configure(bg="#0f172a")
window.attributes("-topmost", True)

tk.Label(window, text="دسترسی ماشینی · ایجنت اتوماسیون", bg="#0f172a", fg="#f8fafc", font=("Segoe UI", 17, "bold"), anchor="e").pack(fill="x", padx=28, pady=(24, 6))
tk.Label(window, text="دامنه ثابت: https://salitest.ir  ·  کلید فقط با Windows DPAPI و برای همین حساب ویندوز رمز می‌شود.", bg="#0f172a", fg="#94a3b8", font=("Segoe UI", 10), anchor="e", wraplength=630).pack(fill="x", padx=28, pady=(0, 18))
form = tk.Frame(window, bg="#172033", padx=20, pady=18)
form.pack(fill="both", expand=True, padx=28, pady=(0, 20))

def field(label, secret=False):
    tk.Label(form, text=label, bg="#172033", fg="#cbd5e1", font=("Segoe UI", 10, "bold"), anchor="e").pack(fill="x", pady=(4, 5))
    entry = tk.Entry(form, bg="#0f172a", fg="#f8fafc", insertbackground="white", relief="flat", font=("Consolas", 10), show="●" if secret else "")
    entry.pack(fill="x", ipady=9, pady=(0, 10))
    return entry

key_entry = field("API Key سالی‌تست")
tk.Label(form, text="قرارداد ثابت: Authorization: Bearer · GET /api/agent/v1/handoff", bg="#172033", fg="#7dd3fc", font=("Segoe UI", 9), anchor="e").pack(fill="x", pady=4)

def submit():
    key = key_entry.get().strip()
    if not key.startswith("agk_") or len(key) < 20:
        messagebox.showerror("ورودی نامعتبر", "کلید ایجنت اتوماسیون باید با agk_ شروع شود.", parent=window)
        return
    result.update(key=key)
    key_entry.delete(0, "end")
    window.destroy()

def cancel():
    window.destroy()
window.protocol("WM_DELETE_WINDOW", cancel)
tk.Button(form, text="ثبت امن و ادامه", command=submit, bg="#22c55e", fg="#052e16", relief="flat", font=("Segoe UI", 11, "bold"), padx=18, pady=9).pack(side="right", pady=(10, 0))
key_entry.bind("<Return>", lambda _event: submit())
window.mainloop()
if not result:
    write_state(credentials="failed", message="دریافت API Key توسط کاربر لغو شد.")
    raise SystemExit("API credential entry cancelled")
credentials_path = os.path.join(ROOT, "credentials.json")
payload = {"url": API_URL, "protectedKey": protect(result["key"]), "windowsUser": getpass.getuser()}
with open(credentials_path + ".tmp", "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)
os.replace(credentials_path + ".tmp", credentials_path)
result["key"] = ""
write_state(credentials="done", message="API Key به‌صورت محلی و رمز‌شده دریافت شد.")
print("ARENA_API_CREDENTIALS_READY: URL and DPAPI-protected key saved; secret omitted", flush=True)
`;

const FETCH_PROMPT_CODE = String.raw`${ROOT_SETUP}
import base64, ctypes, hashlib, urllib.error, urllib.request
from ctypes import wintypes

write_state(prompt="running", message="در حال دریافت متغیرهای پرامپت بعدی از API…")
class DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]
def unprotect(encoded):
    raw = base64.b64decode(encoded)
    source_buffer = ctypes.create_string_buffer(raw)
    source = DATA_BLOB(len(raw), ctypes.cast(source_buffer, ctypes.POINTER(ctypes.c_byte)))
    target = DATA_BLOB()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(source), None, None, None, None, 0, ctypes.byref(target)):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(target.pbData, target.cbData).decode("utf-8")
    finally:
        ctypes.windll.kernel32.LocalFree(target.pbData)
HANDOFF_URL = "https://salitest.ir/api/agent/v1/handoff"

def api_error(code, raw):
    try:
        body = json.loads(raw.decode("utf-8-sig"))
        if isinstance(body, dict):
            error_code = str(body.get("code") or body.get("error") or "").strip()
            error_message = str(body.get("message") or body.get("detail") or "").strip()
            return " ".join(part for part in ("HTTP " + str(code), error_code, error_message) if part)
    except Exception:
        pass
    return "HTTP " + str(code) + " · پاسخ خطا JSON معتبر نبود"

def get_handoff(secret):
    headers = {"Accept": "application/json", "Authorization": "Bearer " + secret, "User-Agent": "Windows-Agent/Arena-Next-Prompt-v1"}
    for attempt in range(1, 4):
        request = urllib.request.Request(HANDOFF_URL, method="GET", headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                content_type = str(response.headers.get("Content-Type") or "").lower()
                raw = response.read(128 * 1024 + 1)
                status_code = response.status
            if status_code != 200:
                raise RuntimeError(api_error(status_code, raw))
            if len(raw) > 128 * 1024:
                raise RuntimeError("پاسخ API بزرگ‌تر از ۱۲۸ کیلوبایت است")
            try:
                payload = json.loads(raw.decode("utf-8-sig"))
            except (UnicodeError, json.JSONDecodeError) as exc:
                raise RuntimeError("پاسخ endpoint قرارداد JSON نیست · HTTP 200 · Content-Type=" + (content_type or "نامشخص") + " · bytes=" + str(len(raw))) from exc
            if not isinstance(payload, dict):
                raise RuntimeError("پاسخ GET /handoff باید JSON object باشد")
            print("SALITEST_HANDOFF_RECEIVED: HTTP 200 attempt=" + str(attempt), flush=True)
            return payload
        except urllib.error.HTTPError as exc:
            raw = exc.read(64 * 1024)
            raise RuntimeError(api_error(exc.code, raw)) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            if attempt >= 3:
                raise RuntimeError("شبکه پس از دو تلاش مجدد در دسترس نشد: " + str(exc)) from exc
            delay = 3 * attempt
            print("SALITEST_HANDOFF_RETRY: attempt=" + str(attempt) + " delay=" + str(delay), flush=True)
            time.sleep(delay)

try:
    with open(os.path.join(ROOT, "credentials.json"), "r", encoding="utf-8") as handle:
        credentials = json.load(handle)
    secret = unprotect(credentials["protectedKey"])
    try:
        payload = get_handoff(secret)
    finally:
        secret = ""
    decision = payload.get("decision")
    computed = payload.get("computed")
    if not isinstance(decision, dict) and isinstance(computed, dict):
        decision = computed.get("decision")
    if not isinstance(decision, dict):
        raise RuntimeError("پاسخ GET /handoff فاقد decision object است")
    action = str(decision.get("action") or "").strip().lower()
    if action not in ("run_next", "wait_human", "stop", "idle"):
        raise RuntimeError("decision.action ناشناخته است: " + (action or "خالی"))
    if action != "run_next":
        chain_status = {"wait_human": "human", "stop": "stop", "idle": "idle"}[action]
        messages = {"wait_human": "زنجیره نیازمند مداخله انسانی است؛ هیچ کاری اجرا نشد.", "stop": "زنجیره متوقف است؛ هیچ کاری اجرا نشد.", "idle": "زنجیره خالی یا خاموش است؛ هیچ کاری اجرا نشد."}
        write_state(prompt="skipped", browser="skipped", paste="skipped", submit="skipped", chainStatus=chain_status, decisionAction=action, message=messages[action])
        print("ARENA_CHAIN_NOT_CONTINUING: action=" + action, flush=True)
        raise SystemExit(0)
    prompt = decision.get("nextPrompt")
    status = str(decision.get("status") or "continue").strip().lower()
    if status != "continue":
        raise RuntimeError("decision.action=run_next است اما status برابر continue نیست")
    if not isinstance(prompt, str) or not (2 <= len(prompt.strip()) <= 6000):
        raise RuntimeError("برای decision.action=run_next، nextPrompt باید بین ۲ تا ۶۰۰۰ نویسه باشد")
    prompt = prompt.strip()
    digest = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    previous = read_state().get("lastSubmittedPromptSha256")
    if digest == previous:
        raise RuntimeError("پرامپت API با آخرین پرامپت ارسال‌شده یکسان است؛ برای جلوگیری از ارسال تکراری متوقف شد")
    prompt_path = os.path.join(ROOT, "next-prompt.txt")
    with open(prompt_path + ".tmp", "w", encoding="utf-8", newline="\n") as handle:
        handle.write(prompt)
    os.replace(prompt_path + ".tmp", prompt_path)
    write_state(prompt="done", promptSha256=digest, promptChars=len(prompt), chainStatus=status, decisionAction=action, decisionReason=str(decision.get("reason") or ""), message="decision.action=run_next و پرامپت بعدی معتبر دریافت شد؛ متن آن در لاگ نمایش داده نمی‌شود.")
    print("ARENA_NEXT_PROMPT_READY: sha256=" + digest + " chars=" + str(len(prompt)), flush=True)
except SystemExit:
    raise
except Exception as exc:
    write_state(prompt="failed", message="دریافت پرامپت متوقف شد: " + str(exc))
    raise
`;

const BROWSER_CODE = String.raw`${ROOT_SETUP}
import ctypes, shutil, subprocess
from ctypes import wintypes

ARENA_URL = "https://arena.ai/agent/01a18017-9552-70af-b937-b790a82b79b3"
if read_state().get("chainStatus") != "continue":
    write_state(browser="skipped", message="decision.action اجازه ادامه نمی‌دهد؛ Chrome باز نمی‌شود.")
    print("ARENA_BROWSER_SKIPPED: decision does not allow continuation", flush=True)
    raise SystemExit(0)
write_state(browser="running", message="در حال بازکردن Chrome واقعی با پروفایل عادی Windows…")

class RECT(ctypes.Structure):
    _fields_ = [("left", wintypes.LONG), ("top", wintypes.LONG), ("right", wintypes.LONG), ("bottom", wintypes.LONG)]

def chrome_path():
    candidates = [
        os.path.join(os.environ.get("PROGRAMFILES", ""), "Google", "Chrome", "Application", "chrome.exe"),
        os.path.join(os.environ.get("PROGRAMFILES(X86)", ""), "Google", "Chrome", "Application", "chrome.exe"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "Application", "chrome.exe"),
        shutil.which("chrome.exe"),
    ]
    return next((path for path in candidates if path and os.path.isfile(path)), None)

def find_chrome_window():
    user32 = ctypes.windll.user32
    windows = []
    callback_type = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    def callback(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        title = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, title, length + 1)
        if "Chrome" not in title.value:
            return True
        rect = RECT()
        if user32.GetWindowRect(hwnd, ctypes.byref(rect)):
            area = max(0, rect.right - rect.left) * max(0, rect.bottom - rect.top)
            if area > 100000:
                windows.append((area, hwnd, rect, title.value))
        return True
    user32.EnumWindows(callback_type(callback), 0)
    return max(windows, default=None, key=lambda item: (1 if "arena" in item[3].lower() else 0, item[0]))

def window_signature(rect, path):
    """اسکرین‌شات واقعی می‌گیرد، اما نوسان‌های کوچک انیمیشن را با امضای ادراکی تحمل می‌کند."""
    width, height = rect.right - rect.left, rect.bottom - rect.top
    env = os.environ.copy()
    env.update({"SHOT_X": str(rect.left), "SHOT_Y": str(rect.top), "SHOT_W": str(width), "SHOT_H": str(height), "SHOT_PATH": path})
    script = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Drawing; $b=New-Object Drawing.Bitmap([int]$env:SHOT_W,[int]$env:SHOT_H); $g=[Drawing.Graphics]::FromImage($b); $s=New-Object Drawing.Bitmap(24,14); $sg=[Drawing.Graphics]::FromImage($s); try{$g.CopyFromScreen([int]$env:SHOT_X,[int]$env:SHOT_Y,0,0,$b.Size);$b.Save($env:SHOT_PATH,[Drawing.Imaging.ImageFormat]::Png);$sg.DrawImage($b,0,0,24,14);$v='';for($y=0;$y -lt 14;$y++){for($x=0;$x -lt 24;$x++){$p=$s.GetPixel($x,$y);$q=[Math]::Min(15,[int](($p.R+$p.G+$p.B)/48));$v+=$q.ToString('X1')}};Write-Output $v}finally{$sg.Dispose();$s.Dispose();$g.Dispose();$b.Dispose()}"
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], env=env, text=True, capture_output=True, timeout=30, creationflags=flags)
    signature = result.stdout.strip().splitlines()[-1] if result.stdout.strip() else ""
    if result.returncode or not os.path.isfile(path) or len(signature) != 24 * 14:
        raise RuntimeError((result.stderr or result.stdout or "window screenshot failed").strip())
    return signature

def visual_distance(left, right):
    if not left or len(left) != len(right):
        return 1.0
    return sum(a != b for a, b in zip(left, right)) / len(left)

try:
    chrome = chrome_path()
    if not chrome:
        raise RuntimeError("Google Chrome روی ویندوز پیدا نشد")
    # هیچ پروفایل تازه یا پروتکل کنترل مرورگر ساخته نمی‌شود؛ همان Chrome واقعی کاربر باز می‌شود.
    subprocess.Popen([chrome, "--new-window", ARENA_URL], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.monotonic() + 150
    target = None
    while time.monotonic() < deadline:
        target = find_chrome_window()
        if target:
            break
        time.sleep(1)
    if not target:
        raise RuntimeError("پنجره واقعی Google Chrome پس از بازکردن لینک پیدا نشد")
    _, hwnd, rect, title = target
    ctypes.windll.user32.ShowWindow(hwnd, 9)
    ctypes.windll.user32.SetForegroundWindow(hwnd)
    shot_path = os.path.join(ROOT, "chrome-stability.png")
    stable = 0
    previous_signature = None
    previous_geometry = None
    # فرصت بارگذاری اولیه؛ تمام PowerShellهای تصویربرداری بدون پنجره آبی اجرا می‌شوند.
    time.sleep(8)
    while time.monotonic() < deadline:
        target = find_chrome_window()
        if not target:
            stable = 0
            time.sleep(2)
            continue
        _, hwnd, rect, title = target
        geometry = (rect.left, rect.top, rect.right, rect.bottom, title)
        signature = window_signature(rect, shot_path)
        distance = visual_distance(previous_signature, signature) if previous_signature else 1.0
        stable = stable + 1 if geometry == previous_geometry and distance <= 0.18 else 1
        previous_signature = signature
        previous_geometry = geometry
        print("ARENA_CHROME_VISUAL_CHECK: stable=" + str(stable) + " distance=" + format(distance, ".3f"), flush=True)
        if stable >= 3:
            write_state(browser="done", browserWindowTitle=title, browserVisualDistance=distance, browserScreenshot=shot_path, message="پنجره واقعی Arena در Chrome با سه اسکرین‌شات ادراکی پایدار تأیید شد؛ تغییرهای کوچک انیمیشن نادیده گرفته شدند.")
            print("ARENA_REAL_CHROME_STABLE: three perceptually stable native screenshots", flush=True)
            break
        time.sleep(3)
    else:
        raise RuntimeError("پنجره Chrome در بررسی ادراکی طی زمان مجاز پایدار نشد")
except Exception as exc:
    write_state(browser="failed", message="بازکردن Chrome واقعی متوقف شد: " + str(exc))
    raise
`;

const PASTE_CODE = String.raw`${ROOT_SETUP}
import ctypes, hashlib, re, subprocess
from ctypes import wintypes

reset_progress("stage5")
progress_event("stage5", "s5-01", "running", "در حال کنترل مجوز زنجیره و هش Prompt")
if read_state().get("chainStatus") != "continue":
    progress_event("stage5", "s5-01", "failed", "decision.action اجازه ادامه زنجیره را نمی‌دهد")
    write_state(paste="skipped", message="decision.action اجازه ادامه نمی‌دهد؛ هیچ Paste انجام نمی‌شود.")
    print("ARENA_PASTE_SKIPPED: decision does not allow continuation", flush=True)
    raise SystemExit(0)
write_state(paste="running", message="در حال یافتن امن composer با UI Automation و Paste دقیقاً یک‌باره…")

class RECT(ctypes.Structure):
    _fields_ = [("left", wintypes.LONG), ("top", wintypes.LONG), ("right", wintypes.LONG), ("bottom", wintypes.LONG)]

def find_chrome_window():
    user32 = ctypes.windll.user32
    windows = []
    callback_type = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    def callback(hwnd, _):
        if user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            title = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, title, length + 1)
            if "Chrome" in title.value:
                rect = RECT()
                if user32.GetWindowRect(hwnd, ctypes.byref(rect)):
                    area = max(0, rect.right-rect.left) * max(0, rect.bottom-rect.top)
                    if area > 100000:
                        windows.append((area, hwnd, rect, title.value))
        return True
    user32.EnumWindows(callback_type(callback), 0)
    # اگر چند پنجره Chrome باز باشد، پنجره‌ای که عنوان Arena دارد بر پنجره صرفاً بزرگ‌تر مقدم است.
    return max(windows, default=None, key=lambda item: (1 if "arena" in item[3].lower() else 0, item[0]))

def capture_chrome_for_ocr(rect, path):
    width, height = rect.right - rect.left, rect.bottom - rect.top
    env = os.environ.copy()
    env.update({"SHOT_X": str(rect.left), "SHOT_Y": str(rect.top), "SHOT_W": str(width), "SHOT_H": str(height), "SHOT_PATH": path})
    script = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Drawing; $b=New-Object Drawing.Bitmap([int]$env:SHOT_W,[int]$env:SHOT_H); $g=[Drawing.Graphics]::FromImage($b); try{$g.CopyFromScreen([int]$env:SHOT_X,[int]$env:SHOT_Y,0,0,$b.Size);$b.Save($env:SHOT_PATH,[Drawing.Imaging.ImageFormat]::Png)}finally{$g.Dispose();$b.Dispose()}"
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], env=env, text=True, capture_output=True, timeout=30, creationflags=flags)
    if result.returncode or not os.path.isfile(path):
        raise RuntimeError((result.stderr or result.stdout or "OCR screenshot failed").strip())

def composer_point_from_local_ocr(rect, image_path, prompt):
    local = os.environ.get("LOCALAPPDATA", "")
    python_path = os.environ.get("WINDOWS_AGENT_OCR_PYTHON", "") or os.path.join(local, "Windows-Agent", "vision", ".venv", "Scripts", "python.exe")
    helper_path = os.environ.get("WINDOWS_AGENT_OCR_HELPER", "") or os.path.join(local, "Windows-Agent", "vision", "paddle_ocr_helper.py")
    if not os.path.isfile(python_path) or not os.path.isfile(helper_path):
        print("ARENA_STAGE5_OCR_UNAVAILABLE: local PaddleOCR helper paths were not found", flush=True)
        return None
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    result = subprocess.run([python_path, helper_path, "--image", image_path, "--json"], text=True, capture_output=True, encoding="utf-8", errors="replace", timeout=75, creationflags=flags)
    if result.returncode:
        print("ARENA_STAGE5_OCR_ERROR: " + (result.stderr or result.stdout or "helper failed")[-800:], flush=True)
        return None
    try:
        payload = json.loads(result.stdout)
    except (TypeError, json.JSONDecodeError) as exc:
        print("ARENA_STAGE5_OCR_INVALID_JSON: " + str(exc), flush=True)
        return None
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(payload, dict) or not payload.get("ok") or not isinstance(items, list):
        print("ARENA_STAGE5_OCR_INVALID_PAYLOAD", flush=True)
        return None
    phrases = ("what would you like", "what do you want", "ask arena", "ask anything", "send a message", "type a message", "message arena", "how can i help")
    def semantic_key(value):
        return " ".join(re.findall(r"[\w\u0600-\u06ff]+", str(value).casefold(), flags=re.UNICODE))
    prompt_key = semantic_key(prompt)
    matches = []
    for item in items:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").casefold().strip()
        bounds = item.get("bounds")
        confidence = float(item.get("confidence") or 0)
        if confidence < 0.42 or not isinstance(bounds, list) or len(bounds) != 4:
            continue
        placeholder_match = any(phrase in text or (len(text) >= 8 and text in phrase) for phrase in phrases)
        item_key = semantic_key(text)
        # متن موجود فقط وقتی مدرک معنایی است که یک قطعه نسبتاً بلند و چندواژه‌ای
        # از Prompt معلوم باشد؛ واژه‌های کوتاه/عمومی هرگز مختصات تولید نمی‌کنند.
        prompt_match = len(item_key) >= 20 and len(item_key.split()) >= 3 and item_key in prompt_key
        if not placeholder_match and not prompt_match:
            continue
        source = "paddleocr-placeholder" if placeholder_match else "paddleocr-existing-prompt"
        left, top, right, bottom = [float(value) for value in bounds]
        x = rect.left + ((left + right) / 2)
        y = rect.top + ((top + bottom) / 2)
        lower_safe_top = rect.top + max(140, int((rect.bottom - rect.top) * 0.55))
        if x <= rect.left or x >= rect.right or y <= lower_safe_top or y >= rect.bottom:
            continue
        matches.append({"x": x, "y": y, "text": text[:160], "confidence": confidence, "bottom": bottom, "source": source})
    if not matches:
        print("ARENA_STAGE5_OCR_PLACEHOLDER_NOT_FOUND: items=" + str(len(items)), flush=True)
        return None
    chosen = max(matches, key=lambda item: (item["bottom"], item["confidence"]))
    print("ARENA_STAGE5_OCR_PLACEHOLDER: confidence=" + format(chosen["confidence"], ".3f") + " text=" + chosen["text"], flush=True)
    return chosen

def ensure_pywinauto_input():
    progress_event("stage5", "s5-02", "running", "بررسی import و نصب خودکار در صورت نیاز")
    local = os.environ.get("LOCALAPPDATA", "")
    python_path = os.environ.get("WINDOWS_AGENT_OCR_PYTHON", "") or os.path.join(local, "Windows-Agent", "vision", ".venv", "Scripts", "python.exe")
    if not os.path.isfile(python_path):
        raise RuntimeError("محیط ایزوله Windows Agent برای نصب pywinauto پیدا نشد")
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    probe = subprocess.run([python_path, "-c", "import pywinauto"], text=True, capture_output=True, timeout=30, creationflags=flags)
    if probe.returncode:
        print("ARENA_STAGE5_PYWINAUTO_INSTALLING: package is not installed", flush=True)
        install = subprocess.run([python_path, "-m", "pip", "install", "--disable-pip-version-check", "pywinauto"], text=True, capture_output=True, encoding="utf-8", errors="replace", timeout=300, creationflags=flags)
        if install.returncode:
            detail = (install.stderr or install.stdout or "pip install failed")[-1600:]
            raise RuntimeError("نصب خودکار pywinauto ناموفق بود: " + detail)
        print("ARENA_STAGE5_PYWINAUTO_INSTALLED", flush=True)
    else:
        print("ARENA_STAGE5_PYWINAUTO_READY", flush=True)
    helper_path = os.path.join(ROOT, "stage5_pywinauto_input.py")
    helper = '''import sys
from pywinauto import keyboard, mouse

action = sys.argv[1] if len(sys.argv) > 1 else ""
if action == "click" and len(sys.argv) == 4:
    mouse.click(button="left", coords=(int(sys.argv[2]), int(sys.argv[3])))
elif action == "hotkey" and len(sys.argv) == 4:
    keys = {("ctrl", "a"): "^a", ("ctrl", "c"): "^c", ("ctrl", "v"): "^v"}
    sequence = keys.get((sys.argv[2].lower(), sys.argv[3].lower()))
    if not sequence:
        raise SystemExit("unsupported hotkey")
    keyboard.send_keys(sequence, pause=0.04)
elif action == "press" and len(sys.argv) == 3:
    keys = {"end": "{END}", "enter": "{ENTER}"}
    sequence = keys.get(sys.argv[2].lower())
    if not sequence:
        raise SystemExit("unsupported key")
    keyboard.send_keys(sequence, pause=0.04)
else:
    raise SystemExit("invalid pywinauto input action")
'''
    with open(helper_path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(helper)
    progress_event("stage5", "s5-02", "done", "pywinauto آماده است")
    return python_path, helper_path

UIA_PASTE_SCRIPT = r'''$ErrorActionPreference = "Stop"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Stage5Native {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
}
"@

function Progress-Step([string]$id, [string]$status, [string]$detail) {
    $script:CurrentProgressStep = $id
    $event = @{ id=$id; status=$status; detail=$detail; at=(Get-Date -Format "HH:mm:ss") } | ConvertTo-Json -Compress
    Add-Content -LiteralPath $env:PROGRESS_PATH -Value $event -Encoding UTF8
}
trap {
    if ($script:CurrentProgressStep) { Progress-Step $script:CurrentProgressStep "failed" $_.Exception.Message }
    break
}
function Input-Action([Parameter(ValueFromRemainingArguments=$true)][string[]]$ActionArgs) {
    $inputOutput = & $env:INPUT_PYTHON $env:INPUT_HELPER @ActionArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw ("pywinauto input failed: " + (($inputOutput | Out-String).Trim())) }
}
function Submit-VerifiedPrompt([IntPtr]$hwnd) {
    Progress-Step "s5-17" "running" "کنترل foreground/modifiers و guard ارسال تکراری"
    if ([Stage5Native]::GetForegroundWindow() -ne $hwnd) { throw "Target Chrome lost foreground immediately before Enter; submit was not attempted" }
    foreach ($vk in @(0x10, 0x11, 0x12)) {
        if (([Stage5Native]::GetAsyncKeyState($vk) -band 0x8000) -ne 0) { throw "Shift/Ctrl/Alt is physically down; Enter was not attempted" }
    }
    Input-Action press end
    Start-Sleep -Milliseconds 180
    if ([Stage5Native]::GetForegroundWindow() -ne $hwnd) { throw "Target Chrome lost foreground after verification; Enter was not attempted" }
    [IO.File]::WriteAllText($env:SUBMIT_GUARD_PATH, ("enter-attempted:" + $env:PROMPT_SHA256), [Text.UTF8Encoding]::new($false))
    Progress-Step "s5-17" "done" "enter-attempted guard پیش از ورودی ثبت شد"
    Progress-Step "s5-18" "running" "ارسال دقیقاً یک Enter"
    Input-Action press enter
    [IO.File]::WriteAllText($env:SUBMIT_GUARD_PATH, ("submitted:" + $env:PROMPT_SHA256), [Text.UTF8Encoding]::new($false))
    Progress-Step "s5-18" "done" "one Enter sent; submitted guard ثبت شد"
    Write-Output "ARENA_STAGE5_SINGLE_ENTER_SENT"
}

function Canonical([string]$value) {
    return (([string]$value -replace '[\u200C\u200D\u200E\u200F\uFEFF]', '') -replace '\s+', ' ').Trim()
}
function Comparable-ComposerText([string]$value) {
    if ($null -eq $value) { return "" }
    $normalized = ([string]$value).Normalize([Text.NormalizationForm]::FormC)
    $cr = [string][char]13
    $lf = [string][char]10
    $normalized = $normalized.Replace(($cr + $lf), $lf).Replace($cr, $lf).Replace([string][char]0x00A0, " ")
    $normalized = $normalized -replace '[\u200B\u200C\u200D\u200E\u200F\uFEFF]', ''
    # contenteditable در زمان Copy ممکن است فقط یک newline یا فاصله مرزی اضافه کند.
    # اختلاف داخلی، نشانه‌گذاری یا واژه‌ها همچنان پذیرفته نمی‌شود.
    return $normalized.Trim()
}
function Text-Sha256([string]$value) {
    $bytes = [Text.Encoding]::UTF8.GetBytes([string]$value)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant() } finally { $sha.Dispose() }
}
function Element-Text($element) {
    if (-not $element) { return "" }
    try {
        $pattern = $null
        if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
            $value = [string]$pattern.Current.Value
            if ($value) { return $value }
        }
    } catch {}
    try {
        $pattern = $null
        if ($element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) {
            $value = [string]$pattern.DocumentRange.GetText(-1)
            if ($value) { return $value }
        }
    } catch {}
    try { return [string]$element.Current.Name } catch { return "" }
}
function Is-Omnibox($element, $windowTop) {
    if (-not $element) { return $true }
    try {
        $rect = $element.Current.BoundingRectangle
        $identity = (([string]$element.Current.Name) + " " + ([string]$element.Current.AutomationId)).ToLowerInvariant()
        if ($identity -match 'address and search|omnibox|نوار نشانی|جستجو یا نشانی') { return $true }
        return $rect.Bottom -le ($windowTop + 145)
    } catch { return $true }
}
function Focus-Belongs-To($focused, $candidate, $x, $y) {
    if (-not $focused -or -not $candidate) { return $false }
    try {
        $rect = $focused.Current.BoundingRectangle
        if ($x -ge ($rect.Left - 20) -and $x -le ($rect.Right + 20) -and $y -ge ($rect.Top - 20) -and $y -le ($rect.Bottom + 20)) { return $true }
    } catch {}
    $node = $focused
    for ($depth = 0; $depth -lt 8 -and $node; $depth++) {
        try { if ([System.Windows.Automation.Automation]::Compare($node, $candidate)) { return $true } } catch {}
        try { $node = [System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($node) } catch { $node = $null }
    }
    $node = $candidate
    for ($depth = 0; $depth -lt 8 -and $node; $depth++) {
        try { if ([System.Windows.Automation.Automation]::Compare($node, $focused)) { return $true } } catch {}
        try { $node = [System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($node) } catch { $node = $null }
    }
    return $false
}
function Save-Shot([string]$path) {
    $bitmap = $null; $graphics = $null
    try {
        $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
        $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
        $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        if ($graphics) { $graphics.Dispose() }
        if ($bitmap) { $bitmap.Dispose() }
    }
}

$hwnd = [IntPtr]::new([long]$env:ARENA_HWND)
[void][Stage5Native]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 500
if ([Stage5Native]::GetForegroundWindow() -ne $hwnd) { throw "Chrome could not be confirmed as the foreground window; paste was not attempted" }
$window = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
if (-not $window) { throw "Chrome UI Automation root was not available; paste was not attempted" }
$windowRect = $window.Current.BoundingRectangle
Progress-Step "s5-06" "running" "اسکن UI Automation و fallback معنایی OCR"
$all = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$candidates = @()
foreach ($element in $all) {
    try {
        if (-not $element.Current.IsEnabled -or $element.Current.IsOffscreen) { continue }
        $rect = $element.Current.BoundingRectangle
        if ($rect.Width -lt 18 -or $rect.Height -lt 12 -or $rect.Height -gt 420) { continue }
        if ($rect.Left -lt ($windowRect.Left - 5) -or $rect.Right -gt ($windowRect.Right + 5)) { continue }
        if ($rect.Top -lt ($windowRect.Top + 145) -or $rect.Bottom -gt ($windowRect.Bottom + 5)) { continue }
        if ($rect.Top -lt ($windowRect.Top + ($windowRect.Height * 0.42))) { continue }
        $type = [string]$element.Current.ControlType.ProgrammaticName
        $name = [string]$element.Current.Name
        $id = [string]$element.Current.AutomationId
        $identity = ($name + " " + $id).ToLowerInvariant()
        if ($identity -match 'address and search|omnibox|نوار نشانی') { continue }

        # Chrome گاهی contenteditable آرنا را پیش از اولین کلیک keyboard-focusable اعلام نمی‌کند،
        # اما placeholder قابل مشاهده آن را به‌عنوان Text/Group در UIA منتشر می‌کند.
        $semanticPlaceholder = $identity -match 'what would you like|what do you want|message arena|send a message|type a message|ask arena|پرامپت|پیام خود|چه کاری'
        $hasEditablePattern = $false
        $pattern = $null
        if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) { $hasEditablePattern = -not $pattern.Current.IsReadOnly }
        $textPattern = $null
        $hasTextPattern = $element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$textPattern)
        $editableShape = $rect.Width -ge 180 -and $rect.Height -ge 24
        $editableRole = $type -match 'ControlType\.(Edit|Document)$' -or $hasEditablePattern -or ($hasTextPattern -and $element.Current.IsKeyboardFocusable)
        if (-not $semanticPlaceholder -and -not ($editableShape -and $editableRole)) { continue }

        $source = if ($semanticPlaceholder) { "semantic-placeholder" } else { "editable-role" }
        $score = if ($semanticPlaceholder) { 2200.0 } else { 0.0 }
        if ($element.Current.IsKeyboardFocusable) { $score += 180 }
        if ($type -match 'ControlType\.Edit$') { $score += 500 }
        if ($hasEditablePattern) { $score += 220 }
        $score += 300 * (($rect.Bottom - $windowRect.Top) / [Math]::Max(1, $windowRect.Height))
        $score += [Math]::Min(180, $rect.Width / 8)
        $candidates += [pscustomobject]@{ Element=$element; Rect=$rect; Score=$score; Type=$type; Name=$name; Id=$id; Source=$source }
    } catch {}
}
$candidates = @($candidates | Sort-Object Score -Descending)
Write-Output ("ARENA_STAGE5_UIA_CANDIDATES=" + $candidates.Count)
# وقتی Chrome درخت accessibility صفحه را منتشر نمی‌کند، فقط مختصات placeholder
# تأییدشده با PaddleOCR محلی پذیرفته می‌شود؛ fallback هندسی کور وجود ندارد.
if ($candidates.Count -eq 0 -and $env:ARENA_OCR_X -and $env:ARENA_OCR_Y) {
    try {
        $ocrX = [double]::Parse($env:ARENA_OCR_X, [System.Globalization.CultureInfo]::InvariantCulture)
        $ocrY = [double]::Parse($env:ARENA_OCR_Y, [System.Globalization.CultureInfo]::InvariantCulture)
        if ($ocrX -gt ($windowRect.Left + 10) -and $ocrX -lt ($windowRect.Right - 10) -and $ocrY -gt ($windowRect.Top + ($windowRect.Height * 0.42)) -and $ocrY -lt ($windowRect.Bottom - 5)) {
            $ocrPoint = [System.Windows.Point]::new($ocrX, $ocrY)
            $ocrElement = [System.Windows.Automation.AutomationElement]::FromPoint($ocrPoint)
            if (-not $ocrElement) { $ocrElement = $window }
            $ocrRect = [System.Windows.Rect]::new($ocrX - 3, $ocrY - 3, 6, 6)
            $ocrSource = if ($env:ARENA_OCR_SOURCE) { $env:ARENA_OCR_SOURCE } else { "paddleocr-placeholder" }
            $candidates = @([pscustomobject]@{ Element=$ocrElement; Rect=$ocrRect; Score=5000.0; Type="OCR.Semantic"; Name=$env:ARENA_OCR_TEXT; Id=""; Source=$ocrSource })
            Write-Output ("ARENA_STAGE5_OCR_CANDIDATE=" + [int]$ocrX + "," + [int]$ocrY)
        }
    } catch {
        Write-Output ("ARENA_STAGE5_OCR_CANDIDATE_ERROR=" + $_.Exception.Message)
    }
}
for ($candidateIndex = 0; $candidateIndex -lt [Math]::Min(8, $candidates.Count); $candidateIndex++) {
    $candidate = $candidates[$candidateIndex]
    $candidateName = ([string]$candidate.Name -replace '[\r\n]+', ' ')
    if ($candidateName.Length -gt 120) { $candidateName = $candidateName.Substring(0, 120) }
    Write-Output ("ARENA_STAGE5_CANDIDATE=" + $candidateIndex + ";source=" + $candidate.Source + ";type=" + $candidate.Type + ";rect=" + [int]$candidate.Rect.Left + "," + [int]$candidate.Rect.Top + "," + [int]$candidate.Rect.Width + "," + [int]$candidate.Rect.Height + ";name=" + $candidateName)
}
if ($candidates.Count -eq 0) { throw "No safe Arena composer or composer placeholder was exposed by Chrome UI Automation; paste was not attempted" }
$chosen = $candidates[0]
Progress-Step "s5-06" "done" ("source=" + $chosen.Source + "; candidates=" + $candidates.Count)
if ($chosen.Source -eq "editable-role" -and $candidates.Count -gt 1 -and $candidates[1].Source -eq "editable-role" -and [Math]::Abs($chosen.Score - $candidates[1].Score) -lt 12) {
    throw "Editable composer detection was ambiguous; paste was not attempted"
}
$composer = $chosen.Element
$composerRect = $chosen.Rect
$x = [int]($composerRect.Left + ($composerRect.Width / 2))
$y = [int]($composerRect.Top + ([Math]::Min($composerRect.Height - 10, [Math]::Max(14, $composerRect.Height / 2))))
Write-Output ("ARENA_STAGE5_COMPOSER_TYPE=" + $chosen.Type)
Write-Output ("ARENA_STAGE5_COMPOSER_RECT=" + [int]$composerRect.Left + "," + [int]$composerRect.Top + "," + [int]$composerRect.Width + "," + [int]$composerRect.Height)
Progress-Step "s5-07" "running" "کلیک و کنترل foreground/focus"
try { $composer.SetFocus() } catch {}
Start-Sleep -Milliseconds 250
Input-Action click ([string][int]$x) ([string][int]$y)
Start-Sleep -Milliseconds 450
$focused = [System.Windows.Automation.AutomationElement]::FocusedElement
if ($env:FOCUS_SHOT_PATH) { Save-Shot $env:FOCUS_SHOT_PATH }
$focusViaUia = Focus-Belongs-To $focused $composer $x $y
$focusViaOcr = ([string]$chosen.Source).StartsWith("paddleocr-") -and ([Stage5Native]::GetForegroundWindow() -eq $hwnd)
# در Chromeهایی که accessibility tree صفحه را منتشر نمی‌کنند، عنصر فوکوس‌شده
# الزاماً با عنصر FromPoint قابل مقایسه نیست. در مسیر OCR فقط foreground بودن همان
# Chrome و خارج‌بودن از omnibox پذیرفته می‌شود؛ سپس SelectAll/Copy پیش از Paste
# و Copy دقیق پس از Paste دو محافظ مستقل و اجباری هستند.
$focusSafe = (-not (Is-Omnibox $focused $windowRect.Top)) -and ($focusViaUia -or $focusViaOcr)
Write-Output ("ARENA_STAGE5_FOCUS_PROOF_UIA=" + [bool]$focusViaUia)
Write-Output ("ARENA_STAGE5_FOCUS_PROOF_OCR=" + [bool]$focusViaOcr)
Write-Output ("ARENA_STAGE5_FOCUS_SAFE_BEFORE_PASTE=" + [bool]$focusSafe)
if (-not $focusSafe) { throw "The focused element could not be safely associated with the Arena composer; paste was not attempted" }
Progress-Step "s5-07" "done" ("uia=" + [bool]$focusViaUia + "; ocr=" + [bool]$focusViaOcr)

# بازیابی امن پس از خطای گزارش‌گیری: پیش از هر Paste بررسی می‌شود آیا متن همین حالا
# کامل داخل composer است. در این حالت مرحله بدون Ctrl+V دوم موفق اعلام می‌شود.
$prompt = [IO.File]::ReadAllText($env:PROMPT_FILE)
$expectedNormalized = Comparable-ComposerText $prompt
Progress-Step "s5-08" "running" "ثبت sentinel تصادفی در Clipboard"
$preflightSentinel = "__ARENA_STAGE5_PREFLIGHT_$([Guid]::NewGuid().ToString('N'))__"
Set-Clipboard -Value $preflightSentinel
if ([string](Get-Clipboard -Raw) -ne $preflightSentinel) { throw "Clipboard sentinel round-trip failed" }
Progress-Step "s5-08" "done" "sentinel بدون افشای محتوا بازیابی شد"
Progress-Step "s5-09" "running" "یک Ctrl+A/C برای preflight"
Input-Action hotkey ctrl a
Start-Sleep -Milliseconds 120
Input-Action hotkey ctrl c
Start-Sleep -Milliseconds 350
$currentCopied = [string](Get-Clipboard -Raw)
$currentNormalized = Comparable-ComposerText $currentCopied
Progress-Step "s5-09" "done" ("copied-length=" + $currentCopied.Length)
Progress-Step "s5-10" "running" "طبقه‌بندی empty / exact / conflict"
Write-Output ("ARENA_STAGE5_PREFLIGHT_LENGTHS=expected:" + $expectedNormalized.Length + ";copied:" + $currentNormalized.Length)
Write-Output ("ARENA_STAGE5_PREFLIGHT_HASHES=expected:" + (Text-Sha256 $expectedNormalized) + ";copied:" + (Text-Sha256 $currentNormalized))
Input-Action press end
if ($currentNormalized -eq $expectedNormalized) {
    Progress-Step "s5-10" "done" "exact: Prompt کامل از قبل حاضر است"
    foreach ($skipId in @("s5-11","s5-12","s5-13","s5-14","s5-15","s5-16")) { Progress-Step $skipId "done" "بازیابی امن: Prompt موجود exact بود؛ Paste دوباره انجام نشد" }
    Write-Output "ARENA_STAGE5_ALREADY_PRESENT_VERIFIED"
    Submit-VerifiedPrompt $hwnd
    Progress-Step "s5-19" "running" "ثبت تصویر و result نهایی"
    Start-Sleep -Seconds 3
    Save-Shot $env:SHOT_PATH
    [IO.File]::WriteAllText($env:RESULT_PATH, "verified-existing-submitted", [Text.UTF8Encoding]::new($false))
    Progress-Step "s5-19" "done" ("verified-existing-submitted; screenshot=" + $env:SHOT_PATH)
    Write-Output "ARENA_STAGE5_EXISTING_PROMPT_SUBMITTED"
    exit 0
}
if ($currentCopied -ne $preflightSentinel -and $currentNormalized.Length -gt 0) {
    throw "The verified composer already contains different text; paste was not attempted"
}
Progress-Step "s5-10" "done" "empty: composer خالی تأیید شد"
Write-Output "ARENA_STAGE5_COMPOSER_EMPTY_VERIFIED"

Progress-Step "s5-11" "running" "قرار دادن Prompt کامل در Clipboard و کنترل length/SHA-256"
Get-Content -Raw -LiteralPath $env:PROMPT_FILE | Set-Clipboard
Start-Sleep -Milliseconds 250
$clipboardPrompt = [string](Get-Clipboard -Raw)
if ((Text-Sha256 $clipboardPrompt) -ne (Text-Sha256 $prompt) -or $clipboardPrompt.Length -ne $prompt.Length) { throw "Full Prompt Clipboard length/hash verification failed" }
Progress-Step "s5-11" "done" ("length=" + $clipboardPrompt.Length + "; sha256=" + (Text-Sha256 $clipboardPrompt))
Progress-Step "s5-12" "running" "ارسال دقیقاً یک Ctrl+V"
Input-Action hotkey ctrl v
Progress-Step "s5-12" "done" "one Ctrl+V sent"
Write-Output "ARENA_STAGE5_SINGLE_PASTE_SENT"
Start-Sleep -Milliseconds 2600
Progress-Step "s5-13" "running" "ثبت تصویر بعد از Paste و پیش از Enter"
if ($env:PASTE_SHOT_PATH) { Save-Shot $env:PASTE_SHOT_PATH }
Progress-Step "s5-13" "done" $env:PASTE_SHOT_PATH
Progress-Step "s5-14" "running" "بازبینی foreground/focus بعد از Paste"
$focusedAfter = [System.Windows.Automation.AutomationElement]::FocusedElement
$focusAfterViaUia = Focus-Belongs-To $focusedAfter $composer $x $y
$focusAfterViaOcr = ([string]$chosen.Source).StartsWith("paddleocr-") -and ([Stage5Native]::GetForegroundWindow() -eq $hwnd)
$focusSafeAfter = (-not (Is-Omnibox $focusedAfter $windowRect.Top)) -and ($focusAfterViaUia -or $focusAfterViaOcr)
Write-Output ("ARENA_STAGE5_FOCUS_AFTER_UIA=" + [bool]$focusAfterViaUia)
Write-Output ("ARENA_STAGE5_FOCUS_AFTER_OCR=" + [bool]$focusAfterViaOcr)
Write-Output ("ARENA_STAGE5_FOCUS_SAFE_AFTER_PASTE=" + [bool]$focusSafeAfter)
if (-not $focusSafeAfter) { throw "Focus left the verified Arena composer after the single paste; paste was not repeated" }
Progress-Step "s5-14" "done" ("uia=" + [bool]$focusAfterViaUia + "; ocr=" + [bool]$focusAfterViaOcr)

$promptCanonical = Canonical $prompt
$uiaCanonical = Canonical ((Element-Text $focusedAfter) + " " + (Element-Text $composer))
$probeLength = [Math]::Min(32, $promptCanonical.Length)
$probeHit = $false
if ($probeLength -gt 0) {
    $maxOffset = [Math]::Max(0, $promptCanonical.Length - $probeLength)
    foreach ($offset in @(0, [int]($maxOffset / 3), [int](2 * $maxOffset / 3), $maxOffset) | Select-Object -Unique) {
        if ($uiaCanonical.Contains($promptCanonical.Substring($offset, $probeLength))) { $probeHit = $true; break }
    }
}
Write-Output ("ARENA_STAGE5_UIA_PROBE=" + [bool]$probeHit)

Progress-Step "s5-15" "running" "Copy-back مستقل با Ctrl+A/C"
$sentinel = "__ARENA_STAGE5_VERIFY_$([Guid]::NewGuid().ToString('N'))__"
Set-Clipboard -Value $sentinel
Input-Action hotkey ctrl a
Start-Sleep -Milliseconds 120
Input-Action hotkey ctrl c
Start-Sleep -Milliseconds 450
$copied = [string](Get-Clipboard -Raw)
Progress-Step "s5-15" "done" ("copied-length=" + $copied.Length)
Progress-Step "s5-16" "running" "مقایسه length/hash/normalized equality"
$expectedRawNormalized = $prompt -replace '\r', ''
$copiedRawNormalized = $copied -replace '\r', ''
$expectedNormalized = Comparable-ComposerText $prompt
$copiedNormalized = Comparable-ComposerText $copied
$exactCopy = $copiedRawNormalized -eq $expectedRawNormalized
$composerEquivalent = $copiedNormalized -eq $expectedNormalized
Write-Output ("ARENA_STAGE5_EXACT_COPY=" + [bool]$exactCopy)
Write-Output ("ARENA_STAGE5_COMPOSER_EQUIVALENT=" + [bool]$composerEquivalent)
Write-Output ("ARENA_STAGE5_VERIFY_LENGTHS=expected:" + $expectedNormalized.Length + ";copied:" + $copiedNormalized.Length)
Write-Output ("ARENA_STAGE5_VERIFY_HASHES=expected:" + (Text-Sha256 $expectedNormalized) + ";copied:" + (Text-Sha256 $copiedNormalized))
if (-not $composerEquivalent) { throw "The composer selection did not match the prompt after normalization of contenteditable boundary whitespace; paste and Enter were not repeated" }
Progress-Step "s5-16" "done" ("normalized-length=" + $expectedNormalized.Length + "; sha256=" + (Text-Sha256 $expectedNormalized))
Submit-VerifiedPrompt $hwnd
Progress-Step "s5-19" "running" "ثبت تصویر و result نهایی"
Start-Sleep -Seconds 3
Save-Shot $env:SHOT_PATH
[IO.File]::WriteAllText($env:RESULT_PATH, "verified-pasted-submitted", [Text.UTF8Encoding]::new($false))
Progress-Step "s5-19" "done" ("verified-pasted-submitted; screenshot=" + $env:SHOT_PATH)
Write-Output "ARENA_STAGE5_PASTE_VERIFIED_AND_SUBMITTED"
'''

try:
    prompt_path = os.path.join(ROOT, "next-prompt.txt")
    with open(prompt_path, "r", encoding="utf-8") as handle:
        prompt = handle.read()
    expected_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    if expected_hash != read_state().get("promptSha256"):
        raise RuntimeError("هش Prompt ذخیره‌شده با پاسخ API تطبیق ندارد")
    progress_event("stage5", "s5-01", "done", "decision و SHA-256 معتبر است")
    submit_guard_path = os.path.join(ROOT, "stage5-submit-guard.txt")
    try:
        with open(submit_guard_path, "r", encoding="utf-8") as handle:
            prior_submit_guard = handle.read().strip()
    except OSError:
        prior_submit_guard = ""
    if prior_submit_guard in ("enter-attempted:" + expected_hash, "submitted:" + expected_hash):
        raise RuntimeError("برای همین Prompt قبلاً Enter ارسال یا تلاش شده است؛ برای جلوگیری از ارسال تکراری مرحله دوباره اجرا نشد")
    input_python, input_helper = ensure_pywinauto_input()
    progress_event("stage5", "s5-03", "running", "جست‌وجوی HWND پنجره Chrome Arena")
    target = find_chrome_window()
    if not target:
        raise RuntimeError("پنجره واقعی Chrome پیدا نشد؛ هیچ Paste انجام نشد")
    _, hwnd, rect, title = target
    user32 = ctypes.windll.user32
    user32.ShowWindow(hwnd, 9)
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.8)
    progress_event("stage5", "s5-03", "done", "Chrome Arena foreground شد؛ HWND=" + str(hwnd))
    progress_event("stage5", "s5-04", "running", "ثبت تصویر پنجره واقعی Chrome")
    ocr_shot_path = os.path.join(ROOT, "stage5-before-paste-ocr.png")
    capture_chrome_for_ocr(rect, ocr_shot_path)
    progress_event("stage5", "s5-04", "done", ocr_shot_path)
    progress_event("stage5", "s5-05", "running", "اجرای helper محلی PaddleOCR")
    ocr_point = composer_point_from_local_ocr(rect, ocr_shot_path, prompt)
    progress_event("stage5", "s5-05", "done" if ocr_point else "failed", (ocr_point.get("source") + ": " + ocr_point.get("text", "")[:80]) if ocr_point else "هیچ placeholder یا بخش شناخته‌شده Prompt پیدا نشد")
    script_path = os.path.join(ROOT, "stage5-uia-paste.ps1")
    with open(script_path, "w", encoding="utf-8-sig", newline="\n") as handle:
        handle.write(UIA_PASTE_SCRIPT)
    focus_shot_path = os.path.join(ROOT, "stage5-after-focus.png")
    paste_shot_path = os.path.join(ROOT, "stage5-after-paste-before-submit.png")
    shot_path = os.path.join(ROOT, "stage5-after-submit.png")
    result_path = os.path.join(ROOT, "stage5-result.txt")
    try:
        os.remove(result_path)
    except FileNotFoundError:
        pass
    env = os.environ.copy()
    env.update({
        "ARENA_HWND": str(hwnd),
        "PROMPT_FILE": prompt_path,
        "SHOT_PATH": shot_path,
        "FOCUS_SHOT_PATH": focus_shot_path,
        "PASTE_SHOT_PATH": paste_shot_path,
        "RESULT_PATH": result_path,
        "INPUT_PYTHON": input_python,
        "INPUT_HELPER": input_helper,
        "SUBMIT_GUARD_PATH": submit_guard_path,
        "PROMPT_SHA256": expected_hash,
        "ARENA_OCR_X": str(ocr_point["x"]) if ocr_point else "",
        "ARENA_OCR_Y": str(ocr_point["y"]) if ocr_point else "",
        "ARENA_OCR_TEXT": str(ocr_point["text"]) if ocr_point else "",
        "ARENA_OCR_SOURCE": str(ocr_point["source"]) if ocr_point else "",
        "PROGRESS_PATH": progress_path("stage5"),
    })
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-File", script_path], env=env, text=True, capture_output=True, timeout=60, creationflags=flags)
    artifact_run = str(int(time.time() * 1000))
    for artifact_id, artifact_path, artifact_stage in (
        ("stage5-ocr-" + artifact_run, ocr_shot_path, "stage5-before-ocr"),
        ("stage5-focus-" + artifact_run, focus_shot_path, "stage5-after-focus"),
        ("stage5-pasted-" + artifact_run, paste_shot_path, "stage5-after-paste-before-submit"),
        ("stage5-final-" + artifact_run, shot_path, "stage5-after-submit"),
    ):
        if os.path.isfile(artifact_path):
            print("SERVICE_ARTIFACT: " + json.dumps({"artifactId": artifact_id, "kind": "screenshot", "stage": artifact_stage, "name": os.path.basename(artifact_path), "localPath": artifact_path, "mimeType": "image/png"}, ensure_ascii=False), flush=True)
    stdout = result.stdout or ""
    stderr = result.stderr or ""
    diagnostics = " | ".join(line.strip() for line in stdout.splitlines() if line.strip())[-3000:]
    try:
        with open(result_path, "r", encoding="utf-8") as handle:
            result_marker = handle.read().strip()
    except OSError:
        result_marker = ""
    if result.returncode or result_marker not in ("verified-pasted-submitted", "verified-existing-submitted"):
        error = " | ".join(part for part in (diagnostics, stderr.strip()) if part) or "UI Automation paste verification failed"
        raise RuntimeError(error[-3000:])
    if not os.path.isfile(shot_path):
        raise RuntimeError("Paste تأیید شد اما تصویر مرحله پس از Paste ذخیره نشد")
    recovered = result_marker == "verified-existing-submitted"
    success_message = "متن همین Prompt از قبل کامل داخل composer بود؛ بدون Paste تکراری تأیید و با یک Enter ارسال شد." if recovered else "composer واقعی Arena تأیید شد؛ pywinauto دقیقاً یک Ctrl+V و پس از تطبیق مستقل متن دقیقاً یک Enter برای Send ارسال کرد."
    submitted_at = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    write_state(paste="done", pasteVerified=True, pasteMethod="pywinauto-existing-prompt-submit" if recovered else "pywinauto-single-ctrl-v-submit", pasteScreenshot=shot_path, submit="done", lastSubmittedPromptSha256=expected_hash, submittedAt=submitted_at, browserWindowTitle=title, message=success_message)
    print(("ARENA_EXISTING_PROMPT_SUBMITTED" if recovered else "ARENA_PROMPT_PASTED_AND_SUBMITTED") + ": sha256=" + expected_hash + " chars=" + str(len(prompt)), flush=True)
    print("ARENA_STAGE5_DIAGNOSTICS: " + diagnostics, flush=True)
except Exception as exc:
    fail_current_progress("stage5", str(exc))
    write_state(paste="failed", pasteVerified=False, submit="failed", message="مرحله Paste/Submit امن متوقف شد؛ Paste یا Enter تکرار نمی‌شود: " + str(exc))
    raise
`;
const SUBMIT_CODE = String.raw`${ROOT_SETUP}
import hashlib

reset_progress("stage6")
current_step = "s6-01"
progress_event("stage6", current_step, "running", "خواندن state، Prompt و SHA-256")
try:
    state = read_state()
    prompt_path = os.path.join(ROOT, "next-prompt.txt")
    with open(prompt_path, "r", encoding="utf-8") as handle:
        prompt = handle.read()
    digest = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    progress_event("stage6", current_step, "done", "length=" + str(len(prompt)) + "; sha256=" + digest)

    current_step = "s6-02"
    progress_event("stage6", current_step, "running", "تطبیق submit=done و lastSubmittedPromptSha256")
    if state.get("submit") != "done" or state.get("lastSubmittedPromptSha256") != digest:
        raise RuntimeError("مرحله ۵ ارسال تأییدشده‌ای برای این Prompt ثبت نکرده است")
    progress_event("stage6", current_step, "done", "ثبت مرحله ۵ دقیقاً با هش فعلی منطبق است")

    current_step = "s6-03"
    progress_event("stage6", current_step, "running", "این سلول هیچ کتابخانه ورودی یا فرمان صفحه‌کلید اجرا نمی‌کند")
    progress_event("stage6", current_step, "done", "NO-INPUT: بدون Ctrl+V و بدون Enter")
    print("ARENA_STAGE6_NOOP_ALREADY_SUBMITTED_IN_STAGE5: sha256=" + digest, flush=True)
    write_state(message="Prompt در مرحله ۵ با یک Enter ارسال شده است؛ مرحله ۶ فقط state/hash را خواند و هیچ کلیدی نزد.")
except Exception as exc:
    progress_event("stage6", current_step, "failed", str(exc))
    write_state(submit="failed", message="کنترل بدون ورودی مرحله ۶ متوقف شد: " + str(exc))
    raise
`;

export interface ArenaApiNotebookCellTemplate {
  id: string;
  title: string;
  language: "python";
  content: string;
  notes: string;
  transition: "manual" | "on_success";
  executionMode: "blocking" | "background";
  executable: boolean;
}

export function arenaApiNotebookCells(): ArenaApiNotebookCellTemplate[] {
  return [
    { id: "arena-status-dashboard", title: "۱. نمایش رابط وضعیت منظم", language: "python", content: DASHBOARD_CODE, notes: "یک پنجره پایش مستقل باز می‌کند و وضعیت هر شش مرحله را از فایل state محلی نمایش می‌دهد.", transition: "manual", executionMode: "background", executable: true },
    { id: "arena-api-credentials", title: "۲. دریافت امن API Key از Python", language: "python", content: CREDENTIALS_CODE, notes: "دامنه https://salitest.ir ثابت است و فقط Key در خود دسکتاپ گرفته می‌شود. Key با Windows DPAPI رمز می‌شود و در stdout یا PostgreSQL قرار نمی‌گیرد.", transition: "manual", executionMode: "blocking", executable: true },
    { id: "arena-fetch-next-prompt", title: "۳. خواندن decision از GET /handoff", language: "python", content: FETCH_PROMPT_CODE, notes: "فقط GET https://salitest.ir/api/agent/v1/handoff با Bearer اجرا می‌شود. decision.action ملاک قطعی است؛ Prompt تنها در run_next پذیرفته و از ارسال تکراری جلوگیری می‌شود.", transition: "manual", executionMode: "blocking", executable: true },
    { id: "arena-open-and-stabilize", title: "۴. بازکردن Chrome واقعی و انتظار برای پایداری", language: "python", content: BROWSER_CODE, notes: "Chrome واقعی کاربر با پروفایل عادی Windows باز می‌شود؛ بدون Playwright، CDP، remote-debugging یا user-data-dir. پایداری با سه تصویر ادراکیِ مشابه سنجیده می‌شود تا انیمیشن‌های کوچک باعث خطای کاذب نشوند؛ تصویربرداری بدون پنجره کنسول انجام می‌شود.", transition: "manual", executionMode: "blocking", executable: true },
    { id: "arena-paste-once", title: "۵. Paste و Send یک‌باره با pywinauto", language: "python", content: PASTE_CODE, notes: "در صورت نبود pywinauto آن را خودکار در محیط ایزوله Windows Agent نصب می‌کند. composer با UI Automation یا placeholder تأییدشده PaddleOCR پیدا می‌شود؛ سپس دقیقاً یک Ctrl+V، تطبیق مستقل متن و دقیقاً یک Enter برای Send اجرا می‌شود. محافظ ثبت ارسال مانع تکرار Enter است.", transition: "manual", executionMode: "blocking", executable: true },
    { id: "arena-submit-enter", title: "۶. تأیید ثبت ارسال (بدون کلید مجدد)", language: "python", content: SUBMIT_CODE, notes: "ارسال اکنون در مرحله ۵ انجام می‌شود. این مرحله فقط ثبت موفقیت و هش Prompt را کنترل می‌کند و برای جلوگیری از ارسال دوباره هیچ Enter یا ورودی دیگری نمی‌زند.", transition: "manual", executionMode: "blocking", executable: true },
  ];
}
