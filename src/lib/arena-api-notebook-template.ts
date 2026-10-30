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
window.geometry("720x520")
window.minsize(620, 460)
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
    badge = tk.Label(row, text="منتظر", width=13, bg="#334155", fg="white", font=("Segoe UI", 9, "bold"), pady=9)
    badge.pack(side="left", padx=8, pady=7)
    tk.Label(row, text=title, bg="#172033", fg="#e2e8f0", font=("Segoe UI", 11), anchor="e").pack(side="right", fill="x", expand=True, padx=14)
    rows[key] = badge
footer_text = tk.StringVar(value="پنجره وضعیت فعال است…")
tk.Label(window, textvariable=footer_text, bg="#0f172a", fg="#7dd3fc", font=("Segoe UI", 9), anchor="e").pack(fill="x", padx=24, pady=14)

def refresh():
    state = read_state()
    for key, _ in STAGES:
        status = str(state.get(key, "waiting"))
        if key == "dashboard" and status == "running":
            status = "done"
        rows[key].configure(text=LABELS.get(status, status), bg=COLORS.get(status, "#334155"))
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
import shutil, subprocess, urllib.request

ARENA_URL = "https://arena.ai/agent/01a18017-9552-70af-b937-b790a82b79b3"
PORT = 9222
if read_state().get("chainStatus") != "continue":
    write_state(browser="skipped", message="decision.action اجازه ادامه نمی‌دهد؛ Chrome باز نمی‌شود.")
    print("ARENA_BROWSER_SKIPPED: chain status does not allow continuation", flush=True)
    raise SystemExit(0)
write_state(browser="running", message="در حال بازکردن Chrome و انتظار برای توقف نشانگر بارگذاری…")

def chrome_path():
    candidates = [
        os.path.join(os.environ.get("PROGRAMFILES", ""), "Google", "Chrome", "Application", "chrome.exe"),
        os.path.join(os.environ.get("PROGRAMFILES(X86)", ""), "Google", "Chrome", "Application", "chrome.exe"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "Application", "chrome.exe"),
        shutil.which("chrome.exe"),
    ]
    return next((path for path in candidates if path and os.path.isfile(path)), None)

PS_HELPER = r'''param([int]$Port = 9222)
$ErrorActionPreference = "Stop"
$targets = Invoke-RestMethod -Uri ("http://127.0.0.1:" + $Port + "/json/list") -TimeoutSec 5
$target = $targets | Where-Object { $_.type -eq "page" -and $_.url -like "https://arena.ai/agent/*" } | Select-Object -First 1
if (-not $target) { throw "Arena page target not found" }
$expr = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:CDP_EXPRESSION_B64))
$socket = [Net.WebSockets.ClientWebSocket]::new()
$socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
try {
  $request = @{id=71;method="Runtime.evaluate";params=@{expression=$expr;returnByValue=$true;awaitPromise=$true}} | ConvertTo-Json -Depth 8 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($request)
  $socket.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  $stream = [IO.MemoryStream]::new()
  do {
    $buffer = New-Object byte[] 65536
    $read = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $stream.Write($buffer, 0, $read.Count)
  } while (-not $read.EndOfMessage)
  $response = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
  if ($response.error) { throw ($response.error | ConvertTo-Json -Compress) }
  $response.result.result.value | ConvertTo-Json -Depth 8 -Compress
} finally {
  if ($socket.State -eq [Net.WebSockets.WebSocketState]::Open) { $socket.CloseAsync([Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [Threading.CancellationToken]::None).GetAwaiter().GetResult() }
  $socket.Dispose()
}'''
helper_path = os.path.join(ROOT, "cdp-evaluate.ps1")
with open(helper_path, "w", encoding="utf-8-sig") as handle:
    handle.write(PS_HELPER)

def evaluate(expression):
    import base64
    env = os.environ.copy()
    env["CDP_EXPRESSION_B64"] = base64.b64encode(expression.encode("utf-8")).decode("ascii")
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", helper_path, "-Port", str(PORT)], env=env, text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip())
    return json.loads(result.stdout.strip() or "null")
