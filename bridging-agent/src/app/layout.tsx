import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { getCtx } from "./lib/server";

export const metadata: Metadata = {
  title: "Bridging Agent",
  description: "Surface what each person wants and can offer, find agreement, and keep momentum without one person doing all the organising.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCtx();
  return (
    <html lang="en">
      <body>
        <header className="top">
          <Link href="/" className="brand">
            Bridging Agent
          </Link>
          {ctx.accountId ? (
            <form action="/api/auth/logout" method="post">
              <button className="small" type="submit">
                Sign out
              </button>
            </form>
          ) : (
            <Link href="/login" className="btn small">
              Sign in
            </Link>
          )}
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
