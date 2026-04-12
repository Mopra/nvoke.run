// Standalone runner executed via: node runner.mjs <user-file-path>
// Stdin: JSON input
// Stdout: single JSON line { ok, output?, logs, error? }

import { pathToFileURL } from "node:url";

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data ? JSON.parse(data) : null;
}

const logs = [];
const ctx = {
  log: (...args) => {
    const line = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    if (logs.length < 100) logs.push(line.slice(0, 2048));
  },
};

async function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("runner: missing file path argv");
  const input = await readStdin();
  const mod = await import(pathToFileURL(filePath).href);
  const fn = mod.default;
  if (typeof fn !== "function") {
    throw new Error("function must export a default async function");
  }
  const output = await fn(input, ctx);
  process.stdout.write(JSON.stringify({ ok: true, output, logs }) + "\n");
}

main().catch((e) => {
  const error = e instanceof Error ? e.stack || e.message : String(e);
  process.stdout.write(JSON.stringify({ ok: false, error, logs }) + "\n");
  process.exit(1);
});
