import Link from "next/link";
import { ToolError } from "@/engine/context";
import { call, getCtx } from "../../lib/server";
import { Tabs } from "./tabs";

export default async function SpaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const ctx = await getCtx();
  if (!ctx.accountId) {
    return (
      <div className="card stack">
        <p>Please sign in to see this space.</p>
        <Link className="btn primary" href={`/login?next=/s/${spaceId}`}>
          Sign in
        </Link>
      </div>
    );
  }
  let space: any;
  try {
    space = await call("get_space", { spaceId });
  } catch (e) {
    if (e instanceof ToolError) return <p className="error">{e.message}</p>;
    throw e;
  }
  const enabled = new Set(space.template.stages.filter((s: any) => s.enabled).map((s: any) => s.id));
  const tabs = [
    { href: `/s/${spaceId}`, label: "Home" },
    { href: `/s/${spaceId}/intake`, label: "Chat" },
    { href: `/s/${spaceId}/profile`, label: "My profile" },
    { href: `/s/${spaceId}/people`, label: "People" },
    enabled.has("map") && { href: `/s/${spaceId}/map`, label: "Map" },
    enabled.has("agree") && { href: `/s/${spaceId}/proposals`, label: "Proposals" },
    enabled.has("act") && { href: `/s/${spaceId}/plan`, label: "Plan" },
    space.me.isHost && { href: `/s/${spaceId}/host`, label: "Host" },
    { href: `/s/${spaceId}/me`, label: "My data" },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <>
      <p className="muted small" style={{ margin: 0 }}>
        {space.template.name}
      </p>
      <h1 style={{ marginTop: 2 }}>{space.space.name}</h1>
      <Tabs tabs={tabs} />
      {children}
    </>
  );
}
