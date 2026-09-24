import { NextResponse } from "next/server";
import { callTool } from "@/engine/tools";
import { ToolError } from "@/engine/context";
import { createSession } from "@/engine/auth";
import { getCtx, SESSION_COOKIE, sessionCookieOptions } from "@/app/lib/server";

// Map and proposal drafting can take a minute or more at high effort.
export const maxDuration = 300;

/** The web app's only write path into the engine: POST /api/tools/<name> with a JSON body. */
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const ctx = await getCtx();
  try {
    const input = await req.json().catch(() => ({}));
    const result = (await callTool(ctx, name, input)) as Record<string, unknown>;
    const res = NextResponse.json({ ok: true, result });
    // Joining or creating a space without an account creates one and signs it in.
    if (result && typeof result === "object" && result.newAccount && typeof result.accountId === "string") {
      res.cookies.set(SESSION_COOKIE, await createSession(ctx.db, result.accountId), sessionCookieOptions);
    }
    return res;
  } catch (e) {
    if (e instanceof ToolError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error(`Tool ${name} failed`, e);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
