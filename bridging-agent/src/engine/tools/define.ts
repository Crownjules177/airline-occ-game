import type { z } from "zod";
import type { ToolContext } from "../context";

/**
 * The engine's internal boundary is a set of named tools with typed inputs, the same shape an
 * MCP server exposes. The web app calls them today; federating the personal layer later means
 * wrapping these, not redesigning them.
 *
 *   personal  about the caller's own data (intake, profile, responses, commitments)
 *   group     reads and actions on shared group state
 *   host      host-only actions
 */
export type Layer = "personal" | "group" | "host";

export interface Tool<S extends z.ZodType = z.ZodType, O = unknown> {
  name: string;
  description: string;
  layer: Layer;
  /** True if the tool may be called without a signed-in account. */
  anonymous?: boolean;
  input: S;
  run(ctx: ToolContext, input: z.infer<S>): Promise<O>;
}

export const defineTool = <S extends z.ZodType, O>(t: Tool<S, O>) => t;
