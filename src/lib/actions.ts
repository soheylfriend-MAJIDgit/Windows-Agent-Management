import {
  commitHtmlUrl,
  getRepoConfig,
  isJobFileName,
  slugToJobName,
  zipUrl,
} from "./config";
import { envVar } from "./db";
import { AppError } from "./errors";
import {
  commitFile,
  fetchArchive,
  invalidateArchiveCache,
  readRepoFile,
  requireGithubToken,
  type WriteResult,
} from "./github";
import { formatJalaliDateTime, jalaliStamp } from "./jalali";
import { lintPython, validateJobName } from "./lint";
import { insertEvent, insertPrompt, saveJobsSnapshot, setJobChanged, updatePromptResult } from "./store";
import type { Issue, PromptMode, RepoConfig } from "./types";
import {
  ARENA_JOB_NAME,
  buildArenaJobFile,
  type TelegramReportMode,
} from "./arena-job";

async function refreshSnapshot(config: RepoConfig): Promise<void> {
  invalidateArchiveCache(config);
  try {
    const archive = await fetchArchive(config, { force: true });
    await saveJobsSnapshot(
      archive.files.map((file) => ({
        name: file.name,
        size: file.size,
        lines: file.lines,
        docstring: file.docstring,
        content: file.content,
        sha: file.sha,
        archiveUpdatedAt: file.archiveUpdatedAt,
        issues: file.issues,
      })),
    );
  } catch {
    // اسنپ‌شات در درخواست بعدی دوباره تلاش می‌شود.
  }
}

