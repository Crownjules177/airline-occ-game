import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/engine/db/client";
import { accessStatus } from "@/engine/access";
import { ACCESS_COOKIE, SESSION_COOKIE, sessionCookieOptions } from "@/app/lib/server";

/** Polled by the waiting page. Once the host approves, this device is signed in (once). */
export async function GET() {
  const jar = await cookies();
  const r = await accessStatus(await getDb(), jar.get(ACCESS_COOKIE)?.value);
  if (r.status !== "approved") {
    const res = NextResponse.json({ ok: true, status: r.status });
    if (r.status !== "pending") res.cookies.delete(ACCESS_COOKIE);
    return res;
  }
  const res = NextResponse.json({ ok: true, status: "approved", redirect: `/s/${r.spaceId}/me?back=1` });
  res.cookies.set(SESSION_COOKIE, r.sessionToken, sessionCookieOptions);
  res.cookies.delete(ACCESS_COOKIE);
  return res;
}
