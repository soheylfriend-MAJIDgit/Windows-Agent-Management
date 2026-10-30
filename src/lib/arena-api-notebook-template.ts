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
    ("paste", "۵. Paste دقیقاً یک‌باره از Clipboard"),
    ("submit", "۶. Enter برای Send / Submit"),
]
LABELS = {"waiting": "منتظر", "running": "در حال اجرا", "done": "انجام شد", "failed": "متوقف شد", "skipped": "اجرا نمی‌شود"}
COLORS = {"waiting": "#64748b", "running": "#f59e0b", "done": "#10b981", "failed": "#ef4444", "skipped": "#8b5cf6"}
write_state(dashboard="running", credentials="waiting", prompt="waiting", browser="waiting", paste="waiting", submit="waiting", pasteVerified=False, chainStatus="pending", message="رابط وضعیت آماده شد؛ مرحله دریافت API Key در ادامه باز می‌شود.")

window = tk.Tk()
window.title("Arena · اجرای پرامپت بعدی")
window.geometry("820x620")
window.minsize(700, 540)
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
footer_text = tk.StringVar(value="پنجره وضعیت فعال است…")
tk.Label(window, textvariable=footer_text, bg="#0f172a", fg="#7dd3fc", font=("Segoe UI", 9), anchor="e").pack(fill="x", padx=24, pady=14)

def refresh():
    state = read_state()
    for key, _ in STAGES:
        status = str(state.get(key, "waiting"))
        if key == "dashboard" and status == "running":
            status = "done"
        badge, report = rows[key]
        badge.configure(text=LABELS.get(status, status), bg=COLORS.get(status, "#334155"))
        report.configure(text=str(state.get(key + "Report") or "هنوز گزارشی ثبت نشده است."), fg="#86efac" if status == "done" else "#fca5a5" if status == "failed" else "#94a3b8")
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
import ctypes, hashlib, shutil, subprocess
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
    return max(windows, default=None, key=lambda item: item[0])

def window_hash(rect, path):
    width, height = rect.right - rect.left, rect.bottom - rect.top
    env = os.environ.copy()
    env.update({"SHOT_X": str(rect.left), "SHOT_Y": str(rect.top), "SHOT_W": str(width), "SHOT_H": str(height), "SHOT_PATH": path})
    script = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Drawing; $b=New-Object Drawing.Bitmap([int]$env:SHOT_W,[int]$env:SHOT_H); $g=[Drawing.Graphics]::FromImage($b); try{$g.CopyFromScreen([int]$env:SHOT_X,[int]$env:SHOT_Y,0,0,$b.Size);$b.Save($env:SHOT_PATH,[Drawing.Imaging.ImageFormat]::Png)}finally{$g.Dispose();$b.Dispose()}"
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], env=env, text=True, capture_output=True, timeout=30)
    if result.returncode or not os.path.isfile(path):
        raise RuntimeError((result.stderr or result.stdout or "window screenshot failed").strip())
    with open(path, "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()

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
    previous = None
    while time.monotonic() < deadline:
        target = find_chrome_window()
        if not target:
            stable = 0
            time.sleep(2)
            continue
        _, hwnd, rect, title = target
        digest = window_hash(rect, shot_path)
        stable = stable + 1 if digest == previous else 1
        previous = digest
        if stable >= 3:
            write_state(browser="done", browserWindowTitle=title, message="Chrome واقعی با پروفایل عادی باز شد و تصویر پنجره در سه بررسی متوالی پایدار بود.")
            print("ARENA_REAL_CHROME_STABLE: native window screenshots stable", flush=True)
            break
        time.sleep(3)
    else:
        raise RuntimeError("تصویر پنجره Chrome طی زمان مجاز پایدار نشد")
except Exception as exc:
    write_state(browser="failed", message="بازکردن Chrome واقعی متوقف شد: " + str(exc))
    raise
`;

const PASTE_CODE = String.raw`${ROOT_SETUP}
import ctypes, hashlib, subprocess
from ctypes import wintypes

if read_state().get("chainStatus") != "continue":
    write_state(paste="skipped", message="decision.action اجازه ادامه نمی‌دهد؛ هیچ Paste انجام نمی‌شود.")
    print("ARENA_PASTE_SKIPPED: decision does not allow continuation", flush=True)
    raise SystemExit(0)
write_state(paste="running", message="در حال Paste یک‌باره با Clipboard و کلیدهای واقعی Windows…")

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
                        windows.append((area, hwnd, rect))
        return True
    user32.EnumWindows(callback_type(callback), 0)
    return max(windows, default=None, key=lambda item: item[0])

def key(vk, down):
    ctypes.windll.user32.keybd_event(vk, 0, 0 if down else 2, 0)
def chord(modifier, key_code):
    key(modifier, True); key(key_code, True); key(key_code, False); key(modifier, False)
def read_clipboard():
    verify_path = os.path.join(ROOT, "clipboard-verify.txt")
    env = os.environ.copy(); env["VERIFY_PATH"] = verify_path
    command = "$v=Get-Clipboard -Raw; [IO.File]::WriteAllText($env:VERIFY_PATH,[string]$v,[Text.UTF8Encoding]::new($false))"
    result = subprocess.run(["powershell.exe", "-NoProfile", "-STA", "-Command", command], env=env, text=True, capture_output=True, timeout=15)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip())
    with open(verify_path, "r", encoding="utf-8") as handle:
        return handle.read()

