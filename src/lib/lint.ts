import type { Issue, LintResult } from "./types";
import { MAX_JOB_FILE_BYTES, MAX_JOB_RUNTIME_SECONDS } from "./config";

/**
 * بررسی قواعد فایل‌های ایجنت همکار.
 * چون Worker پایتون اجرا نمی‌کند، یک تحلیل‌گر سبک روی توکن‌های پایتون انجام می‌شود:
 * رشته‌ها/کامنت‌ها جدا می‌شوند تا import و input واقعی تشخیص داده شود.
 * برای AST کامل، اسکریپت اختیاری scripts/lint_job.py در مخزن هست.
 */

const STDLIB = new Set<string>([
  "abc", "aifc", "antigravity", "argparse", "array", "ast", "asynchat", "asyncio", "asyncore",
  "atexit", "audioop", "base64", "bdb", "binascii", "binhex", "bisect", "builtins", "bz2",
  "cProfile", "calendar", "cgi", "cgitb", "chunk", "cmath", "cmd", "code", "codecs", "codeop",
  "collections", "colorsys", "compileall", "concurrent", "configparser", "contextlib", "contextvars",
  "copy", "copyreg", "crypt", "csv", "ctypes", "curses", "dataclasses", "datetime", "dbm", "decimal",
  "difflib", "dis", "distutils", "doctest", "email", "encodings", "ensurepip", "enum", "errno",
  "faulthandler", "fcntl", "filecmp", "fileinput", "fnmatch", "formatter", "fractions", "ftplib",
  "functools", "gc", "genericpath", "getopt", "getpass", "gettext", "glob", "graphlib", "grp",
  "gzip", "hashlib", "heapq", "hmac", "html", "http", "idlelib", "imaplib", "imghdr", "imp",
  "importlib", "inspect", "io", "ipaddress", "itertools", "json", "keyword", "lib2to3", "linecache",
  "locale", "logging", "lzma", "mailbox", "mailcap", "marshal", "math", "mimetypes", "mmap",
  "modulefinder", "msilib", "msvcrt", "multiprocessing", "netrc", "nis", "nntplib", "nt", "ntpath",
  "nturl2path", "numbers", "opcode", "operator", "optparse", "os", "ossaudiodev", "parser",
  "pathlib", "pdb", "pickle", "pickletools", "pipes", "pkgutil", "platform", "plistlib", "poplib",
  "posix", "posixpath", "pprint", "profile", "pstats", "pty", "pwd", "py_compile", "pyclbr", "pydoc",
  "pydoc_data", "pyexpat", "queue", "quopri", "random", "re", "readline", "reprlib", "resource",
  "rlcompleter", "runpy", "sched", "secrets", "select", "selectors", "shelve", "shlex", "shutil",
  "signal", "site", "smtpd", "smtplib", "sndhdr", "socket", "socketserver", "spwd", "sqlite3",
  "sre_compile", "sre_constants", "sre_parse", "ssl", "stat", "statistics", "string", "stringprep",
  "struct", "subprocess", "sunau", "symbol", "symtable", "sys", "sysconfig", "syslog", "tabnanny",
  "tarfile", "telnetlib", "tempfile", "termios", "textwrap", "this", "threading", "time", "timeit",
  "tkinter", "token", "tokenize", "tomllib", "trace", "traceback", "tracemalloc", "tty", "turtle",
  "turtledemo", "types", "typing", "unicodedata", "unittest", "urllib", "uu", "uuid", "venv",
  "warnings", "wave", "weakref", "webbrowser", "winreg", "winsound", "wsgiref", "xdrlib", "xml",
  "xmlrpc", "zipapp", "zipfile", "zipimport", "zlib", "zoneinfo",
  "__future__",
]);

