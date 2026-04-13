import { describe, it, expect } from "vitest";
import { execute, emptyRequest } from "./executor.js";

const req = (body: unknown) => ({ request: emptyRequest(body) });

describe("execute", () => {
  it("normalizes bare object shorthand to 200 JSON", async () => {
    const code = `export default async (r) => ({ hi: r.body.name });`;
    const r = await execute(code, req({ name: "x" }));
    expect(r.status).toBe("success");
    if (r.status === "success") {
      expect(r.response.status).toBe(200);
      expect(r.response.headers["content-type"]).toMatch(/application\/json/);
      expect(JSON.parse(r.response.body)).toEqual({ hi: "x" });
    }
  });

  it("normalizes string body to text/plain", async () => {
    const code = `export default async () => "hello world";`;
    const r = await execute(code, req(null));
    expect(r.status).toBe("success");
    if (r.status === "success") {
      expect(r.response.headers["content-type"]).toMatch(/text\/plain/);
      expect(r.response.body).toBe("hello world");
    }
  });

  it("honors explicit status and headers", async () => {
    const code = `
      export default async () => ({
        status: 418,
        headers: { "x-test": "yes", "content-type": "text/plain" },
        body: "teapot"
      });
    `;
    const r = await execute(code, req(null));
    expect(r.status).toBe("success");
    if (r.status === "success") {
      expect(r.response.status).toBe(418);
      expect(r.response.headers["x-test"]).toBe("yes");
      expect(r.response.body).toBe("teapot");
    }
  });

  it("rejects invalid response shape", async () => {
    const code = `export default async () => ({ status: 999, body: "nope" });`;
    const r = await execute(code, req(null));
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.error).toMatch(/status/);
  });

  it("captures logs", async () => {
    const code = `export default async (_, ctx) => { ctx.log("a"); ctx.log("b"); return 1; };`;
    const r = await execute(code, req(null));
    expect(r.status).toBe("success");
    if (r.status === "success") expect(r.logs).toEqual(["a", "b"]);
  });

  it("reports user errors", async () => {
    const code = `export default async () => { throw new Error("boom"); };`;
    const r = await execute(code, req(null));
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.error).toMatch(/boom/);
  });

  it("times out", async () => {
    const code = `export default async () => { while (true) {} };`;
    const r = await execute(code, req(null));
    expect(r.status).toBe("timeout");
  }, 40_000);
});
