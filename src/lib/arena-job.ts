import { AppError } from "./errors";

export type TelegramReportMode = "off" | "final" | "start_final";

export const ARENA_JOB_NAME = "job_arena.py";
const BRIDGE_MARKER = "# management-arena-bridge: 10";
const BRIDGE_9_MARKER = "# management-arena-bridge: 9";
const BRIDGE_8_MARKER = "# management-arena-bridge: 8";
const BRIDGE_7_MARKER = "# management-arena-bridge: 7";
const BRIDGE_6_MARKER = "# management-arena-bridge: 6";
const BRIDGE_5_MARKER = "# management-arena-bridge: 5";
const BRIDGE_4_MARKER = "# management-arena-bridge: 4";
const BRIDGE_3_MARKER = "# management-arena-bridge: 3";
const BRIDGE_2_MARKER = "# management-arena-bridge: 2";
const LEGACY_BRIDGE_MARKER = "# management-arena-bridge: 1";
const ANY_BRIDGE_MARKER = "# management-arena-bridge:";

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
import hashlib
import shutil

# گزارش نتیجه از راه صف محلی رباتِ خود Windows Agent ارسال می‌شود؛
# هیچ توکن تلگرامی داخل این فایل یا گیت‌هاب قرار نمی‌گیرد.
TELEGRAM_REPORT_MODE = "final"
PROMPT_REQUEST_ID = "initial"
FAILURE_INTERVENTION_REPORTED_FOR = None
ARENA_COMPLETION_TIMEOUT = 180
ARENA_COMPLETION_POLL_SECONDS = 3
NETWORK_RECHECK_SECONDS = 60
OCR_TIMEOUT_SECONDS = max(20, int(os.environ.get("WINDOWS_AGENT_OCR_TIMEOUT_SECONDS", "45")))
OCR_PYTHON = os.environ.get("WINDOWS_AGENT_OCR_PYTHON", "")
OCR_HELPER = os.environ.get("WINDOWS_AGENT_OCR_HELPER", "")
BOT_API_CONFIG = os.path.join(
    os.environ.get("LOCALAPPDATA", ""), "Windows-Agent", "bot_api.json"
)


def register_step_artifact(path, stage, kind="screenshot", mime_type="image/png"):
    """فقط metadata قطعی را می‌فرستد؛ بایت تصویر همچنان بیرون D1 و در Drive می‌ماند."""
    if not path:
        return
    normalized = os.path.abspath(path)
    digest = hashlib.sha256((PROMPT_REQUEST_ID + "|" + normalized).encode("utf-8")).hexdigest()[:28]
    payload = {
        "artifactId": "art_" + digest,
        "kind": kind,
        "stage": str(stage or "arena-step")[:80],
        "name": os.path.basename(normalized),
        "localPath": normalized,
        "mimeType": mime_type,
    }
    print("SERVICE_ARTIFACT: " + json.dumps(payload, ensure_ascii=False))


def capture_named_step(stage):
    safe_id = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in PROMPT_REQUEST_ID)
    safe_stage = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in str(stage))
    step_dir = os.path.join(os.path.dirname(SCREENSHOT_DIR), "logs", "steps")
    os.makedirs(step_dir, exist_ok=True)
    path = os.path.join(step_dir, f"arena_step_{safe_id}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}_{safe_stage}.png")
    take_screenshot(path)
    register_step_artifact(path, safe_stage)
    return path


def network_reachable():
    """دسترسی واقعی به Arena را می‌سنجد؛ پاسخ HTTP خطادار نیز یعنی شبکه برقرار است."""
    try:
        request = urllib.request.Request(URL, method="HEAD", headers={"User-Agent": "Windows-Agent/arena"})
        with urllib.request.urlopen(request, timeout=12) as response:
            response.read(1)
        return True
    except urllib.error.HTTPError:
        return True
    except Exception:
        return False


def wait_for_network():
    """هنگام قطعی هیچ تعامل UI انجام نمی‌دهد و هر ۶۰ ثانیه دوباره می‌سنجد."""
    announced = False
    while not network_reachable():
        if not announced:
            print("ARENA_NETWORK_OFFLINE: اینترنت یا Arena در دسترس نیست؛ عملیات متوقف ماند")
            announced = True
        else:
            print("ARENA_NETWORK_STILL_OFFLINE: پس از ۶۰ ثانیه هنوز قطع است؛ ادامه توقف")
        time.sleep(NETWORK_RECHECK_SECONDS)
    if announced:
        print("ARENA_NETWORK_RESTORED: اتصال برگشت؛ ادامه عملیات")
    return True


