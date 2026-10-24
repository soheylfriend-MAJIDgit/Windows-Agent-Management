import { api, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { saveAutomationVersion } from "@/lib/automations";
import { getRepoConfig } from "@/lib/config";
import { envVar } from "@/lib/db";
import { readRepoFile, requireGithubToken } from "@/lib/github";
import { getJobsData } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST() {
  return api(async () => {
    await requireAuth();
    const token = await requireGithubToken(await envVar("GITHUB_TOKEN"));
    const config = await getRepoConfig("collab", false);
    const data = await getJobsData({ force: true, enrich: false });
    const jobs = data.jobs.filter((job) => job.present).slice(0, 100);
    const imported: Array<{ name: string; automationId: string; version: number }> = [];
    const failed: Array<{ name: string; error: string }> = [];
    for (const job of jobs) {
      try {
        const file = await readRepoFile(config, job.name, token);
        if (!file) throw new Error("فایل خوانده نشد");
        const saved = await saveAutomationVersion({
          slug: job.name,
          name: job.name.replace(/^job_/, "").replace(/\.py$/, "").replace(/_/g, " "),
          description: "انتقال اولیه از مخزن قدیمی ایجنت همکار",
          target: "windows",
          sourceCode: file.content,
          changeSummary: `انتقال اولیه از GitHub · ${file.sha.slice(0, 12)}`,
          actor: "manager:github_import",
          activate: true,
        });
        imported.push({ name: job.name, automationId: saved.automation.id, version: saved.version.version });
      } catch (error) {
        failed.push({ name: job.name, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return jsonOk({ imported, failed, sourceOfTruth: "cloudflare_d1", githubRequiredAfterImport: false });
  });
}
