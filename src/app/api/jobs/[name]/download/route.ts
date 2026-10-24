import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getJobDetail } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  return api(async () => {
    await requireAuth();
    const { name } = await params;
    const detail = await getJobDetail(name);
    return new Response(detail.content, {
      headers: {
        "Content-Type": "text/x-python; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
