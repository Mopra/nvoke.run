import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { build } from "esbuild";

export type DependencyMap = Record<string, string>;

export type BundleResult =
  | { ok: true; bundled: string }
  | { ok: false; error: string };

export const MAX_DEPENDENCIES = 20;
const INSTALL_TIMEOUT_MS = 60_000;

// Native or otherwise unsupported in our exec sandbox.
const REJECTED_PACKAGES = new Set([
  "sharp",
  "bcrypt",
  "node-gyp",
  "canvas",
  "puppeteer",
  "playwright",
  "@grpc/grpc-js",
]);

// Exact semver only for v1: digits.digits.digits[ -prerelease ]
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
// npm package names: optional @scope/, lowercase letters, digits, dashes, underscores, dots.
const NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

export function validateDependencies(
  deps: DependencyMap,
): { ok: true } | { ok: false; error: string } {
  const entries = Object.entries(deps);
  if (entries.length > MAX_DEPENDENCIES) {
    return { ok: false, error: `at most ${MAX_DEPENDENCIES} dependencies allowed` };
  }
  for (const [name, version] of entries) {
    if (!NAME_RE.test(name)) {
      return { ok: false, error: `invalid package name: ${name}` };
    }
    if (REJECTED_PACKAGES.has(name)) {
      return {
        ok: false,
        error: `package not supported in nvoke runtime: ${name}`,
      };
    }
    if (typeof version !== "string" || !VERSION_RE.test(version)) {
      return {
        ok: false,
        error: `invalid version for ${name}: must be exact semver (e.g. 1.2.3)`,
      };
    }
  }
  return { ok: true };
}

function runNpmInstall(cwd: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      "npm",
      [
        "install",
        "--no-audit",
        "--no-fund",
        "--omit=dev",
        "--ignore-scripts",
        "--prefer-offline",
        "--silent",
      ],
      { cwd, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" },
    );
    let stderr = "";
    child.stderr.on("data", (c: Buffer) => {
      if (stderr.length < 8192) stderr += c.toString("utf8");
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), INSTALL_TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `npm install failed to start: ${e.message}` });
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (signal === "SIGKILL") {
        resolve({ ok: false, error: "npm install timed out" });
        return;
      }
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      resolve({
        ok: false,
        error: `npm install exited with code ${code}: ${stderr.trim().slice(-2000) || "(no stderr)"}`,
      });
    });
  });
}

export async function bundleFunction(
  code: string,
  deps: DependencyMap,
): Promise<BundleResult> {
  const valid = validateDependencies(deps);
  if (!valid.ok) return valid;

  // Fast path: no deps, nothing to bundle.
  if (Object.keys(deps).length === 0) {
    return { ok: true, bundled: code };
  }

  const dir = await mkdtemp(join(tmpdir(), "nvoke-build-"));
  try {
    const entry = join(dir, "index.mjs");
    await writeFile(entry, code, "utf8");
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify(
        { name: "nvoke-fn-build", private: true, type: "module", dependencies: deps },
        null,
        2,
      ),
      "utf8",
    );

    const installed = await runNpmInstall(dir);
    if (!installed.ok) return installed;

    const outFile = join(dir, "out.mjs");
    try {
      await build({
        entryPoints: [entry],
        outfile: outFile,
        bundle: true,
        platform: "node",
        format: "esm",
        target: "node20",
        absWorkingDir: dir,
        logLevel: "silent",
        // Keep Node built-ins external so the runner sees real node:* modules.
        // npm packages are bundled inline.
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `bundle failed: ${message.slice(0, 2000)}` };
    }

    const bundled = await readFile(outFile, "utf8");
    return { ok: true, bundled };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
