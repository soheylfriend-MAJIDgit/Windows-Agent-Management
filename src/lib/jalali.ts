/**
 * تاریخ جلالی و ساعت تهران.
 * - تبدیل گرگوری ↔ جلالی (الگوریتم jalaali-js)
 * - همه‌ی خروجی‌های نمایشی با رقم فارسی
 * - ساعت تهران ثابت UTC+03:30 (ایران از ۱۴۰۱ ساعت تابستانی ندارد)
 */

export const TEHRAN_OFFSET_MINUTES = 210;
const TEHRAN_OFFSET_MS = TEHRAN_OFFSET_MINUTES * 60 * 1000;

export const FA_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

export const FA_WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"] as const;

const div = (a: number, b: number): number => Math.trunc(a / b);
const mod = (a: number, b: number): number => a - Math.trunc(a / b) * b;

interface JalCal {
  leap: number;
  gy: number;
  march: number;
}

function jalCal(jy: number, withoutLeap = false): JalCal {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
  ];
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  if (jy < jp || jy >= breaks[bl - 1]) throw new Error(`سال جلالی نامعتبر: ${jy}`);

  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  let leap = 0;
  if (!withoutLeap) {
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
  }
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy, true);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

export function toJalali(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  const jdn = g2d(gy, gm, gd);
  const gYear = d2g(jdn).gy;
  let jy = gYear - 621;
  const r = jalCal(jy, false);
  const jdn1f = g2d(gYear, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export function toGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  return d2g(j2d(jy, jm, jd));
}

export function isJalaliLeapYear(jy: number): boolean {
  return jalCal(jy, false).leap === 0;
}

/** اجزای تاریخ/ساعت در منطقه‌ی تهران */
export function tehranParts(date: Date): {
  gy: number;
  gm: number;
  gd: number;
  hour: number;
  minute: number;
  second: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : 0;
  };
  return {
    gy: get("year"),
    gm: get("month"),
    gd: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

export function tehranJalaliParts(date: Date): { jy: number; jm: number; jd: number; hour: number; minute: number; second: number } {
  const p = tehranParts(date);
  const j = toJalali(p.gy, p.gm, p.gd);
  return { ...j, hour: p.hour, minute: p.minute, second: p.second };
}

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** ارقام لاتین/عربی را به فارسی تبدیل می‌کند (فقط برای نمایش) */
export function toPersianDigits(input: string | number): string {
  return String(input)
    .replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)])
    .replace(/[٠-٩]/g, (d) => FA_DIGITS[d.charCodeAt(0) - 0x0660]);
}

