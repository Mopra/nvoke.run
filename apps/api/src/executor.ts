import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const runnerPath = join(dirname(fileURLToPath(import.meta.url)), "runner", "runner.mjs");

export type ExecResult =
  | { status: "success"; output: unknown; logs: string[]; duration_ms: number }
  | { status: "error"; error: string; logs: string[]; duration_ms: number }
  | { status: "timeout"; error: string; logs: string[]; duration_ms: number };

const TIMEOUT_MS = 30_000;
const OUTPUT_CAP = 1 * 1024 * 1024;

export async function execute(code: string, input: unknown): Promise<ExecResult> {
  const dir = await mkdtemp(join(tmpdir(), "nvoke-"));
  const file = join(dir, "fn.mjs");
  await writeFile(file, code, "utf8");
  const started = Date.now();

  return await new Promise<ExecResult>((resolve) => {
    const child = spawn("node", ["--max-old-space-size=128", runnerPath, file], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "" },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let finished = false;

    const finish = async (result: ExecResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      resolve(result);
    };

    child.stdout.on("data", (c: Buffer) => {
      if (stdout.length + c.length > OUTPUT_CAP) {
        child.kill("SIGKILL");
        return;
      }
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c: Buffer) => {
      if (stderr.length + c.length > OUTPUT_CAP) {
        child.kill("SIGKILL");
        return;
      }
      stderr += c.toString("utf8");
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);

    child.on("error", (e) =>
      finish({
        status: "error",
        error: `spawn failed: ${e.message}`,
        logs: [],
        duration_ms: Date.now() - started,
      }),
    );

    child.on("exit", () => {
      const duration_ms = Date.now() - started;
      if (timedOut) {
        finish({
          status: "timeout",
          error: "function exceeded 30s",
          logs: [],
          duration_ms,
        });
        return;
      }
      const lastLine = stdout.trim().split("\n").pop() ?? "";
      try {
        const parsed = JSON.parse(lastLine) as
          | { ok: true; output: unknown; logs: string[] }
          | { ok: false; error: string; logs: string[] };
        if (parsed.ok) {
          finish({
            status: "success",
            output: parsed.output,
            logs: parsed.logs,
            duration_ms,
          });
        } else {
          finish({
            status: "error",
            error: parsed.error,
            logs: parsed.logs,
            duration_ms,
          });
        }
      } catch {
        finish({
          status: "error",
          error: stderr || `runner produced no parseable output: ${stdout.slice(0, 500)}`,
          logs: [],
          duration_ms,
        });
      }
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}
