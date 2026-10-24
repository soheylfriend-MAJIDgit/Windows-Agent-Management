import { api, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getErrorsReport, getRunsReport } from "@/lib/service";
import { daysAgoDate, jalaliDayRange, tehranStartOfDay } from "@/lib/jalali";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return api(async () => {
    await requireAuth();
    const params = new URL(req.url).searchParams;
    const type = params.get("type") === "errors" ? "errors" : "results";
    const range = params.get("range") ?? "all";
    const date = params.get("date")?.trim() || null;
    const q = params.get("q")?.trim() || undefined;
    const status = params.get("status") ?? "all";

    let from: string | undefined;
    let to: string | undefined;
    if (date) {
      // فیلتر یک روز مشخص جلالی (ساعت تهران)
      const day = jalaliDayRange(date);
      if (!day) {
        return jsonOk({ type, runs: [], errors: [], total: 0, range: "custom", invalidDate: true });
      }
      from = day.from;
      to = day.to;
    } else if (range === "today") {
      from = tehranStartOfDay().toISOString();
    } else if (range === "7") {
      from = daysAgoDate(7).toISOString();
    } else if (range === "30") {
      from = daysAgoDate(30).toISOString();
    }

    const effectiveRange = date ? "custom" : range;
    if (type === "errors") {
      return jsonOk({ type, ...(await getErrorsReport({ q, from, to })), range: effectiveRange });
    }
    return jsonOk({ type, ...(await getRunsReport({ q, from, to, status })), range: effectiveRange });
  });
}
