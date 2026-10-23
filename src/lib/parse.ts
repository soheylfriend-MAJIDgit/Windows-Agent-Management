import { MAX_STORED_OUTPUT } from "./config";
import { sha256Hex } from "./crypto";
import { parseJalaliDateTime, toLatinDigits } from "./jalali";
import type { RunStatus } from "./types";

export interface ParsedResult {
  jobName: string;
  status: RunStatus;
  exitCode: string | null;
  startedAt: string;
  startedJalali: string | null;
  durationSeconds: number | null;
  output: string;
  errors: string;
  raw: string;
}

const clip = (text: string, max = MAX_STORED_OUTPUT): string =>
  text.length > max ? `${text.slice(0, max)}\n… (خروجی بریده شد)` : text;

function clean(value: string | undefined | null): string {
  return (value ?? "").replace(/\r\n/g, "\n").replace(/\u200f|\u200e/g, "").trim();
}

/** بخش‌های خالی پنل ویندوز با «(خالی)» پر می‌شوند؛ در نمایش خالی حساب می‌شوند. */
function cleanSection(value: string | undefined | null): string {
  const text = clean(value);
  return /^\((?:خالی|empty)\)$/i.test(text) ? "" : text;
}

/** پارس فایل نتیجه‌ی پنل ویندوز (`logs/<job>_result.txt`). */
export function parseResultFile(fileName: string, content: string, modifiedAt?: string | null): ParsedResult {
  const raw = content.replace(/\r\n/g, "\n");
  const rawLines = raw.split("\n");

  const fileMatch = raw.match(/فایل\s*:\s*([^\s\n]+)/);
  let jobName = fileMatch?.[1]?.trim() ?? "";
  if (!jobName) {
    const stem = fileName.replace(/\.txt$/i, "").replace(/_result$/i, "");
    jobName = stem ? (stem.endsWith(".py") ? stem : `${stem}.py`) : "نامشخص.py";
  }

  const exitMatch = raw.match(/کد\s*خروج\s*:\s*([^\n]+)/);
  const exitCode = exitMatch ? clean(exitMatch[1]) : null;
  const exitLatin = exitCode ? toLatinDigits(exitCode).trim() : "";

  let status: RunStatus = "error";
  if (exitLatin === "0" || exitLatin === "00") status = "success";
  if (/timeout|TIMEOUT|زمان اجرا/.test(exitLatin) || /بیش از ۶?۰۰? ثانیه|بیش از 600 ثانیه|TimeoutExpired/i.test(raw)) {
    status = "timeout";
  }

  const startedMatch = raw.match(/شروع\s*:\s*([^\n]+)/);
  const startedJalali = startedMatch ? clean(startedMatch[1]) : null;
  const parsedStart = parseJalaliDateTime(startedJalali);
  const startedAt = (parsedStart ?? (modifiedAt ? new Date(modifiedAt) : new Date())).toISOString();

  const durationMatch = raw.match(/مدت\s*:\s*([\d۰-۹.,]+)/);
  const durationSeconds = durationMatch
    ? Number(toLatinDigits(durationMatch[1]).replace(",", "."))
    : null;

  const outMarker = raw.search(/^-{3,}\s*خروجی\s*-{3,}\s*$/m);
  const errMarker = raw.search(/^-{3,}\s*خطاها?\s*-{3,}\s*$/m);

  let output = "";
  let errors = "";
  if (outMarker >= 0) {
    const outStart = raw.indexOf("\n", outMarker);
    const outEnd = errMarker > outMarker ? errMarker : raw.length;
    output = cleanSection(raw.slice(outStart + 1, outEnd));
  }
  if (errMarker >= 0) {
    const errStart = raw.indexOf("\n", errMarker);
    errors = cleanSection(raw.slice(errStart + 1));
  }

  if (!output && outMarker < 0) {
    // فایل‌های قدیمی یا دستی: هر چیزی بعد از سرصفحه
    const headerEnd = rawLines.findIndex((l) => /^={3,}$/.test(l.trim()));
    if (headerEnd >= 0) output = cleanSection(rawLines.slice(headerEnd + 1).join("\n"));
  }

  if (!exitCode) {
    // اگر کد خروج نبود، از وجود stderr و نشانه‌ها حدس می‌زنیم
    status = errors ? "error" : "success";
  }

  return {
    jobName,
    status,
    exitCode: exitCode || null,
    startedAt,
    startedJalali,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    output: clip(output),
    errors: clip(errors),
    raw: clip(raw),
  };
}

export interface ParsedErrorBlock {
  fileName: string;
  occurredAt: string | null;
  occurredJalali: string | null;
  subject: string;
  appVersion: string | null;
  detail: string;
  raw: string;
  fingerprint: string;
}

/** پارس فایل‌های `logs/errors/errors_*.txt` (بلوک‌های جدا با ۶۲ مساوی). */
export async function parseErrorFile(fileName: string, content: string): Promise<ParsedErrorBlock[]> {
  const text = content.replace(/\r\n/g, "\n");
  const chunks = text
    .split(/^\s*={5,}\s*$/m)
    .map((c) => c.trim())
    .filter(Boolean);

  const results: ParsedErrorBlock[] = [];
  for (const chunk of chunks) {
    if (!/موضوع\s*:/.test(chunk) && !/زمان\s*:/.test(chunk)) continue;
    const timeMatch = chunk.match(/زمان\s*:\s*([^\n]+)/);
    const subjectMatch = chunk.match(/موضوع\s*:\s*([^\n]+)/);
    const versionMatch = chunk.match(/نسخه\s*برنامه\s*:\s*([^\n]+)/);
    const occurredJalali = timeMatch ? clean(timeMatch[1]) : null;

    const consumed = new Set<number>();
    const lines = chunk.split("\n");
    lines.forEach((line, idx) => {
      if (/^(زمان|موضوع|نسخه\s*برنامه)\s*:/.test(line)) consumed.add(idx);
    });
    const detail = lines
      .map((line, idx) => (consumed.has(idx) ? null : line))
      .filter((line): line is string => line !== null)
      .join("\n")
      .trim();

    const rawBlock = `==============================================================\n${chunk}\n`;
    results.push({
      fileName,
      occurredAt: parseJalaliDateTime(occurredJalali)?.toISOString() ?? null,
      occurredJalali,
      subject: subjectMatch ? clean(subjectMatch[1]) : "خطای بدون موضوع",
      appVersion: versionMatch ? clean(versionMatch[1]) : null,
      detail: clip(detail, 20_000),
      raw: clip(rawBlock, 20_000),
      fingerprint: await sha256Hex(`${fileName}\n${chunk}`),
    });
  }
  return results;
}

/** تشخیص نوع فایل دستی بر اساس نام و محتوا */
export function detectFileKind(fileName: string, content: string): "result" | "error" {
  if (/^errors?_/i.test(fileName)) return "error";
  if (/_result\.txt$/i.test(fileName)) return "result";
  if (/موضوع\s*:/.test(content) && /نسخه\s*برنامه\s*:/.test(content)) return "error";
  return "result";
}

export function jobNameFromResultFileName(fileName: string): string {
  const stem = fileName.replace(/\.txt$/i, "").replace(/_result$/i, "");
  return stem.endsWith(".py") ? stem : `${stem}.py`;
}
