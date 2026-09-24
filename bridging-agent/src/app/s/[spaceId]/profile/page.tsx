import Link from "next/link";
import { call } from "../../../lib/server";
import { ProfileEditor } from "./editor";

export default async function ProfilePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const data = await call("get_my_profile", { spaceId });
  if (!data.profile) {
    return (
      <div className="card stack">
        <p>Your profile is drafted from a short chat. Start there, and you'll review it here before anyone sees it.</p>
        <Link className="btn primary" href={`/s/${spaceId}/intake`}>
          Start the chat
        </Link>
      </div>
    );
  }
  return <ProfileEditor spaceId={spaceId} profile={data.profile} fields={data.fields} history={data.history} />;
}
