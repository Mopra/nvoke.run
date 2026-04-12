import { describe, it, expect } from "vitest";
import { execute } from "./executor.js";

describe("execute", () => {
  it("returns output for successful function", async () => {
    const code = `export default async (i) => ({ hi: i.name });`;
    const r = await execute(code, { name: "x" });
    expect(r.status).toBe("success");
    if (r.status === "success") expect(r.output).toEqual({ hi: "x" });
  });

  it("captures logs", async () => {
    const code = `export default async (i, ctx) => { ctx.log("a"); ctx.log("b"); return 1; };`;
    const r = await execute(code, {});
    expect(r.status).toBe("success");
    if (r.status === "success") expect(r.logs).toEqual(["a", "b"]);
  });

  it("reports user errors", async () => {
    const code = `export default async () => { throw new Error("boom"); };`;
    const r = await execute(code, {});
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.error).toMatch(/boom/);
  });

  it("times out", async () => {
    const code = `export default async () => { while (true) {} };`;
    const r = await execute(code, {});
    expect(r.status).toBe("timeout");
  }, 40_000);
});
