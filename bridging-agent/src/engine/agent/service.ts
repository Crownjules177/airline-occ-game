import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { DB } from "../db/client";
import { agentCalls } from "../db/schema";
import type { Template } from "../template";
import { loadPrompt } from "./prompts";
import { newId } from "../ids";

export type Effort = "low" | "medium" | "high";

/**
 * One agent stage: a versioned prompt, a structured output schema derived from the template,
 * a renderer for the model input, and a deterministic mock used when no API key is configured
 * (local development, tests, demos).
 */
export interface Stage<I, O> {
  promptId: string;
  effort: Effort;
  schema(t: Template): z.ZodType<O>;
  render(input: I, t: Template): string;
  mock(input: I, t: Template): O;
}

export interface ModelClient {
  readonly model: string;
  complete<O>(args: {
    system: string;
    user: string;
    schema: z.ZodType<O>;
    effort: Effort;
  }): Promise<{ output: O; usage?: unknown }>;
}

export class ClaudeModel implements ModelClient {
  private client: Anthropic;
  constructor(
    readonly model: string,
    apiKey?: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async complete<O>({ system, user, schema, effort }: Parameters<ModelClient["complete"]>[0] & { schema: z.ZodType<O> }) {
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      // If a safety classifier declines, retry server-side on Anthropic's recommended fallback.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort, format: betaZodOutputFormat(schema) },
      // The stage prompt is stable, so cache it; the per-call data goes in the user turn.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
    if (response.stop_reason === "refusal") {
      throw new Error(`Model declined the request (${response.stop_details?.category ?? "unspecified"})`);
    }
    if (response.stop_reason === "max_tokens") throw new Error("Model output was cut off (max_tokens)");
    if (response.parsed_output == null) throw new Error("Model returned no parseable output");
    return { output: response.parsed_output as O, usage: response.usage };
  }
}

export class MockModel {
  readonly model = "mock";
}

/**
 * The single service layer every agent call goes through (NFR6). It picks Claude or the mock,
 * and logs the prompt version, input and output of every call for the host (NFR5, audit rule).
 */
export class AgentService {
  constructor(
    private db: DB,
    private model: ModelClient | MockModel,
  ) {}

  get modelName() {
    return this.model.model;
  }

  get isMock() {
    return this.model instanceof MockModel;
  }

  async run<I, O>(
    stage: Stage<I, O>,
    args: { spaceId: string | null; template: Template; input: I },
  ): Promise<{ output: O; callId: string }> {
    const prompt = loadPrompt(stage.promptId);
    const started = Date.now();
    const callId = newId();
    let output: O | undefined;
    let usage: unknown;
    let error: string | undefined;
    try {
      if (this.model instanceof MockModel) {
        output = stage.mock(args.input, args.template);
      } else {
        const res = await this.model.complete({
          system: prompt.body,
          user: stage.render(args.input, args.template),
          schema: stage.schema(args.template),
          effort: stage.effort,
        });
        output = res.output;
        usage = res.usage;
      }
      return { output, callId };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      await this.db.insert(agentCalls).values({
        id: callId,
        spaceId: args.spaceId,
        stage: stage.promptId,
        promptId: prompt.id,
        promptVersion: prompt.version,
        model: this.model.model,
        input: args.input as object,
        output: (output ?? null) as object | null,
        error: error ?? null,
        usage: (usage ?? null) as object | null,
        durationMs: Date.now() - started,
      });
    }
  }
}

export function createAgentService(db: DB): AgentService {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return new AgentService(db, new MockModel());
  return new AgentService(db, new ClaudeModel(process.env.BRIDGING_MODEL || "claude-opus-5", key));
}
