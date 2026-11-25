import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ToolError } from "@/engine/context";
import { whatsappShareUrl } from "@/engine/notify";
import { ACCESS_COOKIE, appUrl, call } from "../../../lib/server";
import { Waiting } from "./waiting";

export default async function WaitingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!(await cookies()).get(ACCESS_COOKIE)) redirect(`/join/${code}?back=1`);
  let invite: any;
  try {
    invite = await call("get_invite", { inviteCode: code });
  } catch (e) {
    if (e instanceof ToolError) return <p className="error">{e.message}</p>;
    throw e;
  }
  const host = invite.hostName || "the host";
  const nudge = whatsappShareUrl(
    `Hi ${invite.hostName || ""}, I've asked to get back into "${invite.spaceName}". Could you approve it on the Host page? ${appUrl()}/s/${invite.spaceId}/host`.replace("Hi ,", "Hi,"),
  );
  return (
    <>
      <h1>Waiting for {host}</h1>
      <Waiting code={code} host={host} nudge={nudge} />
    </>
  );
}