def local_ocr_items(image_path):
    """خروجی JSON helper محلی PaddleOCR متعلق به Windows Agent را می‌خواند."""
    if not OCR_PYTHON or not OCR_HELPER:
        raise RuntimeError("PaddleOCR محلی Windows Agent پیکربندی نشده است")
    completed = subprocess.run(
        [OCR_PYTHON, OCR_HELPER, "--image", image_path, "--json"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=OCR_TIMEOUT_SECONDS,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if completed.returncode != 0:
        raise RuntimeError("PaddleOCR helper ناموفق بود: " + completed.stderr[-500:])
    payload = json.loads(completed.stdout)
    if not payload.get("ok") or not isinstance(payload.get("items"), list):
        raise RuntimeError("پاسخ PaddleOCR helper معتبر نیست")
    return payload["items"]


def find_text_with_ocr(phrases, stage="scan"):
    """OCR را روی فایل runtime محلی اجرا و نسخه شواهد را جداگانه در Drive نگه می‌دارد."""
    safe_id = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in PROMPT_REQUEST_ID)
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
    file_name = f"ocr_{safe_id}_{stage}_{stamp}.png"
    runtime_dir = os.path.join(os.environ.get("LOCALAPPDATA", os.path.dirname(SCREENSHOT_DIR)), "Windows-Agent", "ocr-runtime")
    evidence_dir = os.path.join(os.path.dirname(SCREENSHOT_DIR), "logs", "ocr")
    os.makedirs(runtime_dir, exist_ok=True)
    os.makedirs(evidence_dir, exist_ok=True)
    runtime_path = os.path.join(runtime_dir, file_name)
    image_path = os.path.join(evidence_dir, file_name)
    take_screenshot(runtime_path)
    try:
        shutil.copyfile(runtime_path, image_path)
        register_step_artifact(image_path, "ocr-" + str(stage))
    except Exception as exc:
        image_path = runtime_path
        print(f"هشدار: کپی اسکرین‌شات OCR در Drive ممکن نشد: {exc}")
    wanted = [str(value).casefold().strip() for value in phrases if str(value).strip()]
    try:
        ocr_items = local_ocr_items(runtime_path)
    finally:
        if image_path != runtime_path:
            try:
                os.remove(runtime_path)
            except OSError:
                pass
    for item in ocr_items:
        text = str(item.get("text", "")).casefold().strip()
        bounds = item.get("bounds")
        confidence = float(item.get("confidence", 0) or 0)
        if confidence < 0.45 or not isinstance(bounds, list) or len(bounds) != 4:
            continue
        for phrase in wanted:
            # reverse containment فقط برای یک قطعه بلند و معنادار مجاز است.
            # قبلاً OCR تک‌حرفی مثل «D» چون داخل عبارت انگلیسی وجود داشت، به‌اشتباه
            # Security Verification تشخیص داده می‌شد و job برای همیشه pause می‌ماند.
            meaningful_partial = len(text) >= 8 and text in phrase
            if phrase in text or meaningful_partial:
                left, top, right, bottom = [float(value) for value in bounds]
                return {
                    "x": (left + right) / 2,
                    "y": (top + bottom) / 2,
                    "text": item.get("text"),
                    "confidence": confidence,
                    "matched": phrase,
                    "imagePath": image_path,
                }
    return None


SECURITY_VERIFICATION_PHRASES = [
    "security verification",
    "verify you are human",
    "verification required",
    "checking your browser",
    "performing security verification",
    "تأیید امنیتی",
    "بررسی امنیتی",
]
SECURITY_UIA_PS_SCRIPT = r'''
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ForegroundSecurityWindow {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
$handle = [ForegroundSecurityWindow]::GetForegroundWindow()
if ($handle -eq [IntPtr]::Zero) { Write-Output 'ARENA_SECURITY_UIA_NOT_FOUND'; exit 0 }
$root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
if (-not $root -or ([string]$root.Current.Name).ToLowerInvariant() -notmatch 'arena') {
    Write-Output 'ARENA_SECURITY_UIA_NOT_FOUND'
    exit 0
}
$phrases = @('security verification', 'verify you are human', 'verification required', 'checking your browser', 'performing security verification')
$all = $root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
)
foreach ($el in $all) {
    try {
        if ($el.Current.IsOffscreen) { continue }
        $name = [string]$el.Current.Name
        if (-not $name) { continue }
        $lower = $name.ToLowerInvariant()
        foreach ($phrase in $phrases) {
            if ($lower.Contains($phrase)) {
                Write-Output ('ARENA_SECURITY_UIA_FOUND=' + $name)
                exit 0
            }
        }
    } catch { }
}
Write-Output 'ARENA_SECURITY_UIA_NOT_FOUND'
'''


def security_verification_match(stage="security", ocr_fallback=True):
    """چالش قابل مشاهده را با UIA و در صورت نیاز PaddleOCR محلی تشخیص می‌دهد."""
    try:
        output = run_hidden_powershell(SECURITY_UIA_PS_SCRIPT, timeout=30)
    except Exception as exc:
        print(f"هشدار: بررسی UIA چالش امنیتی ممکن نشد: {exc}")
        output = ""
    marker = "ARENA_SECURITY_UIA_FOUND="
    if marker in output:
        detected = output.split(marker, 1)[1].splitlines()[0].strip()
        safe_id = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in PROMPT_REQUEST_ID)
        target_dir = os.path.join(os.path.dirname(SCREENSHOT_DIR), "logs", "security")
        os.makedirs(target_dir, exist_ok=True)
        image_path = os.path.join(target_dir, f"security_{safe_id}_{stage}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.png")
        take_screenshot(image_path)
        register_step_artifact(image_path, "security-" + str(stage))
        return {"text": detected, "matched": "security verification", "imagePath": image_path, "detector": "uia"}
    if not ocr_fallback:
        return None
    try:
        match = find_text_with_ocr(SECURITY_VERIFICATION_PHRASES, stage=stage)
    except subprocess.TimeoutExpired:
        # کندی/گیرکردن OCR نباید مسیر امن UIA و بررسی composer را از کار بیندازد.
        # PowerShell فقط روی editable composer با فوکوس امن اجازه تایپ/Enter می‌دهد.
        print(f"ARENA_SECURITY_OCR_TIMEOUT: PaddleOCR پس از {OCR_TIMEOUT_SECONDS} ثانیه پاسخ نداد؛ ادامه با UIA و محافظ فوکوس composer")
        return None
    except Exception as exc:
        print(f"ARENA_SECURITY_OCR_UNAVAILABLE: بررسی PaddleOCR ممکن نشد؛ ادامه با UIA و محافظ فوکوس composer: {exc}")
        return None
    if match:
        match["detector"] = "paddleocr"
    return match


def wait_for_security_verification_clear(stage="security"):
    """در چالش امنیتی هیچ کلیک/کلیدی نمی‌زند و تا مداخله انسان متوقف می‌ماند."""
    match = security_verification_match(stage=stage)
    if not match:
        return False
    payload = {
        "reason": "security_verification",
        "requestId": PROMPT_REQUEST_ID,
        "message": "چالش ضدربات Arena دیده شد؛ مداخله انسانی لازم است.",
        "artifactPath": match.get("imagePath"),
        "detectedText": match.get("text"),
        "matchedPhrase": match.get("matched"),
        "detector": match.get("detector"),
    }
    print("SERVICE_HUMAN_INTERVENTION_REQUIRED: " + json.dumps(payload, ensure_ascii=False))
    while True:
        time.sleep(8)
        wait_for_network()
        match = security_verification_match(stage=stage + "-recheck")
        if not match:
            print("SERVICE_HUMAN_INTERVENTION_CLEARED: " + json.dumps({
                "reason": "security_verification",
                "requestId": PROMPT_REQUEST_ID,
                "message": "چالش امنیتی رفع شد؛ ادامه از checkpoint امن.",
            }, ensure_ascii=False))
            return True
        print("SERVICE_HUMAN_INTERVENTION_WAITING: " + json.dumps({
            "reason": "security_verification",
            "requestId": PROMPT_REQUEST_ID,
            "artifactPath": match.get("imagePath"),
        }, ensure_ascii=False))


def type_and_submit_with_network_resilience():
    """شبکه و Security Verification را پیش از هر تعامل تازه بررسی می‌کند."""
    wait_for_network()
    wait_for_security_verification_clear(stage="before-input")
    try:
        return type_and_submit()
    except Exception:
        if network_reachable():
            raise
        print("ARENA_NETWORK_INTERRUPTED: شکست هم‌زمان با قطعی؛ هیچ بازخورد یا کلیک تازه‌ای انجام نمی‌شود")
        wait_for_network()
        open_site()
        time.sleep(PAGE_LOAD_WAIT)
        maximize_browser()
        wait_for_security_verification_clear(stage="after-reconnect")
        handle_dialog_if_present()
        return type_and_submit()


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


def save_failure_artifacts(detail):
    """پیش از توقف، لاگ و اسکرین‌شات شکست را برای Drive آماده و metadata را ثبت می‌کند."""
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_id = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in PROMPT_REQUEST_ID)
    base_dir = os.path.dirname(SCREENSHOT_DIR)
    errors_dir = os.path.join(base_dir, "logs", "errors")
    report_path = os.path.join(errors_dir, f"arena_failure_{safe_id}_{stamp}.txt")
    screenshot_path = os.path.join(errors_dir, f"arena_failure_{safe_id}_{stamp}.png")
    saved = []
    try:
        os.makedirs(errors_dir, exist_ok=True)
        with open(report_path, "w", encoding="utf-8") as fh:
            fh.write(
                "زمان: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S") + " تهران\\n"
                "موضوع: توقف امن اتوماسیون Arena و نیاز به مداخله انسانی\\n"
                "نسخه برنامه: Arena Bridge 10\\n"
                "شناسه درخواست: " + PROMPT_REQUEST_ID + "\\n"
                "پرامپت: " + PROMPT_TEXT + "\\n\\n"
                "جزئیات خطا:\\n" + str(detail)
            )
        saved.append(report_path)
        register_step_artifact(report_path, "failure-report", kind="log", mime_type="text/plain")
    except Exception as exc:
        print(f"هشدار: ذخیره گزارش شکست ممکن نشد: {exc}")
    try:
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)
        take_screenshot(screenshot_path)
        saved.append(screenshot_path)
        register_step_artifact(screenshot_path, "failure-screenshot")
    except Exception as exc:
        print(f"هشدار: گرفتن اسکرین‌شات شکست ممکن نشد: {exc}")
    return saved