try:
    chrome = chrome_path()
    if not chrome:
        raise RuntimeError("Google Chrome روی ویندوز پیدا نشد")
    profile = os.path.join(os.environ.get("LOCALAPPDATA", ROOT), "Windows-Agent", "ArenaAutomationChrome")
    subprocess.Popen([chrome, "--remote-debugging-port=" + str(PORT), "--user-data-dir=" + profile, "--new-window", ARENA_URL], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.monotonic() + 180
    stable = 0
    last_signature = None
    expression = r'''(() => {
      const visible = e => { const s=getComputedStyle(e), r=e.getBoundingClientRect(); return s.display!=="none" && s.visibility!=="hidden" && r.width>3 && r.height>3; };
      const busy = [...document.querySelectorAll('[aria-busy="true"],[role="progressbar"],[class*="spinner" i],[class*="loading" i],[data-loading="true"]')].some(visible);
      const composer = [...document.querySelectorAll('textarea,[contenteditable="true"]')].find(visible);
      return {ready: document.readyState === "complete" && !busy && !!composer, busy, title: document.title, signature: document.body.innerText.slice(0,1200).length + ":" + location.pathname};
    })()'''
    while time.monotonic() < deadline:
        try:
            check = evaluate(expression)
            signature = check.get("signature") if isinstance(check, dict) else None
            if isinstance(check, dict) and check.get("ready") and signature == last_signature:
                stable += 1
            else:
                stable = 0
            last_signature = signature
            if stable >= 3:
                write_state(browser="done", message="صفحه Arena پایدار است؛ نشانگر بارگذاری دیده نمی‌شود و composer آماده است.")
                print("ARENA_PAGE_STABLE: three consecutive CDP checks; composer ready", flush=True)
                break
        except Exception:
            stable = 0
        time.sleep(2)
    else:
        raise RuntimeError("صفحه Arena طی سه دقیقه پایدار نشد؛ اگر پروفایل اختصاصی Chrome وارد حساب نیست، یک‌بار ورود را دستی کامل کنید")
except Exception as exc:
    write_state(browser="failed", message="آماده‌سازی Chrome متوقف شد: " + str(exc))
    raise
`;

const PASTE_CODE = String.raw`${ROOT_SETUP}
import base64, ctypes, hashlib, subprocess

PORT = 9222
if read_state().get("chainStatus") != "continue":
    write_state(paste="skipped", message="decision.action اجازه ادامه نمی‌دهد؛ هیچ Paste انجام نمی‌شود.")
    print("ARENA_PASTE_SKIPPED: decision does not allow continuation", flush=True)
    raise SystemExit(0)
write_state(paste="running", message="در حال قراردادن Prompt در Clipboard و Paste دقیقاً یک‌باره…")

def evaluate(expression):
    env = os.environ.copy()
    env["CDP_EXPRESSION_B64"] = base64.b64encode(expression.encode("utf-8")).decode("ascii")
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", os.path.join(ROOT, "cdp-evaluate.ps1"), "-Port", str(PORT)], env=env, text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip())
    return json.loads(result.stdout.strip() or "null")
def activate_chrome():
    user32 = ctypes.windll.user32
    found = []
    callback_type = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    def callback(hwnd, _):
        if user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            title = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, title, length + 1)
            if "Chrome" in title.value and ("Arena" in title.value or "arena" in title.value.lower()):
                found.append(hwnd)
                return False
        return True
    user32.EnumWindows(callback_type(callback), 0)
    if not found:
        raise RuntimeError("پنجره Chrome مربوط به Arena پیدا نشد")
    user32.ShowWindow(found[0], 9)
    if not user32.SetForegroundWindow(found[0]):
        raise RuntimeError("فعال‌کردن پنجره Chrome ممکن نشد")

def keys(*values):
    user32 = ctypes.windll.user32
    for key, down in values:
        user32.keybd_event(key, 0, 0 if down else 2, 0)
try:
    prompt_path = os.path.join(ROOT, "next-prompt.txt")
    with open(prompt_path, "r", encoding="utf-8") as handle:
        prompt = handle.read()
    expected_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    if expected_hash != read_state().get("promptSha256"):
        raise RuntimeError("هش Prompt ذخیره‌شده با پاسخ API تطبیق ندارد")
    focus_expression = r'''(() => { const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=="none"&&s.visibility!=="hidden"&&r.width>20&&r.height>20}; const all=[...document.querySelectorAll('textarea,[contenteditable="true"]')].filter(visible); const e=all.at(-1); if(!e)return false; e.focus(); return document.activeElement===e || e.contains(document.activeElement); })()'''
    if evaluate(focus_expression) is not True:
        raise RuntimeError("composer قابل مشاهده پیدا یا Focus نشد؛ هیچ Paste انجام نشد")
    subprocess.run(["powershell.exe", "-NoProfile", "-STA", "-Command", "Get-Content -Raw -LiteralPath $env:PROMPT_FILE | Set-Clipboard"], env={**os.environ, "PROMPT_FILE": prompt_path}, check=True, capture_output=True, timeout=15)
    activate_chrome()
    time.sleep(0.8)
    keys((0x11, True), (0x56, True), (0x56, False), (0x11, False))
    time.sleep(1.5)
    value_expression = r'''(() => { const e=document.activeElement; if(!e)return null; return typeof e.value==="string" ? e.value : e.innerText; })()'''
    actual = evaluate(value_expression)
    if actual != prompt:
        write_state(paste="failed", message="Paste فقط یک بار انجام شد اما متن composer تطبیق ندارد؛ برای جلوگیری از تکرار، عملیات متوقف شد.")
        raise RuntimeError("composer content mismatch after the single allowed paste")
    write_state(paste="done", pasteVerified=True, message="Paste یک‌باره انجام شد و متن composer دقیقاً با Prompt API تطبیق دارد.")
    print("ARENA_PROMPT_PASTED_ONCE: sha256=" + expected_hash + " chars=" + str(len(prompt)), flush=True)
