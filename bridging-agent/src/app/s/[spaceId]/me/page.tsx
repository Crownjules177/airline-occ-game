import Link from "next/link";
import { call } from "../../../lib/server";
import { MyData } from "./my-data";
import { SignInSettings } from "./sign-in-settings";

export default async function Me({ params, searchParams }: { params: Promise<{ spaceId: string }>; searchParams: Promise<{ welcome?: string; back?: string }> }) {
  const { spaceId } = await params;
  const { welcome, back } = await searchParams;
  const [space, account] = await Promise.all([call("get_space", { spaceId }), call("get_my_account")]);
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
      {back && (
        <div className="card accent stack">
          <h3>You're back in, {space.me.displayName}</h3>
          <p>
            {account.email
              ? "Next time, use \"Email me a sign-in link\" and you won't need to wait for anyone."
              : account.emailEnabled
                ? "Add an email below and next time you can get a sign-in link yourself, without waiting for anyone."
                : "Save a personal sign-in link below so next time you can get straight back in."}
          </p>
          <Link href={`/s/${spaceId}`} className="btn">
            Go to the group
          </Link>
        </div>
      )}
      {space.me.hostLetInAt.length > 0 && (
        <p className="notice small">
          Your host let a device into {space.me.displayName} on{" "}
          {space.me.hostLetInAt.map((d: string) => new Date(d).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: space.space.settings.timezone })).join(", ")}.
          If that wasn't you, use <strong>Sign out other devices</strong> below.
        </p>
      )}
      <MyData spaceId={spaceId} isHost={space.me.isHost} welcome={!!welcome}>
        <SignInSettings email={account.email} emailEnabled={account.emailEnabled} />
      </MyData>
    </>
  );
}
