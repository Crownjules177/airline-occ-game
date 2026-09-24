import { call, getCtx } from "../lib/server";
import { NewSpaceForm } from "./form";

export default async function NewSpace() {
  const ctx = await getCtx();
  const templates = await call<any[]>("list_templates");
  return (
    <>
      <h1>Start a space</h1>
      <p className="muted">
        You'll be the host: you invite people, release the agent's proposals to the group, and can see everything the agent
        does. You'll also take part yourself.
      </p>
      <NewSpaceForm templates={templates} signedIn={!!ctx.accountId} />
    </>
  );
}
