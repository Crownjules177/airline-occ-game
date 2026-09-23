import Link from "next/link";
import { call } from "../../../lib/server";
import { MyData } from "./my-data";

export default async function Me({ params, searchParams }: { params: Promise<{ spaceId: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { spaceId } = await params;
  const { welcome } = await searchParams;
  const space = await call("get_space", { spaceId });
  return (
    <>
      {welcome && (
        <div className="card accent stack">
          <h3>Welcome, {space.me.displayName}!</h3>
          <p>
            First, save your personal sign-in link so you can get back in on any device. The easiest way is to send it to
            yourself on WhatsApp.
          </p>
          <Link href={`/s/${spaceId}/intake`} className="btn">
            Skip for now and start the chat
          </Link>
        </div>
      )}
      <MyData spaceId={spaceId} isHost={space.me.isHost} welcome={!!welcome} />
    </>
  );
}
