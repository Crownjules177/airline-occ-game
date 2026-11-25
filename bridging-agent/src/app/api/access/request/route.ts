import { NextResponse } from "next/server";
import { getDb } from "@/engine/db/client";
import { requestAccess } from "@/engine/access";
import { ToolError } from "@/engine/context";
import { ACCESS_COOKIE, accessCookieOptions } from "@/app/lib/server";

/** A household without email asks the host to let this device back in. */
export async function POST(req: Request) {
  const { inviteCode, participantId } = await req.json().catch(() => ({}));
  if (typeof inviteCode !== "string" || typeof participantId !== "string") {
    return NextResponse.json({ ok: false, error: "Pick your household first." }, { status: 400 });
  }
  try {
    const r = await requestAccess(await getDb(), { inviteCode, participantId });
    const res = NextResponse.json({ ok: true, householdName: r.householdName });
    // The secret never leaves this device, so only the device that asked can be let in.
    res.cookies.set(ACCESS_COOKIE, r.token, accessCookieOptions);
    return res;
  } catch (e) {
    if (e instanceof ToolError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
