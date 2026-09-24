import { NextResponse } from "next/server";
import { describeTools } from "@/engine/tools";

/** The tool catalogue, in the shape an MCP server would list. */
export function GET() {
  return NextResponse.json({ tools: describeTools() });
}