def wait_for_arena_completion():
    """پایان واقعی کار را فقط با ظهور پنجره Was this task successful? تأیید می‌کند."""
    detector_anchor = (
        "$candidates = $dialogWindow.FindAll([System.Windows.Automation.TreeScope]::Descendants, "
        "[System.Windows.Automation.Condition]::TrueCondition)"
    )
    detector_exit = (
        "Write-Output 'ARENA_COMPLETION_DIALOG_FOUND'\\n"
        "exit 0\\n\\n"
        + detector_anchor
    )
    if detector_anchor not in DIALOG_PS_SCRIPT:
        raise RuntimeError("ساختار تشخیص پنجره پایان Arena قابل شناسایی نیست")
    detector_script = DIALOG_PS_SCRIPT.replace(detector_anchor, detector_exit, 1)
    deadline = time.monotonic() + ARENA_COMPLETION_TIMEOUT
    attempt = 0
    while time.monotonic() < deadline:
        offline_started = time.monotonic()
        wait_for_network()
        # مدت قطعی از مهلت پاسخ کم نمی‌شود.
        deadline += max(0, time.monotonic() - offline_started)
        attempt += 1
        print(f"پایش پایان Arena؛ انتظار برای «{DIALOG_PHRASE}» (بررسی {attempt})...")
        security_match = security_verification_match(stage="completion-uia", ocr_fallback=False)
        if security_match:
            intervention_started = time.monotonic()
            wait_for_security_verification_clear(stage="completion-security")
            deadline += max(0, time.monotonic() - intervention_started)
            continue
        try:
            output = run_hidden_powershell(detector_script, timeout=60)
        except Exception as exc:
            print(f"هشدار: بررسی پایان Arena موقتاً ناموفق بود: {exc}")
            output = ""
        if "ARENA_COMPLETION_DIALOG_FOUND" in output:
            print("پنجره پایان Arena با UI Automation دیده شد؛ اجرای مقصد کامل شده است")
            return True
        try:
            ocr_match = find_text_with_ocr([DIALOG_PHRASE] + SECURITY_VERIFICATION_PHRASES, stage="completion")
        except Exception as exc:
            print(f"هشدار: بررسی PaddleOCR پنجره پایان ممکن نشد: {exc}")
            ocr_match = None
        if ocr_match and ocr_match.get("matched") in [value.casefold() for value in SECURITY_VERIFICATION_PHRASES]:
            intervention_started = time.monotonic()
            wait_for_security_verification_clear(stage="completion-security")
            deadline += max(0, time.monotonic() - intervention_started)
            continue
        if ocr_match:
            print("پنجره پایان Arena با PaddleOCR دیده شد؛ اجرای مقصد کامل شده است")
            return True
        remaining = deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(ARENA_COMPLETION_POLL_SECONDS, remaining))
    raise TimeoutError(
        f"تا {ARENA_COMPLETION_TIMEOUT} ثانیه پنجره «{DIALOG_PHRASE}» ظاهر نشد"
    )
`;

const WRAPPED_MAIN = `def main():
    global FAILURE_INTERVENTION_REPORTED_FOR
    started_at = datetime.now()
    if TELEGRAM_REPORT_MODE == "start_final":
        send_telegram_status("شروع", "اجرای پرامپت در ویندوز آغاز شد.")
    try:
        _run_arena_task()
    except BaseException as exc:
        elapsed = (datetime.now() - started_at).total_seconds()
        trace = traceback.format_exc()
        summary = f"پس از {elapsed:.1f} ثانیه ناموفق شد: {type(exc).__name__}: {exc}"
        print(summary)
        artifacts = save_failure_artifacts(summary + "\\n" + trace)
        intervention = {
            "reason": "arena_automation_failure",
            "requestId": PROMPT_REQUEST_ID,
            "message": summary,
            "artifactPaths": artifacts,
            "guidance": "اجرای خودکار متوقف شد؛ وضعیت Arena و تصاویر مرحله‌ای را بررسی کنید.",
        }
        print("SERVICE_HUMAN_INTERVENTION_REQUIRED: " + json.dumps(intervention, ensure_ascii=False))
        FAILURE_INTERVENTION_REPORTED_FOR = PROMPT_REQUEST_ID
        send_telegram_status("نیازمند مداخله انسانی", summary + "\\n" + trace[-1200:])
        raise
    else:
        elapsed = (datetime.now() - started_at).total_seconds()
        send_telegram_status("موفق", f"پرامپت پس از {elapsed:.1f} ثانیه تایپ و ارسال شد.")


if __name__ == "__main__":
    main()
