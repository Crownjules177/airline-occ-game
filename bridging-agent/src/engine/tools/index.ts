import { z } from "zod";
import type { Tool } from "./define";
import { ToolError, type ToolContext } from "../context";
import * as spaces from "./spaces";
import * as intake from "./intake";
import * as profiles from "./profiles";
import * as map from "./map";
import * as proposals from "./proposals";
import * as plan from "./plan";
import * as data from "./data";

const all: Tool[] = [
  spaces.listTemplatesTool,
  spaces.createSpace,
  spaces.getInvite,
  spaces.joinSpace,
  spaces.listMySpaces,
  spaces.getMyPersonalLink,
  spaces.getSpace,
  spaces.hostOverview,
  spaces.updateSpaceSettings,
  spaces.getAuditLog,
  intake.getIntake,
  intake.sendIntakeMessage,
  intake.draftMyProfile,
  profiles.getMyProfile,
  profiles.updateMyProfile,
  profiles.getGroupProfiles,
  map.submitContribution,
  map.getMap,
  map.generateMap,
  map.flagMapItem,
  proposals.listProposals,
  proposals.draftProposals,
  proposals.editProposal,
  proposals.releaseProposal,
  proposals.respondToProposal,
  proposals.draftRevision,
  proposals.dropProposal,
  proposals.adoptProposal,
  plan.getPlan,
  plan.claimCommitment,
  plan.releaseCommitment,
  plan.completeCommitment,
  data.exportMyData,
  data.deleteMyData,
] as Tool[];

export const tools = new Map(all.map((t) => [t.name, t]));

/** Validate the input against the tool's schema and run it. The single entry point to the engine. */
export async function callTool(ctx: ToolContext, name: string, rawInput: unknown): Promise<unknown> {
  const tool = tools.get(name);
  if (!tool) throw new ToolError(`Unknown tool: ${name}`, 404);
  if (!tool.anonymous && !ctx.accountId) throw new ToolError("Please sign in first.", 401);
  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    throw new ToolError(parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  }
  return tool.run(ctx, parsed.data as z.infer<typeof tool.input>);
}

/** Tool catalogue in MCP-like shape, for introspection and a future MCP server. */
export function describeTools() {
  return all.map((t) => ({
    name: t.name,
    description: t.description,
    layer: t.layer,
    inputSchema: z.toJSONSchema(t.input, { unrepresentable: "any" }),
  }));
}
