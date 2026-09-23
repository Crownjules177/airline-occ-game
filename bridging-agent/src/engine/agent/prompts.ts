import fs from "node:fs";
import path from "node:path";

export type Prompt = { id: string; version: number; body: string };

const cache = new Map<string, Prompt>();

/**
 * Prompts are versioned Markdown files in /prompts, one per stage, reviewed like code.
 * Each starts with front matter: `id` and `version`. The version is logged with every call.
 */
export function loadPrompt(id: string): Prompt {
  const hit = cache.get(id);
  if (hit) return hit;
  const file = path.join(process.cwd(), "prompts", `${id}.md`);
  const raw = fs.readFileSync(file, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`Prompt ${id} is missing front matter`);
  const meta = Object.fromEntries(
    match[1].split("\n").map((line) => {
      const i = line.indexOf(":");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
  );
  const prompt = { id: meta.id ?? id, version: Number(meta.version ?? 1), body: match[2].trim() };
  cache.set(id, prompt);
  return prompt;
}
