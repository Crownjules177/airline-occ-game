import { describe, expect, it } from "vitest";
import { mealSpace, runIntake, answers, setup } from "./helpers";

describe("the circle", () => {
  it("shows each household with its people, shared highlights and threads", async () => {
    const h = await setup();
    const { spaceId, accounts } = await mealSpace(h);
    const circle = await h.as(accounts.Smith).call("get_circle", { spaceId });

    expect(circle.households.map((x: any) => x.name)).toEqual(["Nguyen", "Patel", "Okafor", "Smith", "Haddad"]);
    const nguyen = circle.households.find((x: any) => x.name === "Nguyen");
    expect(nguyen).toMatchObject({ members: ["Ken", "Kate", "Maise", "Ollie"], size: 4, joined: true, isMe: false, hue: 0 });
    expect(nguyen.highlights).toEqual(
      expect.arrayContaining([
        { label: "Loves", values: ["Vietnamese", "Italian", "dumplings"] },
        { label: "Likes making", values: ["Main", "Dessert"] },
      ]),
    );
    expect(circle.households.find((x: any) => x.name === "Smith").isMe).toBe(true);
    expect(circle.households.find((x: any) => x.name === "Okafor").members).toEqual(["Chidi", "Ada", "Tobi", "Ife", "Kemi"]);

    // Both love Italian; one loves dumplings and the other wants to learn them.
    const ids = Object.fromEntries(circle.households.map((x: any) => [x.name, x.id]));
    const pair = (a: string, b: string) =>
      circle.threads.find((t: any) => (t.a === ids[a] && t.b === ids[b]) || (t.a === ids[b] && t.b === ids[a]));
    expect(pair("Nguyen", "Smith").shared).toContainEqual({ value: "Italian", a: "Loves", b: "Loves" });
    expect(pair("Nguyen", "Patel").shared).toContainEqual({ value: "dumplings", a: "Loves", b: "Wants to learn" });
  });

  it("only ever uses answers shared with the whole group, even for the host and yourself", async () => {
    const h = await setup();
    const { spaceId, accounts } = await mealSpace(h);
    const patel = h.as(accounts.Patel);
    // Patel keeps their names and cuisines to the host only.
    await patel.call("update_my_profile", {
      spaceId,
      fields: { household_members: { visibility: "host" }, cuisines_loved: { visibility: "host" } },
    });
    for (const viewer of [accounts.Patel, accounts.Nguyen /* host */, accounts.Smith]) {
      const circle = await h.as(viewer).call("get_circle", { spaceId });
      const p = circle.households.find((x: any) => x.name === "Patel");
      expect(p.members).toEqual([]);
      expect(p.size).toBe(3); // still drawn with the right number of people
      expect(p.highlights.map((x: any) => x.label)).not.toContain("Loves");
      expect(JSON.stringify(circle.threads)).not.toContain("Indian");
      // Allergies and dates never appear anywhere in the circle.
      expect(JSON.stringify(circle)).not.toMatch(/tree nuts|shellfish|2026-1/i);
    }
  });

  it("draws households that haven't shared their profile yet without any of their answers", async () => {
    const h = await setup();
    const host = await h.as(null).call("create_space", { name: "S", templateId: "community-meals", displayName: "A", consent: true });
    const { inviteUrl } = await h.as(host.accountId).call("get_space", { spaceId: host.spaceId });
    const b = await h.as(null).call("join_space", { inviteCode: inviteUrl.split("/join/")[1], displayName: "B", consent: true });
    await runIntake(h, b.accountId, host.spaceId, answers.Patel); // drafted, not approved
    const circle = await h.as(host.accountId).call("get_circle", { spaceId: host.spaceId });
    expect(circle.households.find((x: any) => x.name === "B")).toMatchObject({ joined: false, members: [], highlights: [], summary: null, size: 1 });
    expect(circle.threads).toEqual([]);
  });
});
