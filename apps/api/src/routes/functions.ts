import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clerkAuth } from "../auth.js";
import * as Q from "../queries/functions.js";
import { SUPPORTED_METHODS, type DependencyMap, type Fn } from "../queries/functions.js";
import { bundleFunction, MAX_DEPENDENCIES } from "../build/bundle.js";
import { encryptSecret, maskPreview } from "../secrets-crypto.js";

const MethodEnum = z.enum(SUPPORTED_METHODS);
const Slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase alphanumeric with dashes");
const DepName = z
  .string()
  .min(1)
  .max(214)
  .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/, "invalid package name");
const DepVersion = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "version must be exact semver (e.g. 1.2.3)");
const Dependencies = z
  .record(DepName, DepVersion)
  .refine((d) => Object.keys(d).length <= MAX_DEPENDENCIES, {
    message: `at most ${MAX_DEPENDENCIES} dependencies`,
  });

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  code: z.string().max(100_000),
  slug: Slug.optional(),
  access_mode: z.enum(["public", "api_key"]).optional(),
  enabled: z.boolean().optional(),
  methods: z.array(MethodEnum).min(1).optional(),
  dependencies: Dependencies.optional(),
});
const UpdateBody = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().max(100_000).optional(),
  slug: Slug.nullable().optional(),
  access_mode: z.enum(["public", "api_key"]).optional(),
  enabled: z.boolean().optional(),
  methods: z.array(MethodEnum).min(1).optional(),
  dependencies: Dependencies.optional(),
});
const IdParams = z.object({ id: z.string().uuid() });
const VersionParams = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
});

function isUniqueViolation(err: unknown): err is { code: string } {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

function depsEqual(a: DependencyMap, b: DependencyMap): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

async function rebuildIfNeeded(fn: Fn, opts: { force: boolean }): Promise<Fn> {
  const hasDeps = Object.keys(fn.dependencies ?? {}).length > 0;
  if (!opts.force && !hasDeps && fn.build_status === null) return fn;
  const result = await bundleFunction(fn.code, fn.dependencies ?? {});
  await Q.recordBuildResult(fn.id, result);
  if (result.ok) {
    return {
      ...fn,
      bundled_code: result.bundled,
      build_status: "ok",
      build_error: null,
      built_at: new Date().toISOString(),
    };
  }
  return {
    ...fn,
    bundled_code: null,
    build_status: "error",
    build_error: result.error,
    built_at: new Date().toISOString(),
  };
}

export async function functionsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", clerkAuth);

  app.get("/api/functions", async (req) => {
    return { functions: await Q.listFunctions(req.user!.id) };
  });

  app.post("/api/functions", async (req, reply) => {
    const body = CreateBody.parse(req.body);
    try {
      const fn = await Q.createFunction(req.user!.id, body);
      const built = await rebuildIfNeeded(fn, { force: false });
      return reply.code(201).send({ function: built });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return reply
          .code(409)
          .send({ error: "slug_taken", message: "slug already in use" });
      }
      throw e;
    }
  });

  app.get("/api/functions/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const fn = await Q.getFunction(id, req.user!.id);
    if (!fn)
      return reply.code(404).send({ error: "not_found", message: "function not found" });
    return { function: fn };
  });

  app.put("/api/functions/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const body = UpdateBody.parse(req.body);
    try {
      const before = await Q.getFunction(id, req.user!.id);
      if (!before)
        return reply.code(404).send({ error: "not_found", message: "function not found" });
      const fn = await Q.updateFunction(id, req.user!.id, body);
      if (!fn)
        return reply.code(404).send({ error: "not_found", message: "function not found" });
      const codeChanged = body.code !== undefined && body.code !== before.code;
      const depsChanged =
        body.dependencies !== undefined &&
        !depsEqual(body.dependencies, before.dependencies ?? {});
      const built =
        codeChanged || depsChanged ? await rebuildIfNeeded(fn, { force: true }) : fn;
      return { function: built };
    } catch (e) {
      if (isUniqueViolation(e)) {
        return reply
          .code(409)
          .send({ error: "slug_taken", message: "slug already in use" });
      }
      throw e;
    }
  });

  app.delete("/api/functions/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await Q.deleteFunction(id, req.user!.id);
    return reply.code(204).send();
  });

  app.get("/api/functions/:id/versions", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const versions = await Q.listVersions(id, req.user!.id);
    if (!versions)
      return reply.code(404).send({ error: "not_found", message: "function not found" });
    return { versions };
  });

  app.post("/api/functions/:id/versions/:versionId/rollback", async (req, reply) => {
    const { id, versionId } = VersionParams.parse(req.params);
    const fn = await Q.rollbackToVersion(id, req.user!.id, versionId);
    if (!fn)
      return reply.code(404).send({ error: "not_found", message: "version not found" });
    const built = await rebuildIfNeeded(fn, { force: true });
    return { function: built };
  });

  app.put("/api/functions/:id/webhook-verify", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const body = WebhookVerifyBody.parse(req.body);
    const existing = await Q.getFunction(id, req.user!.id);
    if (!existing)
      return reply.code(404).send({ error: "not_found", message: "function not found" });

    if (body.kind === "none") {
      const fn = await Q.setWebhookVerify(id, req.user!.id, {
        kind: "none",
        secret_ct: null,
        secret_preview: null,
        signature_header: null,
      });
      return { function: fn };
    }

    const secret = body.secret?.trim();
    const needSecret = !existing.webhook_secret_preview;
    if (needSecret && !secret) {
      return reply
        .code(400)
        .send({ error: "secret_required", message: "a webhook secret is required" });
    }
    const secret_ct = secret ? encryptSecret(secret) : null;
    const secret_preview = secret ? maskPreview(secret) : null;
    const signatureHeader =
      body.kind === "hmac_sha256"
        ? body.signature_header?.trim() || "x-signature"
        : null;
    const fn = await Q.setWebhookVerify(id, req.user!.id, {
      kind: body.kind,
      secret_ct: secret_ct ?? null,
      secret_preview: secret_preview ?? existing.webhook_secret_preview,
      signature_header: signatureHeader,
    });
    return { function: fn };
  });
}

const WebhookVerifyBody = z.object({
  kind: z.enum(["none", "stripe", "github", "hmac_sha256"]),
  secret: z.string().min(1).max(2048).optional(),
  signature_header: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/, "header name must be simple")
    .optional(),
});
