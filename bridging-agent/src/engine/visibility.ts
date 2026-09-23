import type { Participant, Profile, ProfileFields } from "./db/schema";
import type { Template, Visibility } from "./template";

/**
 * Visibility is enforced here, on the server, for every read. It never depends on a prompt.
 *
 *   owner      sees every field of their own profile, including agent-only ones
 *   host       sees `group` and `host` fields of approved profiles
 *   others     see `group` fields of approved profiles
 *   agent-only fields are never shown to anyone but the owner
 */
export type Viewer = { participantId: string; isHost: boolean };

export function canSee(viewer: Viewer, owner: Participant, visibility: Visibility): boolean {
  if (viewer.participantId === owner.id) return true;
  if (visibility === "group") return true;
  if (visibility === "host") return viewer.isHost;
  return false;
}

export type VisibleProfile = {
  participantId: string;
  displayName: string;
  status: Profile["status"];
  summary: string | null;
  fields: { key: string; label: string; value: ProfileFields[string]["value"]; visibility: Visibility }[];
};

export function visibleProfile(
  viewer: Viewer,
  owner: Participant,
  profile: Profile | undefined,
  template: Template,
): VisibleProfile {
  const own = viewer.participantId === owner.id;
  if (!profile || (!own && profile.status !== "approved")) {
    return { participantId: owner.id, displayName: owner.displayName, status: profile?.status ?? "draft", summary: null, fields: [] };
  }
  return {
    participantId: owner.id,
    displayName: owner.displayName,
    status: profile.status,
    summary: profile.summary,
    fields: template.profileFields
      .filter((f) => profile.fields[f.key] && canSee(viewer, owner, profile.fields[f.key].visibility))
      .map((f) => ({ key: f.key, label: f.label, ...profile.fields[f.key] })),
  };
}