def normalized(value):
    return value.replace("\r\n", "\n").replace("\r", "\n")

try:
    prompt_path = os.path.join(ROOT, "next-prompt.txt")
    with open(prompt_path, "r", encoding="utf-8") as handle:
        prompt = handle.read()
    expected_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    if expected_hash != read_state().get("promptSha256"):
        raise RuntimeError("هش Prompt ذخیره‌شده با پاسخ API تطبیق ندارد")
    target = find_chrome_window()
    if not target:
        raise RuntimeError("پنجره واقعی Chrome پیدا نشد؛ هیچ Paste انجام نشد")
    _, hwnd, rect = target
    user32 = ctypes.windll.user32
    user32.ShowWindow(hwnd, 9)
    if not user32.SetForegroundWindow(hwnd):
        raise RuntimeError("فعال‌کردن پنجره Chrome ممکن نشد؛ هیچ Paste انجام نشد")
    # یک کلیک واقعی در محل composer پایین پنجره؛ در صورت عدم تطبیق، کلیک/Paste تکرار نمی‌شود.
    x = rect.left + (rect.right - rect.left) // 2
    y = rect.bottom - 135
    user32.SetCursorPos(x, y)
    user32.mouse_event(0x0002, 0, 0, 0, 0); user32.mouse_event(0x0004, 0, 0, 0, 0)
    time.sleep(0.8)
    env = os.environ.copy(); env["PROMPT_FILE"] = prompt_path
    result = subprocess.run(["powershell.exe", "-NoProfile", "-STA", "-Command", "Get-Content -Raw -LiteralPath $env:PROMPT_FILE | Set-Clipboard"], env=env, text=True, capture_output=True, timeout=15)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip())
    chord(0x11, 0x56)
    time.sleep(1.2)
    chord(0x11, 0x41); chord(0x11, 0x43)
    time.sleep(0.5)
    actual = read_clipboard()
    if normalized(actual) != normalized(prompt):
        write_state(paste="failed", message="Paste فقط یک بار انجام شد اما متن کنترل فعال با Prompt تطبیق ندارد؛ عملیات بدون تکرار متوقف شد.")
        raise RuntimeError("native clipboard verification mismatch after the single allowed paste")
    key(0x23, True); key(0x23, False)
    write_state(paste="done", pasteVerified=True, message="Ctrl+V واقعی Windows دقیقاً یک بار انجام شد و متن کنترل فعال با Prompt تطبیق داشت.")
    print("ARENA_NATIVE_PROMPT_PASTED_ONCE: sha256=" + expected_hash + " chars=" + str(len(prompt)), flush=True)
except Exception as exc:
    if read_state().get("paste") != "failed":
        write_state(paste="failed", message="مرحله Paste واقعی متوقف شد: " + str(exc))
    raise
`;

const SUBMIT_CODE = String.raw`${ROOT_SETUP}
import ctypes, hashlib, subprocess
from ctypes import wintypes

if read_state().get("chainStatus") != "continue":
    write_state(submit="skipped", message="decision.action اجازه ادامه نمی‌دهد؛ Enter ارسال نمی‌شود.")
    print("ARENA_SUBMIT_SKIPPED: decision does not allow continuation", flush=True)
    raise SystemExit(0)
write_state(submit="running", message="در حال بررسی متن و ارسال Enter واقعی Windows بدون modifier…")

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
                        windows.append((area, hwnd, rect))
        return True
    user32.EnumWindows(callback_type(callback), 0)
    return max(windows, default=None, key=lambda item: item[0])