function randomMarker(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** درج خط نشانه بعد از shebang/coding تا کد پایتون معتبر بماند. */
export function insertRerunMarker(content: string, marker: string): string {
  // نشانه‌های اجرای قبلی حذف می‌شوند تا فایل با هر بار اجرا شلوغ نشود.
  const lines = content.split("\n").filter((line) => !/^#\s*rerun\s*:/i.test(line));
  let index = 0;
  if (lines[0]?.startsWith("#!")) index = 1;
  if (lines[index] && /^#.*coding[:=]/.test(lines[index])) index += 1;
  const head = lines.slice(0, index);
  const tail = lines.slice(index);
  return [...head, marker, ...tail].join("\n");
}

export interface RerunResult {
  jobName: string;
  commitSha: string;
  commitUrl: string;
  message: string;
  marker: string;
  fileUrl: string | null;
  dryRun?: boolean;
  content?: string;
}

export async function rerunJob(name: string, options: { dryRun?: boolean } = {}): Promise<RerunResult> {
  if (!isJobFileName(name)) {
    throw new AppError("نام فایل معتبر نیست.", {
      status: 400,
      code: "invalid_job_name",
      hint: "فقط فایل‌های job_*.py در ریشه‌ی مخزن قابل اجرا هستند.",
    });
  }
  const token = await requireGithubToken(await envVar("GITHUB_TOKEN"));
  const config = await getRepoConfig("collab", false);

  const marker = `# rerun: ${formatJalaliDateTime(new Date(), true)} تهران — ${randomMarker()}`;
  const message = `اجرای دوباره ${name} — ${jalaliStamp()} — ایجنت مدیریت`;

  const first = await readRepoFile(config, name, token);
  if (!first) {
    throw new AppError("فایل روی گیت‌هاب پیدا نشد.", {
      status: 404,
      code: "job_missing",
      hint: "فهرست کدها را به‌روزرسانی کنید.",
    });
  }

  const nextContent = insertRerunMarker(first.content, marker);
  if (options.dryRun) {
    return {
      jobName: name,
      commitSha: first.sha,
      commitUrl: "",
      message,
      marker,
      fileUrl: first.htmlUrl,
      dryRun: true,
      content: nextContent,
    };
  }

  let result: WriteResult;
  try {
    result = await commitFile(config, {
      path: name,
      content: nextContent,
      message,
      sha: first.sha,
      token,
    });
  } catch (err) {
    if (err instanceof AppError && err.code === "github_conflict") {
      const retry = await readRepoFile(config, name, token);
      if (!retry) throw err;
      result = await commitFile(config, {
        path: name,
        content: insertRerunMarker(retry.content, marker),
        message,
        sha: retry.sha,
        token,
      });
    } else {
      throw err;
    }
  }

  await setJobChanged(name);
  await insertEvent({
    kind: "rerun",
    title: `درخواست اجرای دوباره‌ی ${name}`,
    detail: "کامیت ثبت شد؛ پنل ویندوز با بررسی بعدی، نسخه‌ی تازه را در CODES می‌نویسد و اجرا می‌کند.",
    jobName: name,
    url: result.commitUrl,
  });
  await refreshSnapshot(config);

  return {
    jobName: name,
    commitSha: result.commitSha,
    commitUrl: result.commitUrl,
    message,
    marker,
    fileUrl: result.fileUrl,
  };
}

// ------------------------------------------------------------ پرامپت‌ها ---

function sanitizeDocstring(prompt: string): string {
  // بک‌اسلش‌ها escape می‌شوند تا خطِ پایان داک‌استرینگ را نشکنند؛
  // نویسه‌های کنترلی (به‌جز خط جدید) از سورس پایتون حذف می‌شوند.
  return prompt
    .replace(/\u0000/g, "")
    .replace(/\r/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/"""/g, "'''");
}

export function buildNewJobFile(options: { name: string; prompt: string; code?: string | null }): string {
  const stamp = formatJalaliDateTime(new Date(), true);
  const doc = sanitizeDocstring(options.prompt.trim());
  const code =
    options.code?.trim() ||
    [
      "def main() -> None:",
      '    print("این فایل از پرامپت ایجنت مدیریت ساخته شده و هنوز کد اجرایی ندارد.")',
      '    print("متن پرامپت در داک‌استرینگ بالای فایل ثبت شده است.")',
      "",
      "",
      'if __name__ == "__main__":',
      "    main()",
    ].join("\n");

  return [
    "# -*- coding: utf-8 -*-",
    `"""${options.name} — ساخته‌شده از پرامپت ایجنت مدیریت`,
    "",
    "پرامپت اصلی:",
    ...doc.split("\n").map((line) => (line ? `    ${line}` : "")),
    "",
    `تاریخ ساخت: ${stamp} تهران`,
    'منبع: پنل مدیریت ویندوز (ایجنت مدیریت)',
    '"""',
    "",
    code,
    "",
  ].join("\n");
}

export function buildAppendBlock(prompt: string): string {
  const stamp = formatJalaliDateTime(new Date(), true);
  const lines = prompt
    .trim()
    .split(/\r?\n/)
    .map((line) => `# ${line}`.trimEnd());
  return [
    "",
    "",
    "#" + "-".repeat(66),
    `# پرامپت ایجنت مدیریت — ${stamp} تهران`,
    ...lines,
    "#" + "-".repeat(66),
    "",
  ].join("\n");
}

export interface PromptInput {
  mode: PromptMode;
  jobName?: string;
  slug?: string;
  prompt: string;
  code?: string | null;
  /** نحوه‌ی گزارش نتیجه‌ی اجرای job_arena.py به مقصد پیش‌فرض ربات ویندوز. */
  telegramMode?: TelegramReportMode;
  /** فقط ساخت فایل و پیام کامیت را برمی‌گرداند؛ چیزی نوشته نمی‌شود. */
  dryRun?: boolean;
}

export interface PromptResult {
  promptId: number;
  jobName: string;
  mode: PromptMode;
  commitSha: string;
  commitUrl: string;
  message: string;
  commitLink: string;
  issues: Issue[];
  dryRun?: boolean;
  content?: string;
}

export async function submitPrompt(input: PromptInput): Promise<PromptResult> {
  const prompt = (input.prompt ?? "").trim();
  if (prompt.length < 8) {
    throw new AppError("متن پرامپت خیلی کوتاه است.", {
      status: 422,
      code: "prompt_too_short",
      hint: "دست‌کم چند جمله درباره‌ی کاری که کد باید انجام دهد بنویسید.",
    });
  }
  if (prompt.length > 8000) {
    throw new AppError("متن پرامپت بیش از حد بلند است (حداکثر ۸۰۰۰ نویسه).", {
      status: 422,
      code: "prompt_too_long",
    });
  }

  const token = await requireGithubToken(await envVar("GITHUB_TOKEN"));
  const config = await getRepoConfig("collab", false);
  const mode: PromptMode = input.mode === "arena" ? "arena" : input.mode === "append" ? "append" : "new";

  let jobName: string;
  let content: string;
  let sha: string | null = null;
  let code: string | null = null;
  let issues: Issue[] = [];

  if (mode === "arena") {
    jobName = ARENA_JOB_NAME;
    if (input.code?.trim()) {
      throw new AppError("در مسیر اختصاصی Arena فقط متن پرامپت پذیرفته می‌شود.", {
        status: 422,
        code: "code_not_allowed",
        hint: "کد اجرایی در job_arena.py ثابت است و این فرم فقط متن و تنظیم گزارش تلگرام را عوض می‌کند.",
      });
    }
    const telegramMode: TelegramReportMode =
      input.telegramMode === "off" || input.telegramMode === "start_final"
        ? input.telegramMode
        : "final";
    const file = await readRepoFile(config, jobName, token);
    if (!file) {
      throw new AppError("فایل اختصاصی job_arena.py روی گیت‌هاب پیدا نشد.", {
        status: 404,
        code: "arena_job_missing",
        hint: "فایل پایه باید در ریشه‌ی مخزن ایجنت همکار باشد.",
      });
    }
    sha = file.sha;
    const requestId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomMarker()}`;
    content = buildArenaJobFile({ source: file.content, prompt, telegramMode, requestId });
    const lint = lintPython(content, { name: jobName, strict: false });
    issues = [...lint.errors, ...lint.warnings];
    if (!lint.ok) {
      throw new AppError("فایل اختصاصی Arena پس از درج پرامپت معتبر نیست.", {
        status: 422,
        code: "arena_job_invalid",
        hint: "فایل job_arena.py یا متن پرامپت را بررسی کنید؛ هیچ کامیتی ثبت نشد.",
        details: lint.errors,
      });
    }
  } else if (mode === "new") {
    jobName = slugToJobName(input.slug || input.jobName || prompt.slice(0, 24));
    const nameIssues = validateJobName(jobName).filter((i) => i.severity === "error");
    if (nameIssues.length) {
      throw new AppError(nameIssues[0].message, {
        status: 422,
        code: "invalid_job_name",
        hint: "نام فایل را با حروف لاتین و زیرخط وارد کنید؛ مثل my_task که به job_my_task.py تبدیل می‌شود.",
        details: nameIssues,
      });
    }
    const existing = await readRepoFile(config, jobName, token);
    if (existing) {
      throw new AppError("فایلی با این نام از قبل در مخزن هست.", {
        status: 409,
        code: "job_exists",
        hint: "نام دیگری انتخاب کنید یا حالت «افزودن به کد موجود» را بزنید.",
      });
    }
    code = input.code?.trim() || null;
    if (code) {
      const lint = lintPython(code, { name: jobName, strict: true });
      issues = [...lint.errors, ...lint.warnings];
      if (!lint.ok) {
        throw new AppError("کد پیشنهادی قواعد ایجنت همکار را رعایت نمی‌کند.", {
          status: 422,
          code: "code_validation_failed",
          hint: "موارد قرمز را برطرف کنید یا کد را خالی بگذارید تا ایجنت همکار خودش بنویسد.",
          details: lint.errors,
        });
      }
    }
    content = buildNewJobFile({ name: jobName, prompt, code });
    const finalLint = lintPython(content, { name: jobName, strict: true });
    if (!finalLint.ok) {
      throw new AppError("فایل تولیدشده از نظر قواعد پایتون معتبر نیست.", {
        status: 422,
        code: "generated_code_invalid",
        hint: "متن پرامپت یا کد پیشنهادی را اصلاح کنید.",
        details: finalLint.errors,
      });
    }
  } else {
    jobName = (input.jobName ?? "").trim();
    if (!isJobFileName(jobName)) {
      throw new AppError("کد موجود انتخاب نشده یا نام آن معتبر نیست.", {
        status: 422,
        code: "invalid_job_name",
      });
    }
    if (input.code?.trim()) {
      throw new AppError("در حالت افزودن به کد موجود، کد جدید پذیرفته نمی‌شود.", {
        status: 422,
        code: "code_not_allowed",
        hint: "فقط متن پرامپت به‌صورت کامنت اضافه می‌شود؛ برای کد تازه، حالت «کد جدید» را انتخاب کنید.",
      });
    }
    const file = await readRepoFile(config, jobName, token);
    if (!file) {
      throw new AppError("فایل انتخاب‌شده روی گیت‌هاب پیدا نشد.", {
        status: 404,
        code: "job_missing",
      });
    }
    sha = file.sha;
    content = file.content + buildAppendBlock(prompt);
  }

  const message =
    mode === "arena"
      ? `ارسال پرامپت به Arena — ${jalaliStamp()}`
      : mode === "new"
        ? `پرامپت ایجنت مدیریت: ${jobName} — ${jalaliStamp()}`
        : `پرامپت ایجنت مدیریت برای ${jobName} — ${jalaliStamp()}`;

  if (input.dryRun) {
    return {
      promptId: 0,
      jobName,
      mode,
      commitSha: "",
      commitUrl: "",
      message,
      commitLink: "",
      issues,
      dryRun: true,
      content,
    };
  }

  const promptId = await insertPrompt({
    jobName,
    mode,
    prompt,
    code,
    issues,
    status: "sending",
  });

  try {
    const result = await commitFile(config, { path: jobName, content, message, sha, token });
    const commitLink = result.commitUrl || commitHtmlUrl(config, result.commitSha);
    await updatePromptResult(promptId, {
      commitSha: result.commitSha,
      commitUrl: commitLink,
      status: "pending",
    });
    await insertEvent({
      kind: "prompt",
      title:
        mode === "arena"
          ? "پرامپت اختصاصی برای Arena"
          : mode === "new"
            ? `پرامپت جدید برای ${jobName}`
            : `پرامپت افزودنی برای ${jobName}`,
      detail:
        mode === "arena"
          ? "متن داخل job_arena.py قرار گرفت؛ پنل ویندوز نسخه‌ی تازه را می‌گیرد، Arena را باز می‌کند و متن را تایپ و ارسال می‌کند."
          : mode === "new"
            ? "فایل تازه در مخزن همکار ساخته شد و در انتظار اجرا توسط پنل ویندوز است."
            : "متن پرامپت به فایل اضافه شد؛ نسخه‌ی تازه در انتظار اجراست.",
      jobName,
      url: commitLink,
    });
    await setJobChanged(jobName);
    await refreshSnapshot(config);
    return {
      promptId,
      jobName,
      mode,
      commitSha: result.commitSha,
      commitUrl: commitLink,
      message,
      commitLink,
      issues,
    };
  } catch (err) {
    const text = err instanceof Error ? err.message : "خطای ناشناخته";
    await updatePromptResult(promptId, { status: "failed", error: text }).catch(() => undefined);
    throw err;
  }
}

export async function validateCode(name: string, code: string) {
  const result = lintPython(code, { name, strict: true });
  return { ...result, nameIssues: validateJobName(name) };
}

/** برای بررسی سریع دسترسی به مخزن (در تنظیمات) */
export async function repoReachable(config: RepoConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(zipUrl(config), {
      method: "GET",
      headers: { Range: "bytes=0-1023", "User-Agent": "windows-agent-management" },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok || res.status === 206) return { ok: true, message: "مخزن در دسترس است." };
    return { ok: false, message: `گیت‌هاب پاسخ ${res.status} داد.` };
  } catch {
    return { ok: false, message: "ارتباط با گیت‌هاب برقرار نشد." };
  }
}
