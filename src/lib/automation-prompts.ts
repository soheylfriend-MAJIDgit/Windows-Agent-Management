import { AppError } from "./errors";
import { ARENA_JOB_NAME, buildArenaJobFile, type TelegramReportMode } from "./arena-job";
import { buildAppendBlock, buildNewJobFile, type PromptInput, type PromptResult } from "./actions";
import { getAutomation, normalizeAutomationSlug, requestAutomationRun, saveAutomationVersion } from "./automations";
import { insertEvent, insertPrompt, updatePromptResult } from "./store";
import type { Issue, PromptMode } from "./types";

function marker(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (item) => item.toString(16).padStart(2, "0")).join("");
}

async function existingSource(slug: string): Promise<{ id: string; source: string }> {
  try {
    const detail = await getAutomation(slug, true);
    if (!detail.activeVersion?.sourceCode) throw new Error("missing active source");
    return { id: detail.automation.id, source: detail.activeVersion.sourceCode };
  } catch (error) {
    if (error instanceof AppError && error.status === 404) {
      throw new AppError("این کد هنوز به کاتالوگ اتوماسیون D1 منتقل نشده است.", {
        status: 409,
        code: "automation_not_migrated",
        hint: "در تب «کدهای اتوماسیون» یک‌بار «انتقال اولیه از GitHub» را اجرا کنید یا کد را مستقیم در D1 بسازید.",
      });
    }
    throw error;
  }
}

export async function submitAutomationPrompt(input: PromptInput): Promise<PromptResult & { automationId: string; versionId: string; version: number; storage: "d1" }> {
  const prompt = (input.prompt ?? "").trim();
  if (prompt.length < 8 || prompt.length > 8000) {
    throw new AppError("متن پرامپت باید بین ۸ تا ۸۰۰۰ نویسه باشد.", { status: 422, code: "prompt_length_invalid" });
  }
  const mode: PromptMode = input.mode === "arena" ? "arena" : input.mode === "append" ? "append" : "new";
  let slug: string;
  let source: string;
  let automationId: string | undefined;
  let issues: Issue[] = [];

  if (mode === "arena") {
    slug = normalizeAutomationSlug(ARENA_JOB_NAME);
    const existing = await existingSource(slug);
    automationId = existing.id;
    const telegramMode: TelegramReportMode = input.telegramMode === "off" || input.telegramMode === "start_final" ? input.telegramMode : "final";
    source = buildArenaJobFile({
      source: existing.source,
      prompt,
      telegramMode,
      requestId: `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${marker()}`,
    });
  } else if (mode === "append") {
    slug = normalizeAutomationSlug(input.jobName);
    const existing = await existingSource(slug);
    automationId = existing.id;
    source = existing.source + buildAppendBlock(prompt);
  } else {
    slug = normalizeAutomationSlug(input.slug || input.jobName || prompt.slice(0, 24));
    if (input.code?.trim()) source = buildNewJobFile({ name: `job_${slug}.py`, prompt, code: input.code.trim() });
    else source = buildNewJobFile({ name: `job_${slug}.py`, prompt, code: null });
  }

  if (input.dryRun) {
    return {
      promptId: 0,
      automationId: automationId ?? "",
      versionId: "",
      version: 0,
      storage: "d1",
      jobName: `job_${slug}.py`,
      mode,
      commitSha: "",
      commitUrl: "",
      commitLink: "",
      commandId: undefined,
      message: "پیش‌نمایش نسخه D1",
      issues,
      dryRun: true,
      content: source,
    };
  }

  const promptId = await insertPrompt({ jobName: `job_${slug}.py`, mode, prompt, code: input.code?.trim() || null, issues, status: "sending" });
  try {
    const saved = await saveAutomationVersion({
      automationId,
      slug,
      name: mode === "arena" ? "ارسال پرامپت به Arena" : slug.replace(/_/g, " "),
      description: mode === "arena" ? "اتوماسیون اختصاصی ارسال مرحله‌ای پرامپت به Arena" : undefined,
      target: "windows",
      sourceCode: source,
      changeSummary: mode === "arena" ? "پرامپت تازه Arena" : mode === "append" ? "افزودن دستور تازه" : "ساخت از فرم پرامپت",
      actor: "manager:prompt",
      activate: true,
    });
    const run = await requestAutomationRun(saved.automation.id, "manager:prompt");
    await updatePromptResult(promptId, { commitSha: saved.version.sourceSha256, commitUrl: null, status: "pending" });
    await insertEvent({
      kind: "automation_prompt",
      title: mode === "arena" ? "پرامپت Arena در D1 ثبت شد" : `نسخه تازه ${saved.automation.name}`,
      detail: `نسخه ${saved.version.version} منبع اصلی D1 · ${saved.version.sourceSha256.slice(0, 12)}`,
      jobName: `job_${slug}.py`,
    });
    return {
      promptId,
      automationId: saved.automation.id,
      versionId: saved.version.id,
      version: saved.version.version,
      storage: "d1",
      jobName: `job_${slug}.py`,
      mode,
      commitSha: saved.version.sourceSha256,
      commitUrl: "",
      commitLink: "",
      commandId: run.commandId,
      message: `نسخه ${saved.version.version} در D1 ثبت و برای ویندوز صف شد.`,
      issues,
    };
  } catch (error) {
    await updatePromptResult(promptId, { status: "failed", error: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
    throw error;
  }
}