def key(vk, down):
    ctypes.windll.user32.keybd_event(vk, 0, 0 if down else 2, 0)
def chord(modifier, key_code):
    key(modifier, True); key(key_code, True); key(key_code, False); key(modifier, False)
def read_clipboard():
    verify_path = os.path.join(ROOT, "clipboard-submit-verify.txt")
    env = os.environ.copy(); env["VERIFY_PATH"] = verify_path
    command = "$v=Get-Clipboard -Raw; [IO.File]::WriteAllText($env:VERIFY_PATH,[string]$v,[Text.UTF8Encoding]::new($false))"
    result = subprocess.run(["powershell.exe", "-NoProfile", "-STA", "-Command", command], env=env, text=True, capture_output=True, timeout=15)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip())
    with open(verify_path, "r", encoding="utf-8") as handle:
        return handle.read()
def normalized(value):
    return value.replace("\r\n", "\n").replace("\r", "\n")

try:
    state = read_state()
    if state.get("paste") != "done" or state.get("pasteVerified") is not True:
        raise RuntimeError("Paste تأیید نشده است؛ Enter ارسال نمی‌شود")
    with open(os.path.join(ROOT, "next-prompt.txt"), "r", encoding="utf-8") as handle:
        prompt = handle.read()
    target = find_chrome_window()
    if not target:
        raise RuntimeError("پنجره واقعی Chrome پیدا نشد؛ Enter ارسال نمی‌شود")
    _, hwnd, rect = target
    user32 = ctypes.windll.user32
    user32.ShowWindow(hwnd, 9); user32.SetForegroundWindow(hwnd)
    x = rect.left + (rect.right - rect.left) // 2; y = rect.bottom - 135
    user32.SetCursorPos(x, y)
    user32.mouse_event(0x0002, 0, 0, 0, 0); user32.mouse_event(0x0004, 0, 0, 0, 0)
    time.sleep(0.5)
    chord(0x11, 0x41); chord(0x11, 0x43); time.sleep(0.5)
    if normalized(read_clipboard()) != normalized(prompt):
        raise RuntimeError("متن کنترل فعال پیش از Enter با Prompt API تطبیق ندارد؛ ارسال لغو شد")
    key(0x23, True); key(0x23, False)
    if user32.GetKeyState(0x10) < 0 or user32.GetKeyState(0x11) < 0 or user32.GetKeyState(0x12) < 0:
        raise RuntimeError("یکی از Shift/Ctrl/Alt پایین است؛ Enter ارسال نشد")
    key(0x0D, True); key(0x0D, False)
    time.sleep(3)
    digest = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    write_state(submit="done", lastSubmittedPromptSha256=digest, submittedAt=time.strftime("%Y-%m-%dT%H:%M:%S%z"), message="Enter واقعی Windows بدون Shift/Ctrl/Alt یک بار برای Send/Submit ارسال شد.")
    print("ARENA_NATIVE_PROMPT_SUBMITTED_WITH_ENTER: sha256=" + digest, flush=True)
except Exception as exc:
    write_state(submit="failed", message="ارسال Enter واقعی متوقف شد: " + str(exc))
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
    { id: "arena-open-and-stabilize", title: "۴. بازکردن Chrome واقعی و انتظار برای پایداری", language: "python", content: BROWSER_CODE, notes: "Chrome واقعی کاربر با پروفایل عادی Windows باز می‌شود؛ بدون Playwright، CDP، remote-debugging یا user-data-dir. پایداری با سه تصویر یکسان از پنجره سنجیده می‌شود.", transition: "manual", executionMode: "blocking", executable: true },
    { id: "arena-paste-once", title: "۵. Paste یک‌باره از Clipboard واقعی", language: "python", content: PASTE_CODE, notes: "با یک کلیک و Ctrl+V واقعی Windows انجام می‌شود؛ سپس Ctrl+A/C متن کنترل فعال را تطبیق می‌دهد. در خطا Paste تکرار نمی‌شود.", transition: "manual", executionMode: "blocking", executable: true },
    { id: "arena-submit-enter", title: "۶. Enter واقعی برای Send / Submit", language: "python", content: SUBMIT_CODE, notes: "متن کنترل فعال دوباره با Clipboard واقعی بررسی می‌شود و Enter بدون Shift/Ctrl/Alt دقیقاً یک بار ارسال می‌شود.", transition: "manual", executionMode: "blocking", executable: true },
  ];
}
