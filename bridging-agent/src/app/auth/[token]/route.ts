import { NextResponse } from "next/server";
import { getDb } from "@/engine/db/client";
import { consumeLinkToken } from "@/engine/auth";
import { SESSION_COOKIE, sessionCookieOptions } from "@/app/lib/server";

/** Magic-link landing: exchange the token for a session cookie, then continue. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await consumeLinkToken(await getDb(), token);
  if (!result) return NextResponse.redirect(new URL("/login?expired=1", req.url));
  const res = NextResponse.redirect(new URL(result.redirectTo, req.url));
  res.cookies.set(SESSION_COOKIE, result.sessionToken, sessionCookieOptions);
  return res;
}
