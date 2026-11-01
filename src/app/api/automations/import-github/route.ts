import { api, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { saveAutomationVersion } from "@/lib/automations";
import { getRepoConfig } from "@/lib/config";
import { fetchArchive } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function POST() {
  return api(async () => {
    await requireAuth();
    const config = await getRepoConfig("collab", false);
    const archive = await fetchArchive(config, { force: true });
    const jobs = archive.files.filter((file) => !file.tooLarge).slice(0, 100);
    const imported: Array<{ name: string; automationId: string; version: number }> = [];
    const failed: Array<{ name: string; error: string }> = [];
    for (const file of jobs) {
      try {
        const saved = await saveAutomationVersion({
          slug: file.name,
          name: file.name.replace(/^job_/, "").replace(/\.py$/, "").replace(/_/g, " "),
          description: "انتقال اولیه از مخزن ایجنت همکار",
          target: "windows",
          sourceCode: file.content,
          changeSummary: `انتقال اولیه از codeload GitHub · ${file.sha.slice(0, 12)}`,
          actor: "manager:github_import",
          activate: true,
        });
        imported.push({ name: file.name, automationId: saved.automation.id, version: saved.version.version });
      } catch (error) {
        failed.push({ name: file.name, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return jsonOk({
      imported,
      failed,
      sourceOfTruth: "postgresql",
      readTransport: "codeload_zip",
      githubTokenRequired: false,
      archiveFetchedAt: archive.fetchedAt,
    });
  });
}
