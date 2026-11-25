import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/engine/db/client";
import { accountForSession, endOtherSessions } from "@/engine/auth";
import { SESSION_COOKIE } from "@/app/lib/server";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const db = await getDb();
  const accountId = await accountForSession(db, token);
  if (!accountId || !token) return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  const { ended } = await endOtherSessions(db, accountId, token);
  return NextResponse.json({ ok: true, ended });
}