`;

const LEGACY_PASTE_LOOP_START =
  "    # حلقه تایپ: کلیک روی کادر → Paste → تأیید با خواندن متن عنصر فوکوس‌شده\n";
const V3_PASTE_LOOP_START =
  "    # حلقه ورود متن: هر تلاش ابتدا کادر را پاک می‌کند و یک روش Paste متفاوت دارد.\n";
const CURRENT_V3_PASTE_LOOP_START =
  "    for ($try = 1; $try -le 3 -and -not $textConfirmed; $try++) {\n        try { [WinApi]::SetForegroundWindow($browserWin.Current.NativeWindowHandle) | Out-Null } catch {}\n";
const PASTE_LOOP_END = "\n}\n\nif ($textConfirmed)";

const SEND_INPUT_CSHARP_ANCHOR = `    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}`;

const SEND_INPUT_CSHARP_REPLACEMENT = `    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    private const uint INPUT_MOUSE = 0;
    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_UNICODE = 0x0004;

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT {
        public int dx; public int dy; public uint mouseData; public uint dwFlags;
        public uint time; public UIntPtr dwExtraInfo;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk; public ushort wScan; public uint dwFlags;
        public uint time; public UIntPtr dwExtraInfo;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct HARDWAREINPUT {
        public uint uMsg; public ushort wParamL; public ushort wParamH;
    }
    [StructLayout(LayoutKind.Explicit)]
    public struct INPUTUNION {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT { public uint type; public INPUTUNION U; }

    private static INPUT VirtualKey(ushort vk, uint flags) {
        INPUT input = new INPUT();
        input.type = INPUT_KEYBOARD;
        input.U.ki.wVk = vk;
        input.U.ki.dwFlags = flags;
        return input;
    }
    private static INPUT UnicodeKey(char ch, uint flags) {
        INPUT input = new INPUT();
        input.type = INPUT_KEYBOARD;
        input.U.ki.wScan = ch;
        input.U.ki.dwFlags = KEYEVENTF_UNICODE | flags;
        return input;
    }
    private static bool Emit(params INPUT[] inputs) {
        return SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT))) == inputs.Length;
    }
    public static bool PressKey(ushort key) {
        return Emit(VirtualKey(key, 0), VirtualKey(key, KEYEVENTF_KEYUP));
    }
    public static bool SendChord(ushort modifier, ushort key) {
        return Emit(
            VirtualKey(modifier, 0), VirtualKey(key, 0),
            VirtualKey(key, KEYEVENTF_KEYUP), VirtualKey(modifier, KEYEVENTF_KEYUP)
        );
    }
    public static bool SendUnicodeText(string text) {
        if (text == null) return false;
        foreach (char ch in text) {
            if (ch == '\\r') continue;
            if (ch == '\\n') {
                if (!SendChord(0x10, 0x0D)) return false; // Shift+Enter = newline, not submit
            } else if (!Emit(UnicodeKey(ch, 0), UnicodeKey(ch, KEYEVENTF_KEYUP))) {
                return false;
            }
        }
        return true;
    }
}`;

const POWERSHELL_DIAGNOSTICS = `
function Save-StepShot([string]$stage) {
    if (-not $env:ARENA_DIAGNOSTIC_DIR -or -not $env:ARENA_TRACE_ID) { return }
    $bitmap = $null
    $graphics = $null
    try {
        New-Item -ItemType Directory -Force -Path $env:ARENA_DIAGNOSTIC_DIR | Out-Null
        $safeStage = ($stage -replace '[^a-zA-Z0-9_-]', '_')
        $path = Join-Path $env:ARENA_DIAGNOSTIC_DIR ("arena_step_" + $env:ARENA_TRACE_ID + "_" + $safeStage + ".png")
        $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
        $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
        $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
        Write-Output ("ARENA_STEP_SCREENSHOT=" + $path)
    } catch {
        Write-Output ("ARENA_STEP_SCREENSHOT_FAILED=" + $_.Exception.Message)
    } finally {
        if ($graphics) { $graphics.Dispose() }
        if ($bitmap) { $bitmap.Dispose() }
    }
}

function Try-SetPromptValue($startEl) {
    $el = $startEl
    for ($depth = 0; $depth -lt 7 -and $el; $depth++) {
        try {
            $vp = $null
            if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)) {
                if (-not $vp.Current.IsReadOnly) {
                    $vp.SetValue($env:ARENA_PROMPT)
                    return $true
                }
            }
        } catch {}
        try { $el = [System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($el) } catch { $el = $null }
    }
    return $false
}
`;

const VERIFIED_SUBMIT_BLOCK = `$sent = $false

# Bridge 5: Enter تنها زمانی مجاز است که فوکوس هنوز داخل صفحه و خارج از نوار آدرس باشد.
$focusedBeforeSubmit = [System.Windows.Automation.AutomationElement]::FocusedElement
$submitFocusSafe = ($null -ne $focusedBeforeSubmit) -and -not (Test-Omnibox $focusedBeforeSubmit $winRect.Top)
Write-Output ("ARENA_SUBMIT_FOCUS_SAFE=" + [bool]$submitFocusSafe)

if ($textConfirmed -and $submitFocusSafe) {
    # ارسال فقط با SendInput انجام می‌شود؛ در حالت تأییدنشده/فوکوس ناامن Enter زده نمی‌شود.
    $enterOk = [WinApi]::PressKey(0x0D)
    Write-Output ("ARENA_SUBMIT_SENDINPUT=" + $enterOk)
    Start-Sleep -Milliseconds 1800

    # تأیید اول: پرامپت به‌صورت یک پیام بالاتر از کادر گفتگو در صفحه ظاهر شده باشد.
    $messageVisible = $false
    try {
        $probeLength = [Math]::Min(80, $env:ARENA_PROMPT.Length)
        $promptProbe = $env:ARENA_PROMPT.Substring(0, $probeLength)
        $afterTexts = Get-Visible ($page.FindAll([System.Windows.Automation.TreeScope]::Descendants, $textCond))
        foreach ($t in $afterTexts) {
            $name = [string]$t.Current.Name
            $rect = $t.Current.BoundingRectangle
            if ($name -and $name.Contains($promptProbe) -and $rect.Bottom -lt ($clickPoint.Y - 20)) {
                $messageVisible = $true
                break
            }
        }
    } catch {}

    # تأیید دوم: placeholder برگشته و متن پرامپت دیگر داخل composer قابل Copy نباشد.
    $placeholderReturned = $false
    try {
        $afterTexts = Get-Visible ($page.FindAll([System.Windows.Automation.TreeScope]::Descendants, $textCond))
        foreach ($t in $afterTexts) {
            $name = [string]$t.Current.Name
            if ($name -and ($name -match 'What would you like')) { $placeholderReturned = $true; break }
        }
    } catch {}

    $promptStillInComposer = $false
    try {
        $sentinel = "__ARENA_AFTER_SEND_$([Guid]::NewGuid().ToString('N'))__"
        Set-Clipboard -Value $sentinel
        [void][WinApi]::SendChord(0x11, 0x41)
        Start-Sleep -Milliseconds 120
        [void][WinApi]::SendChord(0x11, 0x43)
        Start-Sleep -Milliseconds 350
        $afterCopied = [string](Get-Clipboard -Raw)
        $afterNormalized = $afterCopied.Replace("\`r\`n", "\`n").TrimEnd([char[]]"\`r\`n")
        $promptNormalized = ([string]$env:ARENA_PROMPT).Replace("\`r\`n", "\`n").TrimEnd([char[]]"\`r\`n")
        $promptStillInComposer = ($afterNormalized -eq $promptNormalized)
        [void][WinApi]::PressKey(0x23)
    } catch {}

    Write-Output ("ARENA_SUBMIT_MESSAGE_VISIBLE=" + [bool]$messageVisible)
    Write-Output ("ARENA_SUBMIT_PLACEHOLDER_RETURNED=" + [bool]$placeholderReturned)
    Write-Output ("ARENA_SUBMIT_PROMPT_STILL_IN_COMPOSER=" + [bool]$promptStillInComposer)
    $sent = $enterOk -and ($messageVisible -or ($placeholderReturned -and -not $promptStillInComposer))
} else {
    if (-not $submitFocusSafe) { Write-Output 'ARENA_SUBMIT_BLOCKED_UNSAFE_FOCUS' }
    Write-Output 'ARENA_SUBMIT_BLOCKED_UNVERIFIED'
}

