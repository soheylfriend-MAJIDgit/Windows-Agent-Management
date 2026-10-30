import { api, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { dbAll, dbFirst, ensureSchema, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const EXPECTED_TABLES = [
  ["settings", "تنظیمات"],
  ["jobs", "کدها"],
  ["runs", "اجراها"],
  ["error_logs", "خطاها"],
  ["prompts", "پرامپت‌ها"],
  ["events", "رویدادها"],
  ["sync_state", "وضعیت همگام‌سازی"],
  ["drive_files", "آرشیو میراثی Drive"],
  ["agent_keys", "کلیدهای ایجنت"],
  ["managed_agents", "ایجنت‌های متصل"],
  ["agent_control_requests", "کنترل‌های اضطراری ایجنت"],
  ["agent_connection_tests", "تست‌های اتصال"],
  ["commands", "فرمان‌های ویندوز"],
  ["command_events", "رخدادهای فرمان"],
  ["command_artifacts", "فراداده Artifactهای فرمان"],
  ["screenshots", "اسکرین‌شات‌های R2"],
  ["automations", "کدهای اتوماسیون"],
  ["automation_versions", "نسخه‌های اتوماسیون"],
  ["automation_runs", "اجرای اتوماسیون"],
] as const;

type CountRow = Record<(typeof EXPECTED_TABLES)[number][0], number>;

export async function GET() {
  return api(async () => {
    await requireAuth();
    const started = Date.now();

    // getDb وجود binding را ثابت می‌کند و ensureSchema آماده بودن تمام جدول‌ها را.
    await getDb();
    await ensureSchema();
    await dbFirst<{ ok: number }>("SELECT 1 AS ok");

    const objects = await dbAll<{ name: string; type: "table" | "index" }>(`
      SELECT name, type
      FROM sqlite_master
      WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%'
      ORDER BY type DESC, name ASC
    `);
    const counts = await dbFirst<CountRow>(`
      SELECT
        (SELECT COUNT(*) FROM settings) AS settings,
        (SELECT COUNT(*) FROM jobs) AS jobs,
        (SELECT COUNT(*) FROM runs) AS runs,
        (SELECT COUNT(*) FROM error_logs) AS error_logs,
        (SELECT COUNT(*) FROM prompts) AS prompts,
        (SELECT COUNT(*) FROM events) AS events,
        (SELECT COUNT(*) FROM sync_state) AS sync_state,
        (SELECT COUNT(*) FROM drive_files) AS drive_files,
        (SELECT COUNT(*) FROM agent_keys) AS agent_keys,
        (SELECT COUNT(*) FROM managed_agents) AS managed_agents,
        (SELECT COUNT(*) FROM agent_control_requests) AS agent_control_requests,
        (SELECT COUNT(*) FROM agent_connection_tests) AS agent_connection_tests,
        (SELECT COUNT(*) FROM commands) AS commands,
        (SELECT COUNT(*) FROM command_events) AS command_events,
        (SELECT COUNT(*) FROM command_artifacts) AS command_artifacts,
        (SELECT COUNT(*) FROM screenshots) AS screenshots,
        (SELECT COUNT(*) FROM automations) AS automations,
        (SELECT COUNT(*) FROM automation_versions) AS automation_versions,
        (SELECT COUNT(*) FROM automation_runs) AS automation_runs
    `);
    // D1 تعداد termهای compound SELECT را محدود می‌کند؛ timestampها جداگانه خوانده
    // و چون ISO/UTC هستند به‌صورت واژه‌نامه‌ای مقایسه می‌شوند.
    const activityQueries = [
      "SELECT MAX(updated_at) AS value FROM jobs",
      "SELECT MAX(created_at) AS value FROM runs",
      "SELECT MAX(created_at) AS value FROM error_logs",
      "SELECT MAX(created_at) AS value FROM prompts",
      "SELECT MAX(created_at) AS value FROM events",
      "SELECT MAX(updated_at) AS value FROM settings",
      "SELECT MAX(updated_at) AS value FROM sync_state",
      "SELECT MAX(synced_at) AS value FROM drive_files",
      "SELECT MAX(COALESCE(last_used_at, created_at)) AS value FROM agent_keys",
      "SELECT MAX(last_seen_at) AS value FROM managed_agents",
      "SELECT MAX(COALESCE(completed_at, delivered_at, created_at)) AS value FROM agent_control_requests",
      "SELECT MAX(COALESCE(responded_at, delivered_at, created_at)) AS value FROM agent_connection_tests",
      "SELECT MAX(COALESCE(completed_at, last_event_at, created_at)) AS value FROM commands",
      "SELECT MAX(created_at) AS value FROM command_events",
      "SELECT MAX(created_at) AS value FROM command_artifacts",
      "SELECT MAX(created_at) AS value FROM screenshots",
      "SELECT MAX(updated_at) AS value FROM automations",
      "SELECT MAX(created_at) AS value FROM automation_versions",
      "SELECT MAX(created_at) AS value FROM automation_runs",
    ];
    const activityRows = await Promise.all(
      activityQueries.map((query) => dbFirst<{ value: string | null }>(query)),
    );
    const latestActivityAt = activityRows
      .map((row) => row?.value)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

    const existing = new Set(objects.filter((item) => item.type === "table").map((item) => item.name));
    const tables = EXPECTED_TABLES.map(([name, label]) => ({
      name,
      label,
      ready: existing.has(name),
      rows: Number(counts?.[name] ?? 0),
    }));
    const totalRows = tables.reduce((sum, table) => sum + table.rows, 0);

    return jsonOk({
      connected: true,
      binding: "DB",
      engine: "Cloudflare D1 / SQLite",
      schemaVersion: 7,
      schemaReady: tables.every((table) => table.ready),
      tables,
      tableCount: tables.filter((table) => table.ready).length,
      indexCount: objects.filter((item) => item.type === "index").length,
      totalRows,
      latestActivityAt,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      note: "شناسه و اطلاعات ورود دیتابیس عمداً در مرورگر نمایش داده نمی‌شود.",
    });
  });
}
