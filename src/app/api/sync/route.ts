import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { driveStatus, getDriveState, syncDrive } from "@/lib/drive";
import { getAutoSyncEnabled, getSyncLimit } from "@/lib/settings";
import { insertEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return api(async () => {
    await requireAuth();
    const status = await driveStatus();
    return jsonOk({
      configured: status.configured,
      auto: await getAutoSyncEnabled(),
      ...(await getDriveState()),
    });
  });
}

export async function POST(req: Request) {
  return api(async () => {
    await requireAuth();
    const status = await driveStatus();
    if (!status.configured) {
      return jsonOk({
        ok: false,
        configured: false,
        downloaded: 0,
        results: 0,
        errors: 0,
        skipped: 0,
        warnings: [],
        syncedAt: new Date().toISOString(),
        message: "همگام‌سازی درایو پیکربندی نشده است.",
      });
    }
    let body: { force?: boolean; limit?: number } = {};
    try {
      body = await readJson<{ force?: boolean; limit?: number }>(req);
    } catch {
      body = {};
    }
    const limit = body.limit ?? (await getSyncLimit());
    const result = await syncDrive({ force: Boolean(body.force), limit });
    if (result.downloaded > 0) {
      await insertEvent({
        kind: "sync",
        title: `همگام‌سازی گوگل درایو (${result.downloaded} فایل)`,
        detail: result.message,
      });
    }
    return jsonOk(result);
  });
}
