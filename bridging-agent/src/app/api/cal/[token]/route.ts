import { getDb } from "@/engine/db/client";
import { calendarFeed } from "@/engine/tools/plan";
import { appUrl } from "@/app/lib/server";

/**
 * Read-only calendar for one participant. Subscribe to it (webcal://) to get every claimed task,
 * or add ?c=<commitmentId> to download a single invite.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const only = new URL(req.url).searchParams.get("c") ?? undefined;
  const ics = await calendarFeed({ db: await getDb(), appUrl: appUrl(), now: new Date() }, token.replace(/\.ics$/, ""), only);
  if (!ics) return new Response("Not found", { status: 404 });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `${only ? "attachment" : "inline"}; filename="${only ? "invite" : "shared-meals"}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
