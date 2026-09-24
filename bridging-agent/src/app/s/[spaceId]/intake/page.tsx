import { call } from "../../../lib/server";
import { Chat } from "./chat";

export default async function Intake({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const intake = await call("get_intake", { spaceId });
  return <Chat spaceId={spaceId} initial={intake} />;
}