/** ارقام فارسی/عربی را به لاتین برمی‌گرداند (برای پردازش) */
export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export function faNumber(value: number | string, group = true): string {
  const n = typeof value === "number" ? value : Number(toLatinDigits(value).replace(/,/g, ""));
  if (!Number.isFinite(n)) return toPersianDigits(String(value));
  const text = group ? n.toLocaleString("en-US") : String(n);
  return toPersianDigits(text).replace(/,/g, "٬");
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** ۱۴۰۵/۰۸/۰۱ */
export function formatJalali(date: Date | string | number): string {
  const d = asDate(date);
  if (!d) return "—";
  const { jy, jm, jd } = tehranJalaliParts(d);
  return toPersianDigits(`${jy}/${pad2(jm)}/${pad2(jd)}`);
}

/** ۱ آبان ۱۴۰۵ */
export function formatJalaliLong(date: Date | string | number): string {
  const d = asDate(date);
  if (!d) return "—";
  const { jy, jm, jd } = tehranJalaliParts(d);
  return `${toPersianDigits(jd)} ${FA_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
}

/** ۲۳:۵۰:۱۲ */
export function formatTehranTime(date: Date | string | number): string {
  const d = asDate(date);
  if (!d) return "—";
  const p = tehranParts(d);
  return toPersianDigits(`${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`);
}

/** ۱ آبان ۱۴۰۵ — ۲۳:۵۰ */
export function formatJalaliDateTime(date: Date | string | number, withSeconds = false): string {
  const d = asDate(date);
  if (!d) return "—";
  const p = tehranParts(d);
  const time = toPersianDigits(
    `${pad2(p.hour)}:${pad2(p.minute)}${withSeconds ? `:${pad2(p.second)}` : ""}`,
  );
  return `${formatJalaliLong(d)} — ${time}`;
}

/** نام روز هفته‌ی تهران */
export function formatWeekday(date: Date | string | number): string {
  const d = asDate(date);
  if (!d) return "—";
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", weekday: "short" });
  const map: Record<string, string> = {
    Sun: "یکشنبه",
    Mon: "دوشنبه",
    Tue: "سه‌شنبه",
    Wed: "چهارشنبه",
    Thu: "پنجشنبه",
    Fri: "جمعه",
    Sat: "شنبه",
  };
  return map[fmt.format(d)] ?? "—";
}

/** فاصله‌ی خوانا: ۲ دقیقه پیش */
export function relativeFa(date: Date | string | number, now: Date = new Date()): string {
  const d = asDate(date);
  if (!d) return "—";
  const diff = Math.round((now.getTime() - d.getTime()) / 1000);
  if (diff < 0) return formatJalaliDateTime(d);
  if (diff < 45) return "همین حالا";
  if (diff < 90) return "۱ دقیقه پیش";
  if (diff < 3600) return `${toPersianDigits(Math.round(diff / 60))} دقیقه پیش`;
  if (diff < 7200) return "۱ ساعت پیش";
  if (diff < 86400) return `${toPersianDigits(Math.round(diff / 3600))} ساعت پیش`;
  if (diff < 172800) return "دیروز";
  if (diff < 604800) return `${toPersianDigits(Math.round(diff / 86400))} روز پیش`;
  return formatJalali(d);
}

/** ۱۴۰۵/۰۸/۰۱ — ۲۳:۵۰:۱۲ برای پیام کامیت */
export function jalaliStamp(date: Date = new Date()): string {
  const p = tehranParts(date);
  const j = toJalali(p.gy, p.gm, p.gd);
  return `${toPersianDigits(`${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`)} — ${toPersianDigits(
    `${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`,
  )}`;
}

/** 1405-08-01 (برای پارس نام فایل) */
export function jalaliFileDate(date: Date = new Date()): string {
  const { jy, jm, jd } = tehranJalaliParts(date);
  return `${jy}-${pad2(jm)}-${pad2(jd)}`;
}

/** ISO فعلی */
export function nowIso(): string {
  return new Date().toISOString();
}

export function asDate(value: Date | string | number | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** زمان حال تهران به شکل ISO (برای ذخیره؛ خود ISO همیشه UTC است) */
export function nowIsoTehran(): string {
  return new Date().toISOString();
}

const MONTH_LOOKUP = new Map<string, number>();
FA_MONTHS.forEach((m, i) => MONTH_LOOKUP.set(m, i + 1));
MONTH_LOOKUP.set("امرداد", 5);

/**
 * پارس تاریخ جلالی متنی (فایل نتیجه/خطا).
 * پشتیبانی: «2 آبان 1405 — 00:36:39»، «۱۴۰۵/۰۸/۰۲ ۰۰:۳۶:۳۹»، «1405-08-02 00-36-39»
 */
export function parseJalaliDateTime(input: string | null | undefined): Date | null {
  if (!input) return null;
  let text = toLatinDigits(String(input))
    .replace(/\u200c/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/تهران/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let jy: number | null = null;
  let jm: number | null = null;
  let jd: number | null = null;
  let hour = 0;
  let minute = 0;
  let second = 0;

  let rest = "";
  const long = text.match(/^(\d{1,2})\s+([^\d\s]+)\s+(\d{4})(.*)$/);
  const slash = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(.*)$/);
  if (long) {
    jd = Number(long[1]);
    jm = MONTH_LOOKUP.get(long[2].trim()) ?? null;
    jy = Number(long[3]);
    rest = long[4] ?? "";
  } else if (slash) {
    jy = Number(slash[1]);
    jm = Number(slash[2]);
    jd = Number(slash[3]);
    rest = slash[4] ?? "";
  } else {
    return null;
  }
  if (!jy || !jm || !jd) return null;

  const time = rest.match(/(\d{1,2})[:.-](\d{1,2})(?:[:.-](\d{1,2}))?/);
  if (time) {
    hour = Number(time[1]);
    minute = Number(time[2]);
    second = time[3] ? Number(time[3]) : 0;
  }
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  try {
    const g = toGregorian(jy, jm, jd);
    const utc = Date.UTC(g.gy, g.gm - 1, g.gd, hour, minute, second) - TEHRAN_OFFSET_MS;
    const d = new Date(utc);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** ابتدای امروز تهران به UTC */
export function tehranStartOfDay(date: Date = new Date()): Date {
  const p = tehranParts(date);
  return new Date(Date.UTC(p.gy, p.gm - 1, p.gd, 0, 0, 0) - TEHRAN_OFFSET_MS);
}

export function daysAgoDate(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - days * 86400_000);
}

/** ۳ روز مانده / ۲ روز پیش (برای تاریخ کامیت) */
export function humanAgeFa(date: Date | string | null | undefined): string {
  const d = asDate(date);
  if (!d) return "—";
  return relativeFa(d);
}

/** تعداد روزهای یک ماه جلالی */
export function jalaliMonthDays(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}

/**
 * بازه‌ی یک روز جلالی به وقت تهران را به ISO (UTC) برمی‌گرداند.
 * ورودی: «1405-08-02» یا «۱۴۰۵/۰۸/۰۲». خروجی: [شروع روز، شروع روز بعد).
 */
export function jalaliDayRange(input: string | null | undefined): { from: string; to: string } | null {
  if (!input) return null;
  const text = toLatinDigits(String(input)).replace(/[^0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const jy = Number(match[1]);
  const jm = Number(match[2]);
  const jd = Number(match[3]);
  if (jm < 1 || jm > 12 || jd < 1 || jd > jalaliMonthDays(jy, jm)) return null;
  try {
    const g = toGregorian(jy, jm, jd);
    const back = toJalali(g.gy, g.gm, g.gd);
    if (back.jy !== jy || back.jm !== jm || back.jd !== jd) return null;
    const start = Date.UTC(g.gy, g.gm - 1, g.gd, 0, 0, 0) - TEHRAN_OFFSET_MS;
    return { from: new Date(start).toISOString(), to: new Date(start + 86400_000).toISOString() };
  } catch {
    return null;
  }
}
