import { redirect } from "next/navigation";
import { ToolError } from "@/engine/context";
import { call, getCtx } from "../../lib/server";
import { JoinForm } from "./form";

export default async function Join({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ctx = await getCtx();
  let invite: any;
  try {
    invite = await call("get_invite", { inviteCode: code });
  } catch (e) {
    if (e instanceof ToolError) return <p className="error">{e.message}</p>;
    throw e;
  }
  if (invite.alreadyMember) redirect(`/s/${invite.spaceId}`);
  const household = invite.template.participantUnit === "household";
  return (
    <>
      <h1>{invite.spaceName}</h1>
      <p>
        {invite.hostName ? `${invite.hostName} invited you to join` : "You're invited to join"} a {invite.template.name.toLowerCase()}.{" "}
        {invite.template.description}
      </p>
      <div className="card stack small">
        <p>
          <strong>What happens next:</strong> a short chat (about 8 minutes) about what your {invite.template.unit} likes and
          can offer. You'll check and approve the summary before anyone else sees it.
        </p>
        {household && <p>One sign-in per household. Include everyone's needs, kids too.</p>}
      </div>
      <JoinForm code={code} household={household} signedIn={!!ctx.accountId} spaceId={invite.spaceId} />
    </>
  );
}