`;

const VERIFIED_PASTE_LOOP = `    # Bridge 5: هر مسیر ورود متن پیش و پس از تایپ، خروج فوکوس به omnibox را رد می‌کند.
    Save-StepShot '02-composer-ready'
    for ($try = 1; $try -le 3 -and -not $textConfirmed; $try++) {
        if ($composer) { try { $composer.SetFocus() } catch {} }
        Start-Sleep -Milliseconds 250
        Left-Click $clickPoint.X $clickPoint.Y
        Start-Sleep -Milliseconds 400
        Save-StepShot ("03-try" + $try + "-focused")

        # هیچ کلیدی، خصوصاً Ctrl+A/Backspace/Enter، نباید در نوار آدرس اجرا شود.
        $focusedBeforeInput = [System.Windows.Automation.AutomationElement]::FocusedElement
        $focusSafeBeforeInput = ($null -ne $focusedBeforeInput) -and -not (Test-Omnibox $focusedBeforeInput $winRect.Top)
        Write-Output ("ARENA_FOCUS_SAFE_BEFORE_INPUT_TRY" + $try + "=" + [bool]$focusSafeBeforeInput)
        if (-not $focusSafeBeforeInput) {
            Write-Output ("ARENA_FOCUS_ABORT_TRY" + $try)
            Save-StepShot ("03-try" + $try + "-unsafe-focus")
            continue
        }

        # پاک‌سازی مطمئن متن باقی‌مانده از تلاش قبلی با SendInput.
        [void][WinApi]::SendChord(0x11, 0x41)  # Ctrl+A
        Start-Sleep -Milliseconds 100
        [void][WinApi]::PressKey(0x08)         # Backspace
        Start-Sleep -Milliseconds 200

        if ($try -eq 1) {
            # KEYEVENTF_UNICODE مستقیماً کاراکترهای فارسی را به عنصر فوکوس‌شده می‌فرستد.
            $inputOk = [WinApi]::SendUnicodeText($env:ARENA_PROMPT)
            Write-Output ("ARENA_INPUT_UNICODE=" + $inputOk)
        } elseif ($try -eq 2) {
            # در صورت پشتیبانی contenteditable از ValuePattern، مقدار مستقیماً تنظیم می‌شود.
            $focusedForValue = [System.Windows.Automation.AutomationElement]::FocusedElement
            $inputOk = Try-SetPromptValue $focusedForValue
            if (-not $inputOk -and $composer) { $inputOk = Try-SetPromptValue $composer }
            Write-Output ("ARENA_INPUT_VALUEPATTERN=" + $inputOk)
        } else {
            # آخرین مسیر: Clipboard + Ctrl+V، این بار هر دو با SendInput واقعی.
            Set-Clipboard -Value $env:ARENA_PROMPT
            Start-Sleep -Milliseconds 250
            $inputOk = [WinApi]::SendChord(0x11, 0x56)
            Write-Output ("ARENA_INPUT_SENDINPUT_PASTE=" + $inputOk)
        }
        Start-Sleep -Milliseconds 1200
        Save-StepShot ("03-try" + $try + "-after-input")

        # تأیید فقط وقتی معتبر است که عنصر فوکوس‌شده omnibox نباشد.
        $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
        $focusSafeAfterInput = ($null -ne $focused) -and -not (Test-Omnibox $focused $winRect.Top)
        $focusedText = Get-ElText $focused
        $composerText = Get-ElText $composer
        $promptNormalized = ([string]$env:ARENA_PROMPT).Replace("\`r\`n", "\`n").TrimEnd([char[]]"\`r\`n")
        # UIA TextPattern عمداً حداکثر ۱۰۰۰ نویسه می‌خواند؛ مقایسه کل پرامپت بلند
        # false-negative می‌ساخت. یک probe آغازینِ معنادار، همراه با فوکوس امن و
        # موفقیت واقعی SendInput/ValuePattern/Paste، برای اثبات حضور متن کافی است.
        $probeLength = [Math]::Min(240, $promptNormalized.Length)
        $promptProbe = if ($probeLength -gt 0) { $promptNormalized.Substring(0, $probeLength) } else { "" }
        $focusedNormalized = ([string]$focusedText).Replace("\`r\`n", "\`n").TrimEnd([char[]]"\`r\`n")
        $composerNormalized = ([string]$composerText).Replace("\`r\`n", "\`n").TrimEnd([char[]]"\`r\`n")
        $okFocused = $focusSafeAfterInput -and $inputOk -and $focusedText -and $promptProbe -and $focusedNormalized.Contains($promptProbe)
        $okComposer = $focusSafeAfterInput -and $inputOk -and $composerText -and $promptProbe -and $composerNormalized.Contains($promptProbe)

        # تأیید دوم: Select All + Copy فقط با فوکوس امن و sentinel مستقل.
        $okCopied = $false
        if ($focusSafeAfterInput) {
            try {
                $sentinel = "__ARENA_VERIFY_$([Guid]::NewGuid().ToString('N'))__"
                Set-Clipboard -Value $sentinel
                [void][WinApi]::SendChord(0x11, 0x41)
                Start-Sleep -Milliseconds 150
                [void][WinApi]::SendChord(0x11, 0x43)
                Start-Sleep -Milliseconds 400
                $copiedText = [string](Get-Clipboard -Raw)
                $copiedNormalized = $copiedText.Replace("\`r\`n", "\`n").TrimEnd([char[]]"\`r\`n")
                $okCopied = $inputOk -and $promptProbe -and $copiedNormalized.Contains($promptProbe)
                [void][WinApi]::PressKey(0x23) # End؛ برداشتن selection بدون تغییر متن
            } catch {
                Write-Output ("ARENA_COPY_VERIFY_ERROR=" + $_.Exception.Message)
            }
        }

        Write-Output ("ARENA_FOCUS_SAFE_AFTER_INPUT_TRY" + $try + "=" + [bool]$focusSafeAfterInput)
        if ($focusSafeAfterInput -and ($okFocused -or $okComposer -or $okCopied)) {
            $textConfirmed = $true
            Write-Output ("ARENA_VERIFY_UIA_FOCUSED=" + [bool]$okFocused)
            Write-Output ("ARENA_VERIFY_UIA_COMPOSER=" + [bool]$okComposer)
            Write-Output ("ARENA_VERIFY_SELECTION_COPY=" + [bool]$okCopied)
            Write-Output ("ARENA_PASTE_VERIFIED_TRY" + $try)
            Save-StepShot ("03-try" + $try + "-verified")
        } else {
            Write-Output ("ARENA_PASTE_UNVERIFIED_TRY" + $try)
            Save-StepShot ("03-try" + $try + "-unverified")
        }
    }
    Save-StepShot '04-before-submit'`;

/** Bridgeهای قبلی و فایل پایه را به موتور امن ورود متن و تصویربرداری Bridge 5 ارتقا می‌دهد. */
function hardenArenaTyping(source: string): string {
  // Bridge 7 پرامپت‌های بلند را با متن UIA محدودشده به ۱۰۰۰ نویسه به‌طور کامل
  // مقایسه می‌کرد و با وجود حضور واقعی متن false-negative می‌ساخت.
  if (!source.includes("$promptProbe =")) {
    const normalizedAnchor = `        $promptNormalized = ([string]$env:ARENA_PROMPT).Replace("\`r\`n", "\`n").TrimEnd([char[]]"\`r\`n")\n`;
    const probeBlock = `${normalizedAnchor}        $probeLength = [Math]::Min(240, $promptNormalized.Length)\n        $promptProbe = if ($probeLength -gt 0) { $promptNormalized.Substring(0, $probeLength) } else { "" }\n`;
    const oldFocused = `        $okFocused = $focusSafeAfterInput -and $focusedText -and $focusedNormalized.Contains($promptNormalized)\n`;
    const newFocused = `        $okFocused = $focusSafeAfterInput -and $inputOk -and $focusedText -and $promptProbe -and $focusedNormalized.Contains($promptProbe)\n`;
    const oldComposer = `        $okComposer = $focusSafeAfterInput -and $composerText -and $composerNormalized.Contains($promptNormalized)\n`;
    const newComposer = `        $okComposer = $focusSafeAfterInput -and $inputOk -and $composerText -and $promptProbe -and $composerNormalized.Contains($promptProbe)\n`;
    const oldCopied = `                $okCopied = ($copiedNormalized -eq $promptNormalized)\n`;
    const newCopied = `                $okCopied = $inputOk -and $promptProbe -and $copiedNormalized.Contains($promptProbe)\n`;
    if (!source.includes(normalizedAnchor) || !source.includes(oldFocused) || !source.includes(oldComposer) || !source.includes(oldCopied)) {
      throw new AppError("بخش تأیید پرامپت بلند Arena برای ارتقای Bridge 8 پیدا نشد.", {
        status: 409,
        code: "arena_long_prompt_verifier_upgrade_failed",
      });
    }
    source = source
      .replace(normalizedAnchor, probeBlock)
      .replace(oldFocused, newFocused)
      .replace(oldComposer, newComposer)
      .replace(oldCopied, newCopied);
  }

  if (!source.includes("import urllib.error\n")) {
    if (!source.includes("import urllib.request\n")) {
      throw new AppError("import شبکه Arena برای افزودن پایش اتصال پیدا نشد.", {
        status: 409,
        code: "arena_network_import_upgrade_failed",
      });
    }
    source = source.replace("import urllib.request\n", "import urllib.error\nimport urllib.request\n");
  }

  if (!source.includes("public static bool SendUnicodeText(string text)")) {
    if (!source.includes(SEND_INPUT_CSHARP_ANCHOR)) {
      throw new AppError("کلاس WinApi فایل Arena برای ارتقای SendInput پیدا نشد.", {
        status: 409,
        code: "arena_sendinput_upgrade_failed",
      });
    }
    source = source.replace(SEND_INPUT_CSHARP_ANCHOR, SEND_INPUT_CSHARP_REPLACEMENT);
  }

  if (!source.includes("function Save-StepShot")) {
    const diagnosticsAnchor = "\nfunction Get-ElText($el) {";
    if (!source.includes(diagnosticsAnchor)) {
      throw new AppError("محل افزودن تصویربرداری مرحله‌ای Arena پیدا نشد.", {
        status: 409,
        code: "arena_diagnostics_upgrade_failed",
      });
    }
    source = source.replace(diagnosticsAnchor, `${POWERSHELL_DIAGNOSTICS}\nfunction Get-ElText($el) {`);
  }

  if (!source.includes("ARENA_COMPOSER_PADDLEOCR")) {
    const geometryFallback = `    # د) هندسی — فقط اگر هیچ اسکنی کادر را پیدا نکرد
    if (-not $clickPoint) {
        $cx = $winRect.X + $winRect.Width / 2
        $cy = $winRect.Bottom - 90
        $clickPoint = New-Object System.Windows.Point($cx, $cy)
        Write-Output 'ARENA_COMPOSER_GEOMETRY_FALLBACK'
    }
`;
    const ocrThenGeometry = `    # د) مختصات PaddleOCR محلی؛ فقط اگر UI Automation کادر را پیدا نکرد.
    if (-not $clickPoint -and $env:ARENA_OCR_X -and $env:ARENA_OCR_Y) {
        try {
            $ox = [double]::Parse($env:ARENA_OCR_X, [System.Globalization.CultureInfo]::InvariantCulture)
            $oy = [double]::Parse($env:ARENA_OCR_Y, [System.Globalization.CultureInfo]::InvariantCulture)
            if ($ox -gt $winRect.X -and $ox -lt $winRect.Right -and $oy -gt ($winRect.Top + 120) -and $oy -lt $winRect.Bottom) {
                $clickPoint = New-Object System.Windows.Point($ox, $oy)
                Write-Output 'ARENA_COMPOSER_PADDLEOCR'
            }
        } catch { Write-Output ("ARENA_OCR_COORDINATE_ERROR=" + $_.Exception.Message) }
    }
    # ه) هندسی — فقط اگر UIA و PaddleOCR هیچ‌کدام کادر را پیدا نکردند.
    if (-not $clickPoint) {
        $cx = $winRect.X + $winRect.Width / 2
        $cy = $winRect.Bottom - 90
        $clickPoint = New-Object System.Windows.Point($cx, $cy)
        Write-Output 'ARENA_COMPOSER_GEOMETRY_FALLBACK'
    }
`;
    if (!source.includes(geometryFallback)) {
      throw new AppError("fallback هندسی Arena برای افزودن PaddleOCR پیدا نشد.", {
        status: 409,
        code: "arena_ocr_focus_upgrade_failed",
      });
    }
    source = source.replace(geometryFallback, ocrThenGeometry);
  }

  if (!source.includes("Bridge 5: هر مسیر ورود متن")) {
    const starts = [
      "    # Bridge 4: ورود متن بدون وابستگی به یک روش خاص یا خواندن ناقص contenteditable کروم.",
      LEGACY_PASTE_LOOP_START,
      V3_PASTE_LOOP_START,
      CURRENT_V3_PASTE_LOOP_START,
    ];
    const start = starts.map((anchor) => source.indexOf(anchor)).find((index) => index >= 0) ?? -1;
    const end = source.indexOf(PASTE_LOOP_END, start);
    if (start < 0 || end < 0) {
      throw new AppError("بخش ورود متن job_arena.py برای ارتقای Bridge 5 پیدا نشد.", {
        status: 409,
        code: "arena_typing_upgrade_failed",
        hint: "حلقه‌ی ورود متن job_arena.py را با نسخه‌ی شناخته‌شده مقایسه کنید.",
      });
    }
    source = `${source.slice(0, start)}${VERIFIED_PASTE_LOOP}${source.slice(end)}`;
  }

  if (!source.includes("Save-StepShot '01-browser-foreground'")) {
    source = source.replace(
      "    Write-Output 'ARENA_BROWSER_FG'\n",
      "    Write-Output 'ARENA_BROWSER_FG'\n    Save-StepShot '01-browser-foreground'\n",
    );
  }
  if (!source.includes("Bridge 5: Enter تنها زمانی مجاز است")) {
    const submitStartAnchors = [
      "$sent = $false\n\nif ($textConfirmed) {",
      "$sent = $false\nif ($textConfirmed) {",
    ];
    const submitEndAnchor = "\nif ($sent) { Write-Output 'ARENA_SENT_VERIFIED' }";
    const submitStart = submitStartAnchors
      .map((anchor) => source.indexOf(anchor))
      .find((index) => index >= 0) ?? -1;
    const submitEnd = source.indexOf(submitEndAnchor, submitStart);
    if (submitStart < 0 || submitEnd < 0) {
      throw new AppError("بخش ارسال و تأیید نهایی Arena برای ارتقای Bridge 5 پیدا نشد.", {
        status: 409,
        code: "arena_submit_upgrade_failed",
      });
    }
    source = `${source.slice(0, submitStart)}${VERIFIED_SUBMIT_BLOCK}${source.slice(submitEnd + 1)}`;
  }
  if (!source.includes("Save-StepShot '05-after-submit'")) {
    source = source.replace(
      "if ($sent) { Write-Output 'ARENA_SENT_VERIFIED' } else { Write-Output 'ARENA_SEND_UNCERTAIN' }",
      "Save-StepShot '05-after-submit'\nif ($sent) { Write-Output 'ARENA_SENT_VERIFIED' } else { Write-Output 'ARENA_SEND_UNCERTAIN' }",
    );
  }

  const directOpenBlock = `    # ۱) باز کردن لینک
    open_site()
`;
  const networkSafeOpenBlock = `    # ۱) پیش از بازکردن صفحه، اتصال پایش می‌شود.
    wait_for_network()
    open_site()
`;
  if (source.includes(directOpenBlock)) source = source.replace(directOpenBlock, networkSafeOpenBlock);
  if (!source.includes(networkSafeOpenBlock)) {
    throw new AppError("بخش شروع مقاوم به قطعی Arena قابل ارتقا نیست.", {
      status: 409,
      code: "arena_network_start_upgrade_failed",
    });
  }

  const directTypeBlock = `    # ۵) کلیک روی کادر چت، تایپ متن فارسی و ارسال
    try:
        type_and_submit()
    except Exception as exc:
        print(f"خطا در تایپ/ارسال متن: {exc}")
        raise
`;
  const resilientTypeBlock = `    # ۵) پیش از تعامل، شبکه پایش می‌شود؛ قطعی موقت هیچ کلیک تازه‌ای ایجاد نمی‌کند.
    try:
        type_and_submit_with_network_resilience()
    except Exception as exc:
        print(f"خطا در تایپ/ارسال متن: {exc}")
        raise
`;
  if (source.includes(directTypeBlock)) source = source.replace(directTypeBlock, resilientTypeBlock);
  if (!source.includes(resilientTypeBlock)) {
    throw new AppError("بخش اجرای مقاوم به قطعی Arena قابل ارتقا نیست.", {
      status: 409,
      code: "arena_network_upgrade_failed",
    });
  }

  const oldDialogCandidates = `$btnCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
$itemCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::ListItem)
$orCond = New-Object System.Windows.Automation.OrCondition($btnCond, $itemCond)
$candidates = $dialogWindow.FindAll([System.Windows.Automation.TreeScope]::Descendants, $orCond)`;
  const safeDialogCandidates = `$candidates = $dialogWindow.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)`;
  if (source.includes(oldDialogCandidates)) {
    source = source.replace(oldDialogCandidates, safeDialogCandidates);
  }
  if (!source.includes(safeDialogCandidates)) {
    throw new AppError("بخش گزینه‌های پنجره نتیجه Arena قابل ارتقا نیست.", {
      status: 409,
      code: "arena_dialog_upgrade_failed",
    });
  }

  if (!source.includes("# ۶) پایان واقعی فقط با ظهور پنجره نتیجه Arena تأیید می‌شود.")) {
    const fixedWaitBlock = `    # ۶) صبر کوتاه بعد از Enter تا نتیجه ارسال در صفحه دیده شود
    print(f"صبر {AFTER_ENTER_WAIT} ثانیه‌ای پیش از اسکرین‌شات...")
    time.sleep(AFTER_ENTER_WAIT)
