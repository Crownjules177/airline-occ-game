import type { NextConfig } from "next";

const config: NextConfig = {
  // This app lives in a subfolder of a larger repo; trace files from here.
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  // PGlite ships WASM and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Prompts are read from disk at runtime; make sure they ship with the server build.
  outputFileTracingIncludes: { "/**": ["./prompts/**", "./drizzle/**"] },
};

export default config;