const FORBIDDEN_INTERACTIVE = [
  { re: /\binput\s*\(/, code: "uses_input", message: "از input() استفاده شده است.", hint: "پنل ویندوز بدون کنسول اجرا می‌کند؛ ورودی تعاملی حذف شود." },
  { re: /\bgetpass\s*\(/, code: "uses_input", message: "از getpass() استفاده شده است.", hint: "ورودی تعاملی در پنل ویندوز ممکن نیست." },
  { re: /sys\s*\.\s*stdin\s*\.\s*read/, code: "uses_input", message: "از stdin خوانده می‌شود.", hint: "کد باید بدون ورودی تعاملی کار کند." },
];

export function validateJobName(name: string): Issue[] {
  const issues: Issue[] = [];
  if (!name.trim()) {
    issues.push({ code: "name_empty", message: "نام فایل خالی است.", severity: "error" });
    return issues;
  }
  if (!name.endsWith(".py")) {
    issues.push({ code: "name_ext", message: "پسوند فایل باید .py باشد.", severity: "error" });
  }
  if (!name.startsWith("job_")) {
    issues.push({ code: "name_prefix", message: "نام فایل باید با job_ شروع شود.", severity: "error" });
  }
  if (!/^[A-Za-z0-9_]+\.py$/.test(name)) {
    issues.push({
      code: "name_chars",
      message: "نام فایل فقط می‌تواند حروف لاتین، عدد و زیرخط داشته باشد و باید به .py ختم شود.",
      severity: "error",
    });
  }
  if (name.length > 80) {
    issues.push({ code: "name_long", message: "نام فایل بیش از حد بلند است (حداکثر ۸۰ نویسه).", severity: "error" });
  }
  if (name.includes("/") || name.includes("\\")) {
    issues.push({
      code: "name_root",
      message: "فایل باید مستقیماً در ریشه‌ی مخزن باشد، نه داخل پوشه.",
      severity: "error",
    });
  }
  return issues;
}

interface ScanResult {
  code: string;
  strings: Array<{ value: string; line: number }>;
  comments: Array<{ value: string; line: number }>;
  unterminated: boolean;
  unterminatedLine: number;
}

/** رشته‌ها و کامنت‌ها را جدا می‌کند و کدِ خالص را با حفظ شماره خط برمی‌گرداند. */
export function scanPython(source: string): ScanResult {
  let out = "";
  const strings: Array<{ value: string; line: number }> = [];
  const comments: Array<{ value: string; line: number }> = [];
  let line = 1;
  let i = 0;
  let unterminated = false;
  let unterminatedLine = 0;

  const countNewlines = (text: string) => (text.match(/\n/g) ?? []).length;

  while (i < source.length) {
    const ch = source[i];

    if (ch === "#") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      const value = source.slice(i + 1, stop);
      comments.push({ value, line });
      out += " ".repeat(stop - i);
      i = stop;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const startLine = line;
      const triple = source.slice(i, i + 3) === ch.repeat(3);
      const quote = triple ? ch.repeat(3) : ch;
      let j = i + quote.length;
      let value = "";
      let closed = false;
      while (j < source.length) {
        if (source[j] === "\\") {
          value += source[j] + (source[j + 1] ?? "");
          j += 2;
          continue;
        }
        if (source.slice(j, j + quote.length) === quote) {
          closed = true;
          j += quote.length;
          break;
        }
        if (source[j] === "\n" && !triple) break;
        value += source[j];
        j += 1;
      }
      if (!closed) {
        unterminated = true;
        unterminatedLine = startLine;
      }
      strings.push({ value, line: startLine });
      const raw = source.slice(i, j);
      out += raw.replace(/[^\n]/g, " ");
      line += countNewlines(raw);
      if (!closed && !triple) {
        const end = source.indexOf("\n", j);
        const stop = end === -1 ? source.length : end;
        out += " ".repeat(stop - j);
        j = stop;
      }
      i = j;
      continue;
    }

    if (ch === "\n") line += 1;
    out += ch;
    i += 1;
  }

  return { code: out, strings, comments, unterminated, unterminatedLine };
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function isStdlibModule(name: string): boolean {
  if (!name) return false;
  const top = name.split(".")[0];
  return STDLIB.has(top);
}

export function lintPython(
  source: string,
  options: { name?: string; checkSize?: boolean; strict?: boolean } = {},
): LintResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const name = options.name;

  if (name) errors.push(...validateJobName(name).filter((i) => i.severity === "error"));

  const byteLength = new TextEncoder().encode(source).length;
  if ((options.checkSize ?? true) && byteLength > MAX_JOB_FILE_BYTES) {
    errors.push({
      code: "file_too_large",
      message: "حجم فایل بیش از حد مجاز است (۵۱۲ کیلوبایت).",
      severity: "error",
    });
  }
  if (!source.trim()) {
    errors.push({ code: "empty", message: "فایل خالی است.", severity: "error" });
    return { ok: false, errors, warnings };
  }

  const scan = scanPython(source);
  if (scan.unterminated) {
    errors.push({
      code: "syntax_string",
      message: "یک رشته‌ی پایتون بسته نشده است (خطا در نقل‌قول).",
      line: scan.unterminatedLine,
      severity: "error",
      hint: "فایل را در پایتون اجرا یا با linter بررسی کنید.",
    });
  }

  // import ها
  const importRe = /^[ \t]*(?:from[ \t]+([A-Za-z_.][\w.]*)[ \t]+import|import[ \t]+([^\n;]+))/gm;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(scan.code)) !== null) {
    const line = lineOf(scan.code, match.index);
    if (match[1]) {
      const moduleName = match[1].trim();
      if (moduleName.startsWith(".")) {
        errors.push({
          code: "relative_import",
          message: "import نسبی مجاز نیست؛ فایل باید کاملاً مستقل باشد.",
          line,
          severity: "error",
        });
      } else if (!isStdlibModule(moduleName)) {
        errors.push({
          code: "non_stdlib_import",
          message: `ماژول «${moduleName}» جزو کتابخانه‌ی استاندارد پایتون نیست.`,
          line,
          severity: "error",
          hint: "پنل ویندوز pip install انجام نمی‌دهد؛ فقط کتابخانه استاندارد مجاز است.",
        });
      }
    } else if (match[2]) {
      const parts = match[2].split(",");
      for (const part of parts) {
        const moduleName = part.trim().split(/\s+/)[0];
        if (!moduleName) continue;
        if (moduleName.startsWith(".")) {
          errors.push({
            code: "relative_import",
            message: "import نسبی مجاز نیست؛ فایل باید کاملاً مستقل باشد.",
            line,
            severity: "error",
          });
        } else if (!isStdlibModule(moduleName)) {
          errors.push({
            code: "non_stdlib_import",
            message: `ماژول «${moduleName}» جزو کتابخانه‌ی استاندارد پایتون نیست.`,
            line,
            severity: "error",
            hint: "پنل ویندوز pip install انجام نمی‌دهد؛ فقط کتابخانه استاندارد مجاز است.",
          });
        }
      }
    }
  }

  for (const rule of FORBIDDEN_INTERACTIVE) {
    const m = rule.re.exec(scan.code);
    if (m) {
      errors.push({
        code: rule.code,
        message: rule.message,
        line: lineOf(scan.code, m.index),
        severity: "error",
        hint: rule.hint,
      });
    }
  }

  if (/__import__\s*\(|importlib\s*\.\s*import_module/.test(scan.code)) {
    errors.push({
      code: "dynamic_import",
      message: "import پویا (__import__/importlib) مجاز نیست.",
      severity: "error",
      hint: "کتابخانه‌ی غیراستاندارد نمی‌تواند به‌صورت پویا بارگذاری شود.",
    });
  }

  // مسیرهای مطلق ویندوزی داخل رشته‌ها
  // داک‌استرینگ ماژول (توضیح پرامپت) از این بررسی کنار گذاشته می‌شود؛
  // ذکر یک مسیر در توضیح، تخلف اجرایی نیست.
  const pathRe = /(?:^|[^A-Za-z])[A-Za-z]:[\\/]/;
  const codeLines = scan.code.split("\n");
  const isModuleDocstringLine = (line: number): boolean =>
    codeLines.slice(0, Math.max(0, line - 1)).join("\n").trim() === "";
  for (const str of scan.strings) {
    if (isModuleDocstringLine(str.line)) continue;
    if (pathRe.test(str.value) || /\\\\Users\\\\/i.test(str.value)) {
      const issue: Issue = {
        code: "absolute_windows_path",
        message: "مسیر مطلق ویندوزی در کد وجود دارد.",
        line: str.line,
        severity: options.strict ? "error" : "warning",
        hint:
          "از Path.home() یا os.environ[\"USERPROFILE\"] یا مسیر نسبی استفاده کنید؛ نام کاربر ویندوز می‌تواند عوض شود. " +
          "فایل‌های موجود مخزن این مسیر را دارند و فقط هشدار می‌گیرند؛ کد تازه باید اصلاح شود.",
      };
      // فایل‌های موجود (از جمله job_arena.py) با strict=false فقط هشدار می‌گیرند؛
      // گذاشتن issue در errors حتی با severity=warning باعث ok=false می‌شد.
      if (options.strict) errors.push(issue);
      else warnings.push(issue);
      break;
    }
  }

  // هشدارها
  if (!/\bprint\s*\(/.test(scan.code)) {
    warnings.push({
      code: "no_print",
      message: "هیچ print() در کد نیست؛ خروجی متنی برای گزارش اجرا لازم است.",
      severity: "warning",
    });
  }
  if (/while\s+True\s*:/.test(scan.code) && !/\bbreak\b/.test(scan.code)) {
    warnings.push({
      code: "infinite_loop",
      message: "حلقه‌ی while True بدون break دیده می‌شود.",
      severity: "warning",
      hint: "حداکثر زمان اجرا ۶۰۰ ثانیه است و بعد از آن پروسه کشته می‌شود.",
    });
  }
  const sleepMatch = /time\s*\.\s*sleep\s*\(\s*(\d+)\s*\)/.exec(scan.code);
  if (sleepMatch && Number(sleepMatch[1]) > MAX_JOB_RUNTIME_SECONDS) {
    errors.push({
      code: "sleep_too_long",
      message: `time.sleep(${sleepMatch[1]}) از حداکثر زمان اجرا (۶۰۰ ثانیه) بیشتر است.`,
      severity: "error",
    });
  }
  if (/\beval\s*\(|\bexec\s*\(/.test(scan.code)) {
    warnings.push({ code: "eval_exec", message: "استفاده از eval/exec ریسک امنیتی دارد.", severity: "warning" });
  }
  if (/shell\s*=\s*True/.test(scan.code)) {
    warnings.push({
      code: "shell_true",
      message: "subprocess با shell=True اجرا می‌شود؛ ریسک تزریق دستور دارد.",
      severity: "warning",
    });
  }
  if (!source.includes("if __name__")) {
    warnings.push({
      code: "no_main_guard",
      message: "بلوک if __name__ == \"__main__\" دیده نمی‌شود.",
      severity: "warning",
      hint: "اختیاری است، اما برای اجرای مستقیم امن‌تر است.",
    });
  }

  // حذف موارد تکراری
  const dedupe = (items: Issue[]) => {
    const seen = new Set<string>();
    return items.filter((i) => {
      const key = `${i.code}:${i.line ?? ""}:${i.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const finalErrors = dedupe(errors);
  return { ok: finalErrors.length === 0, errors: finalErrors, warnings: dedupe(warnings) };
}

/** اولین داک‌استرینگ ماژول یا اولین کامنت توضیحی */
export function extractDocstring(source: string): string {
  const before = source.replace(/^\uFEFF/, "");
  const docRe = /^(?:(?:[ \t]*#.*\n)|(?:[ \t]*\n))*[ \t]*[rRuUbBfF]{0,2}(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/;
  const m = before.match(docRe);
  if (m) {
    const body = (m[1] ?? m[2] ?? "").trim();
    const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    // سرتیترهایی مثل «کار این فایل:» به‌تنهایی توضیح مفیدی نیستند.
    let first = lines[0];
    if (first && first.endsWith(":") && lines[1]) first = lines[1];
    if (first) return first.slice(0, 220);
  }
  const comments = source
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.startsWith("#") &&
        !/^#!|coding[:=]|^#\s*(rerun|اجرای دوباره)/i.test(l) &&
        !/^#+\s*job_[\w-]+\.py\s*$/i.test(l) &&
        !/^#+[-=]{3,}$/.test(l),
    )
    .map((l) => l.replace(/^#+\s*/, ""));
  const comment = comments.find((l) => l.length >= 8 && !l.endsWith(":")) ?? comments[0];
  return comment ? comment.slice(0, 220) : "";
}

export function countLines(source: string): number {
  if (!source) return 0;
  return source.split(/\r?\n/).length;
}