`;
    const completionWaitBlock = `    # ۶) پایان واقعی فقط با ظهور پنجره نتیجه Arena تأیید می‌شود.
    print("ارسال انجام شد؛ منتظر پایان کار مقصد و پنجره نتیجه Arena هستیم...")
    wait_for_arena_completion()
`;
    if (!source.includes(fixedWaitBlock)) {
      throw new AppError("بخش انتظار پاسخ Arena برای ارتقای پایش پایان کار پیدا نشد.", {
        status: 409,
        code: "arena_completion_upgrade_failed",
        hint: "بخش AFTER_ENTER_WAIT فایل job_arena.py را با نسخه‌ی شناخته‌شده مقایسه کنید.",
      });
    }
    source = source.replace(fixedWaitBlock, completionWaitBlock);
  }

  const oldRunner = `def type_and_submit():
    output = run_hidden_powershell(
        TYPE_PS_SCRIPT,
        extra_env={"ARENA_PROMPT": PROMPT_TEXT, "ARENA_URL": URL},
        timeout=120,
    )
    markers = [line.strip() for line in output.splitlines() if line.strip()]
`;
  const currentRunner = `def type_and_submit():
    output = run_hidden_powershell(
        TYPE_PS_SCRIPT,
        extra_env={"ARENA_PROMPT": PROMPT_TEXT, "ARENA_URL": URL},
        timeout=150,
    )
    markers = [line.strip() for line in output.splitlines() if line.strip()]
