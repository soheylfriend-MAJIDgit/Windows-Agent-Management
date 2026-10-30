import { AppError } from "./errors";
import { getSetting, setSetting } from "./store";

const SETTING_KEY = "service.arena.saved-targets.v1";
const MAX_TARGETS = 50;

export interface ArenaSavedTarget {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

function safeHttpsUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 2048) {
    throw new AppError("لینک صفحه مدل معتبر نیست.", { status: 422, code: "arena_target_url_invalid" });
  }
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new AppError("لینک صفحه مدل معتبر نیست.", { status: 422, code: "arena_target_url_invalid" });
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new AppError("فقط لینک HTTPS بدون نام کاربری و رمز قابل ذخیره است.", { status: 422, code: "arena_target_url_unsafe" });
  }
  return parsed.toString();
}

function safeName(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.trim().length > 80) {
    throw new AppError("نام صفحه باید حداکثر ۸۰ نویسه باشد.", { status: 422, code: "arena_target_name_invalid" });
  }
  return value.trim();
}

function parseTargets(raw: string | null): ArenaSavedTarget[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is ArenaSavedTarget => Boolean(
        item && typeof item === "object"
        && typeof (item as ArenaSavedTarget).id === "string"
        && typeof (item as ArenaSavedTarget).name === "string"
        && typeof (item as ArenaSavedTarget).url === "string"
        && typeof (item as ArenaSavedTarget).createdAt === "string"
        && typeof (item as ArenaSavedTarget).updatedAt === "string",
      ))
      .slice(0, MAX_TARGETS);
  } catch {
    return [];
  }
}

export async function listArenaSavedTargets(): Promise<ArenaSavedTarget[]> {
  const targets = parseTargets(await getSetting(SETTING_KEY));
  return targets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveArenaTarget(input: { name?: unknown; url?: unknown }): Promise<ArenaSavedTarget[]> {
  const url = safeHttpsUrl(input.url);
  const name = safeName(input.name);
  const now = new Date().toISOString();
  const targets = await listArenaSavedTargets();
  const existing = targets.find((target) => target.url === url);
  if (existing) {
    existing.name = name;
    existing.updatedAt = now;
  } else {
    targets.unshift({
      id: `target_${crypto.randomUUID().replace(/-/g, "")}`,
      name,
      url,
      createdAt: now,
      updatedAt: now,
    });
  }
  const trimmed = targets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_TARGETS);
  await setSetting(SETTING_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export async function deleteArenaTarget(idValue: unknown): Promise<ArenaSavedTarget[]> {
  if (typeof idValue !== "string" || !/^target_[a-f0-9]{32}$/.test(idValue)) {
    throw new AppError("شناسه صفحه ذخیره‌شده معتبر نیست.", { status: 422, code: "arena_target_id_invalid" });
  }
  const targets = await listArenaSavedTargets();
  const next = targets.filter((target) => target.id !== idValue);
  if (next.length === targets.length) {
    throw new AppError("صفحه ذخیره‌شده پیدا نشد.", { status: 404, code: "arena_target_not_found" });
  }
  await setSetting(SETTING_KEY, JSON.stringify(next));
  return next;
}
