import { NextResponse } from "next/server";
import { getDb } from "@/engine/db/client";
import { requestEmailLink } from "@/engine/auth";
import { appUrl } from "@/app/lib/server";

export async function POST(req: Request) {
  const { email, next } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Enter your email address." }, { status: 400 });
  }
  const { devLink, emailEnabled } = await requestEmailLink(await getDb(), { email, appUrl: appUrl(), redirectTo: next });
  return NextResponse.json({ ok: true, devLink, emailEnabled });
}
