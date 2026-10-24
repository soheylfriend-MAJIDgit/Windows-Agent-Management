import { AppError } from "./errors";

export type TelegramReportMode = "off" | "final" | "start_final";

export const ARENA_JOB_NAME = "job_arena.py";
const BRIDGE_MARKER = "# management-arena-bridge: 5";
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
# گزارش نتیجه از راه صف محلی رباتِ خود Windows Agent ارسال می‌شود؛
# هیچ توکن تلگرامی داخل این فایل یا گیت‌هاب قرار نمی‌گیرد.
TELEGRAM_REPORT_MODE = "final"
PROMPT_REQUEST_ID = "initial"
FAILURE_FEEDBACK_ATTEMPTS = 3
BOT_API_CONFIG = os.path.join(
    os.environ.get("LOCALAPPDATA", ""), "Windows-Agent", "bot_api.json"
)


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
    """پیش از بازخورد، لاگ و اسکرین‌شات شکست را در Google Drive می‌گذارد."""
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
                "موضوع: شکست job_arena.py و نیاز به بررسی ایجنت همکار\\n"
                "نسخه برنامه: Arena Bridge 5\\n"
                "شناسه درخواست: " + PROMPT_REQUEST_ID + "\\n"
                "پرامپت: " + PROMPT_TEXT + "\\n\\n"
                "جزئیات خطا:\\n" + str(detail)
            )
        saved.append(report_path)
    except Exception as exc:
        print(f"هشدار: ذخیره گزارش شکست ممکن نشد: {exc}")
    try:
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)
        take_screenshot(screenshot_path)
        saved.append(screenshot_path)
    except Exception as exc:
        print(f"هشدار: گرفتن اسکرین‌شات شکست ممکن نشد: {exc}")
    return saved


def handle_failure_dialog_if_present():
    """اگر پرسش نتیجه باز است، برای اجرای ناموفق گزینه No را انتخاب می‌کند."""
    try:
        failure_script = DIALOG_PS_SCRIPT.replace(
            "$el.Current.Name -eq 'Yes'", "$el.Current.Name -eq 'No'"
        )
        output = run_hidden_powershell(failure_script, timeout=60)
        if "ARENA_DIALOG_CLICKED" in output:
            print("پنجره نتیجه پیدا شد؛ گزینه No برای اجرای ناموفق کلیک شد")
            time.sleep(DIALOG_CLICK_WAIT)
            return True
    except Exception as exc:
        print(f"هشدار: انتخاب No در پنجره نتیجه ممکن نشد: {exc}")
    return False


def send_failure_feedback(detail, artifact_paths):
    """حداکثر سه بار تلاش می‌کند شکست را به گفت‌وگوی ایجنت همکار برگرداند."""
    global PROMPT_TEXT
    original_prompt = PROMPT_TEXT
    paths_text = "، ".join(artifact_paths) if artifact_paths else "پوشه‌های logs و ScreenShots"
    feedback = (
        "اجرای درخواست ناموفق بود. لطفاً گزارش‌ها و در صورت نیاز اسکرین‌شات‌ها را "
        "در Google Drive بررسی کن، علت را پیدا کن و یک نسخه اصلاح‌شده یا بازنویسی‌شده در کاتالوگ D1 ثبت کن. "
        f"شناسه درخواست: {PROMPT_REQUEST_ID}. مسیرهای مرتبط: {paths_text}"
    )
    last_error = None
    try:
        for attempt in range(1, FAILURE_FEEDBACK_ATTEMPTS + 1):
            try:
                print(f"تلاش {attempt} از {FAILURE_FEEDBACK_ATTEMPTS} برای ارسال بازخورد شکست...")
                PROMPT_TEXT = feedback
                open_site()
                time.sleep(PAGE_LOAD_WAIT)
                maximize_browser()
                handle_failure_dialog_if_present()
                type_and_submit()
                print("بازخورد اجرای ناموفق به ایجنت همکار ارسال شد")
                return True
            except Exception as exc:
                last_error = exc
                print(f"ارسال بازخورد در تلاش {attempt} ناموفق بود: {exc}")
                if attempt < FAILURE_FEEDBACK_ATTEMPTS:
                    time.sleep(4)
    finally:
        PROMPT_TEXT = original_prompt
    print(f"بازخورد شکست پس از سه تلاش ارسال نشد: {last_error}")
    return False
`;

const WRAPPED_MAIN = `def main():
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
        feedback_sent = send_failure_feedback(summary, artifacts)
        feedback_note = "بازخورد به ایجنت همکار ارسال شد." if feedback_sent else "ارسال بازخورد پس از سه تلاش ناموفق بود."
        send_telegram_status("ناموفق", summary + "\\n" + feedback_note + "\\n" + trace[-1200:])
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
        $focusedNormalized = ([string]$focusedText).Replace("\`r\`n", "\`n").TrimEnd([char[]]"\`r\`n")
        $composerNormalized = ([string]$composerText).Replace("\`r\`n", "\`n").TrimEnd([char[]]"\`r\`n")
        $okFocused = $focusSafeAfterInput -and $focusedText -and $focusedNormalized.Contains($promptNormalized)
        $okComposer = $focusSafeAfterInput -and $composerText -and $composerNormalized.Contains($promptNormalized)

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
                $okCopied = ($copiedNormalized -eq $promptNormalized)
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
    output = run_hidden_powershell(
        TYPE_PS_SCRIPT,
        extra_env={
            "ARENA_PROMPT": PROMPT_TEXT,
            "ARENA_URL": URL,
            "ARENA_DIAGNOSTIC_DIR": diagnostic_dir,
            "ARENA_TRACE_ID": trace_id,
        },
        timeout=180,
    )
    markers = [line.strip() for line in output.splitlines() if line.strip()]
    if markers:
        print("گزارش فنی Arena: " + " | ".join(markers))
`;
  if (source.includes(oldRunner)) source = source.replace(oldRunner, diagnosticRunner);
  else if (source.includes(currentRunner)) source = source.replace(currentRunner, diagnosticRunner);
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


/** ارتقای درجا از Bridge 1 تا 4؛ پرامپت و بدنه‌ی اصلی Arena دست‌نخورده می‌مانند. */
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

  // کل بلوک Bridge قدیمی با Bridge 5 جایگزین می‌شود؛ بدنه‌ی اصلی کار حفظ می‌شود.
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
    source.includes(BRIDGE_4_MARKER) ||
    source.includes(BRIDGE_3_MARKER) ||
    source.includes(BRIDGE_2_MARKER) ||
    source.includes(LEGACY_BRIDGE_MARKER)
  ) {
    const oldMarker = source.includes(BRIDGE_4_MARKER)
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
      hint: "نسخه‌ی job_arena.py را بررسی کنید؛ Bridgeهای 1 تا 5 به‌صورت خودکار پشتیبانی می‌شوند.",
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
