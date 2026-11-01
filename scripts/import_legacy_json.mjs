#!/usr/bin/env node
/** Import the portable D1 JSON into an already-migrated PostgreSQL database. */
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const TABLES = [
  "settings", "jobs", "runs", "error_logs", "prompts", "events", "sync_state", "drive_files",
  "agent_keys", "managed_agents", "agent_control_requests", "agent_connection_tests", "commands",
  "command_events", "command_artifacts", "screenshots", "automations", "automation_versions", "automation_runs",
];
const SERIAL_TABLES = new Set(["runs", "error_logs", "prompts", "events", "command_events"]);
const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/import_legacy_json.mjs /safe/path/legacy-d1.json");
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(2);
}

const data = JSON.parse(await readFile(input, "utf8"));
const prisma = new PrismaClient();
let imported = 0;
try {
  for (const table of TABLES) {
    const rows = Array.isArray(data[table]) ? data[table] : [];
    for (let offset = 0; offset < rows.length; offset += 50) {
      const chunk = rows.slice(offset, offset + 50).map((row) => {
        const columns = Object.keys(row);
        if (!columns.length || columns.some((column) => !/^[a-z_][a-z0-9_]*$/.test(column))) {
          throw new Error(`Invalid column in ${table}`);
        }
        const names = columns.map((column) => `"${column}"`).join(",");
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(",");
        return prisma.$executeRawUnsafe(
          `INSERT INTO "${table}" (${names}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          ...columns.map((column) => row[column]),
        );
      });
      const counts = await prisma.$transaction(chunk);
      imported += counts.reduce((sum, count) => sum + count, 0);
    }
    console.log(`${table}: ${rows.length} source rows checked`);
  }

  for (const table of SERIAL_TABLES) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM "${table}"`,
    );
  }
  console.log(`Import finished: ${imported} new rows inserted.`);
} finally {
  await prisma.$disconnect();
}