except Exception as exc:
    if read_state().get("paste") != "failed":
        write_state(paste="failed", message="مرحله Paste پیش از ارسال متوقف شد: " + str(exc))
    raise
`;

const SUBMIT_CODE = String.raw`${ROOT_SETUP}
import base64, ctypes, hashlib, subprocess

PORT = 9222
if read_state().get("chainStatus") != "continue":
    write_state(submit="skipped", message="decision.action اجازه ادامه نمی‌دهد؛ Enter ارسال نمی‌شود.")
    print("ARENA_SUBMIT_SKIPPED: decision does not allow continuation", flush=True)
    raise SystemExit(0)
write_state(submit="running", message="در حال بررسی نهایی و ارسال Enter بدون Shift/Ctrl/Alt…")
def evaluate(expression):
    env = os.environ.copy()
    env["CDP_EXPRESSION_B64"] = base64.b64encode(expression.encode("utf-8")).decode("ascii")
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", os.path.join(ROOT, "cdp-evaluate.ps1"), "-Port", str(PORT)], env=env, text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip())
    return json.loads(result.stdout.strip() or "null")
try:
    state = read_state()
    if state.get("paste") != "done" or state.get("pasteVerified") is not True:
        raise RuntimeError("Paste تأیید نشده است؛ Enter ارسال نمی‌شود")
    with open(os.path.join(ROOT, "next-prompt.txt"), "r", encoding="utf-8") as handle:
        prompt = handle.read()
    value_expression = r'''(() => { const e=document.activeElement; if(!e)return null; return typeof e.value==="string" ? e.value : e.innerText; })()'''
    if evaluate(value_expression) != prompt:
        raise RuntimeError("متن composer پیش از Enter تغییر کرده است؛ ارسال لغو شد")
    user32 = ctypes.windll.user32
    if user32.GetKeyState(0x10) < 0 or user32.GetKeyState(0x11) < 0 or user32.GetKeyState(0x12) < 0:
        raise RuntimeError("یکی از کلیدهای Shift/Ctrl/Alt پایین است؛ Enter برای جلوگیری از رفتار اشتباه ارسال نشد")
    user32.keybd_event(0x0D, 0, 0, 0)
    user32.keybd_event(0x0D, 0, 2, 0)
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        current = evaluate(value_expression)
        if current in ("", None) or current != prompt:
            digest = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
            write_state(submit="done", lastSubmittedPromptSha256=digest, submittedAt=time.strftime("%Y-%m-%dT%H:%M:%S%z"), message="Enter ساده برای Send/Submit ارسال شد؛ هیچ Shift+Enter استفاده نشد.")
            print("ARENA_PROMPT_SUBMITTED_WITH_ENTER: sha256=" + digest, flush=True)
            break
        time.sleep(1)
    else:
        raise RuntimeError("پس از Enter، composer تغییری نکرد؛ موفقیت Submit قابل اثبات نیست")
except Exception as exc:
    write_state(submit="failed", message="ارسال Enter متوقف شد: " + str(exc))
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
    { id: "arena-open-and-stabilize", title: "۴. بازکردن Chrome و انتظار برای پایداری", language: "python", content: BROWSER_CODE, notes: "Chrome با پروفایل اختصاصی پایدار باز می‌شود؛ سه بررسی متوالی CDP باید نبود spinner/loading و وجود composer را تأیید کنند.", transition: "manual", executionMode: "blocking", executable: true },
    { id: "arena-paste-once", title: "۵. Paste یک‌باره از Clipboard", language: "python", content: PASTE_CODE, notes: "پس از Focus تأییدشده، Ctrl+V دقیقاً یک بار زده می‌شود. عدم تطبیق متن باعث توقف می‌شود، نه Paste دوباره.", transition: "manual", executionMode: "blocking", executable: true },
    { id: "arena-submit-enter", title: "۶. Enter برای Send / Submit", language: "python", content: SUBMIT_CODE, notes: "فقط Enter ساده و بدون Shift/Ctrl/Alt ارسال می‌شود؛ پیش از آن متن composer دوباره با Prompt API تطبیق داده می‌شود.", transition: "manual", executionMode: "blocking", executable: true },
  ];
}
