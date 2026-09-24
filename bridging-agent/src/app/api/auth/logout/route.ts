import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/engine/db/client";
import { endSession } from "@/engine/auth";
import { SESSION_COOKIE } from "@/app/lib/server";

export async function POST(req: Request) {
  const jar = await cookies();
  await endSession(await getDb(), jar.get(SESSION_COOKIE)?.value);
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
