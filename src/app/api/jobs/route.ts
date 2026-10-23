import { api, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getJobsData } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return api(async () => {
    await requireAuth();
    const params = new URL(req.url).searchParams;
    const force = params.get("refresh") === "1";
    const enrich = params.get("enrich") !== "0";
    const data = await getJobsData({ force, enrich });
    return jsonOk({
      jobs: data.jobs,
      archiveUpdatedAt: data.archiveUpdatedAt,
      fetchedAt: data.fetchedAt,
      stale: data.stale,
      githubError: data.githubError,
      repos: data.repos,
    });
  });
}
