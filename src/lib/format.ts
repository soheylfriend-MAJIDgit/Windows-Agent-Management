import { faNumber, toPersianDigits } from "./jalali";

export function faBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${faNumber(bytes)} بایت`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${toPersianDigits(kb.toFixed(kb < 10 ? 1 : 0))} کیلوبایت`;
  }
  return `${toPersianDigits((bytes / 1024 / 1024).toFixed(1))} مگابایت`;
}

export function faDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds < 1) return `${toPersianDigits(seconds.toFixed(1))} ثانیه`;
  if (seconds < 60) return `${toPersianDigits(String(Math.round(seconds)))} ثانیه`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${toPersianDigits(m)} دقیقه${s ? ` و ${toPersianDigits(s)} ثانیه` : ""}`;
  const h = Math.floor(m / 60);
  return `${toPersianDigits(h)} ساعت و ${toPersianDigits(m % 60)} دقیقه`;
}

export function faLines(lines: number | null | undefined): string {
  if (lines == null) return "—";
  return `${faNumber(lines)} خط`;
}

export function faCount(n: number | null | undefined): string {
  if (n == null) return "—";
  return faNumber(n);
}

export function truncate(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function firstLine(text: string | null | undefined): string {
  if (!text) return "";
  return text.split(/\r?\n/)[0].trim();
}

export function stripTrailing(text: string): string {
  return text.replace(/\s+$/g, "");
}

export function maskToken(token: string | null | undefined): string {
  if (!token) return "تنظیم نشده";
  if (token.length <= 8) return "تنظیم شده";
  return `تنظیم شده (${token.slice(0, 4)}…${token.slice(-4)})`;
}

export function safeJsonParse<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