`;
  const diagnosticRunner = `def type_and_submit():
    safe_id = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in PROMPT_REQUEST_ID)
    diagnostic_dir = os.path.join(os.path.dirname(SCREENSHOT_DIR), "logs", "errors")
    os.makedirs(diagnostic_dir, exist_ok=True)
    trace_id = safe_id + "_" + datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    # UIA داخل PowerShell مسیر اصلی یافتن composer است؛ OCR امنیتی پیش‌تر یک‌بار اجرا شده
    # و نباید با اجرای تکراری helper تایپ را ده‌ها ثانیه دیگر معطل کند.
    ocr_point = None
    output = run_hidden_powershell(
        TYPE_PS_SCRIPT,
        extra_env={
            "ARENA_PROMPT": PROMPT_TEXT,
            "ARENA_URL": URL,
            "ARENA_DIAGNOSTIC_DIR": diagnostic_dir,
            "ARENA_TRACE_ID": trace_id,
            "ARENA_OCR_X": str(ocr_point["x"]) if ocr_point else "",
            "ARENA_OCR_Y": str(ocr_point["y"]) if ocr_point else "",
        },
        timeout=180,
    )
    markers = [line.strip() for line in output.splitlines() if line.strip()]
    for marker in markers:
        if marker.startswith("ARENA_STEP_SCREENSHOT="):
            step_path = marker.split("=", 1)[1]
            step_name = os.path.splitext(os.path.basename(step_path))[0].rsplit("_", 1)[-1]
            register_step_artifact(step_path, "prompt-" + step_name)
    if markers:
        print("گزارش فنی Arena: " + " | ".join(markers))
`;
  if (source.includes(oldRunner)) source = source.replace(oldRunner, diagnosticRunner);
  else if (source.includes(currentRunner)) source = source.replace(currentRunner, diagnosticRunner);

  if (!source.includes('register_step_artifact(step_path, "prompt-" + step_name)')) {
    const markersAnchor = `    markers = [line.strip() for line in output.splitlines() if line.strip()]\n`;
    const artifactMarkers = `${markersAnchor}    for marker in markers:\n        if marker.startswith("ARENA_STEP_SCREENSHOT="):\n            step_path = marker.split("=", 1)[1]\n            step_name = os.path.splitext(os.path.basename(step_path))[0].rsplit("_", 1)[-1]\n            register_step_artifact(step_path, "prompt-" + step_name)\n`;
    if (!source.includes(markersAnchor)) {
      throw new AppError("خروجی اسکرین‌شات‌های مرحله‌ای Arena برای ثبت artifact پیدا نشد.", {
        status: 409,
        code: "arena_artifact_marker_upgrade_failed",
      });
    }
    source = source.replace(markersAnchor, artifactMarkers);
  }

  const redundantComposerOcr = `    wait_for_network()\n    try:\n        ocr_point = find_text_with_ocr([COMPOSER_PLACEHOLDER], stage="composer")\n    except Exception as exc:\n        print(f"هشدار: مکان‌یابی اولیه PaddleOCR ممکن نشد: {exc}")\n        ocr_point = None\n`;
  if (source.includes(redundantComposerOcr)) {
    source = source.replace(
      redundantComposerOcr,
      `    # OCR امنیتی پیش‌تر اجرا شده؛ UIA و focus guard مسیر اصلی composer هستند.\n    ocr_point = None\n`,
    );
  }

  if (!source.includes('"ARENA_OCR_X"')) {
    const traceAnchor = `    trace_id = safe_id + "_" + datetime.now().strftime("%Y%m%d_%H%M%S_%f")\n`;
    const traceWithOcr = `${traceAnchor}    wait_for_network()\n    try:\n        ocr_point = find_text_with_ocr([COMPOSER_PLACEHOLDER], stage="composer")\n    except Exception as exc:\n        print(f"هشدار: مکان‌یابی اولیه PaddleOCR ممکن نشد: {exc}")\n        ocr_point = None\n`;
    const envAnchor = `            "ARENA_TRACE_ID": trace_id,\n`;
    const envWithOcr = `${envAnchor}            "ARENA_OCR_X": str(ocr_point["x"]) if ocr_point else "",\n            "ARENA_OCR_Y": str(ocr_point["y"]) if ocr_point else "",\n`;
    if (!source.includes(traceAnchor) || !source.includes(envAnchor)) {
      throw new AppError("تابع اجرای Arena برای اتصال PaddleOCR قابل ارتقا نیست.", {
        status: 409,
        code: "arena_ocr_runner_upgrade_failed",
      });
    }
    source = source.replace(traceAnchor, traceWithOcr).replace(envAnchor, envWithOcr);
  }
  if (!source.includes("ARENA_DIAGNOSTIC_DIR")) {
    throw new AppError("تابع اجرای PowerShell برای ثبت تصاویر مرحله‌ای قابل ارتقا نیست.", {
      status: 409,
      code: "arena_runner_upgrade_failed",
    });
  }

  // گزارش فنی باید حتی پیش از raise شدن خطای تأیید در لاگ مادر دیده شود.
  source = source.replace(
    `
    if markers:
        print("گزارش فنی: " + " | ".join(markers))
`,
    "\n",
  );
  return source;
}


/** ارتقای درجا از Bridge 1 تا 9؛ پرامپت و بدنه‌ی اصلی Arena دست‌نخورده می‌مانند. */
function upgradeLegacyBridge(source: string, oldMarker: string): string {
  const bridgeStart = source.indexOf(oldMarker);
  const openSiteStart = source.indexOf("\ndef open_site():", bridgeStart);
  if (bridgeStart < 0 || openSiteStart < 0) {
    throw new AppError("ساختار Arena Bridge قبلی برای ارتقای خودکار کامل نیست.", {
      status: 409,
      code: "arena_bridge_upgrade_failed",
      hint: "بلوک Bridge قدیمی یا تابع open_site پیدا نشد؛ job_arena.py را بررسی کنید.",
    });
  }

  // کل بلوک Bridge قدیمی با Bridge 7 جایگزین می‌شود؛ بدنه‌ی اصلی کار حفظ می‌شود.
  let upgraded = source.slice(0, bridgeStart) + TELEGRAM_BRIDGE.trimEnd() + source.slice(openSiteStart);
  const wrapperStart = upgraded.lastIndexOf("\ndef main():\n");
  if (wrapperStart < 0 || !upgraded.includes("\ndef _run_arena_task():\n")) {
    throw new AppError("تابع‌های Arena Bridge قبلی برای ارتقای خودکار پیدا نشدند.", {
      status: 409,
      code: "arena_bridge_upgrade_failed",
      hint: "job_arena.py باید شامل _run_arena_task و wrapper اصلی Bridge قبلی باشد.",
    });
  }

  // wrapper قدیمی تا انتهای فایل قرار داشت؛ نسخه‌ی جدید جای آن می‌نشیند.
  upgraded = `${upgraded.slice(0, wrapperStart)}\n\n${WRAPPED_MAIN.trimEnd()}\n`;
  return upgraded;
}

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
  if (
    source.includes(BRIDGE_9_MARKER) ||
    source.includes(BRIDGE_8_MARKER) ||
    source.includes(BRIDGE_7_MARKER) ||
    source.includes(BRIDGE_6_MARKER) ||
    source.includes(BRIDGE_5_MARKER) ||
    source.includes(BRIDGE_4_MARKER) ||
    source.includes(BRIDGE_3_MARKER) ||
    source.includes(BRIDGE_2_MARKER) ||
    source.includes(LEGACY_BRIDGE_MARKER)
  ) {
    const oldMarker = source.includes(BRIDGE_9_MARKER)
      ? BRIDGE_9_MARKER
      : source.includes(BRIDGE_8_MARKER)
        ? BRIDGE_8_MARKER
        : source.includes(BRIDGE_7_MARKER)
        ? BRIDGE_7_MARKER
        : source.includes(BRIDGE_6_MARKER)
        ? BRIDGE_6_MARKER
        : source.includes(BRIDGE_5_MARKER)
        ? BRIDGE_5_MARKER
        : source.includes(BRIDGE_4_MARKER)
          ? BRIDGE_4_MARKER
          : source.includes(BRIDGE_3_MARKER)
            ? BRIDGE_3_MARKER
            : source.includes(BRIDGE_2_MARKER)
              ? BRIDGE_2_MARKER
              : LEGACY_BRIDGE_MARKER;
    source = upgradeLegacyBridge(source, oldMarker);
    source = hardenArenaTyping(source);
    source = replaceAssignment(source, "TELEGRAM_REPORT_MODE", options.telegramMode);
    source = replaceAssignment(source, "PROMPT_REQUEST_ID", options.requestId);
    return source.endsWith("\n") ? source : `${source}\n`;
  }
  if (source.includes(ANY_BRIDGE_MARKER)) {
    throw new AppError("نسخه‌ی Arena Bridge شناخته‌شده نیست.", {
      status: 409,
      code: "arena_bridge_upgrade_required",
      hint: "نسخه‌ی job_arena.py را بررسی کنید؛ Bridgeهای 1 تا 10 به‌صورت خودکار پشتیبانی می‌شوند.",
    });
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

  // خطاهای اصلی باید تا wrapper بالا بیایند تا نتیجه‌ی «ناموفق» واقعی باشد.
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
  source = hardenArenaTyping(source);
  return source;
}
