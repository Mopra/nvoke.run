import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { deleteUserByClerkId } from "../queries/users.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

interface ClerkEvent {
  type?: string;
  data?: { id?: string };
}

const SVIX_TOLERANCE_SECONDS = 5 * 60;

function verifySvix(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  body: string,
): boolean {
  const ts = Number.parseInt(svixTimestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > SVIX_TOLERANCE_SECONDS) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", secretBytes)
    .update(`${svixId}.${svixTimestamp}.${body}`)
    .digest();

  for (const entry of svixSignature.split(" ")) {
    const [version, sig] = entry.split(",");
    if (version !== "v1" || !sig) continue;
    const received = Buffer.from(sig, "base64");
    if (received.length === expected.length && timingSafeEqual(received, expected)) {
      return true;
    }
  }
  return false;
}

function firstHeader(req: FastifyRequest, name: string): string | undefined {
  const raw = req.headers[name];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export async function webhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      const text = typeof body === "string" ? body : body.toString("utf8");
      req.rawBody = text;
      if (!text) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(text));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.post("/api/webhooks/clerk", {
    config: { rateLimit: false },
  }, async (req, reply) => {
    const secret = config.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      req.log.error("clerk webhook received but CLERK_WEBHOOK_SECRET is unset");
      return reply.code(503).send({ error: "webhook_disabled" });
    }

    const svixId = firstHeader(req, "svix-id");
    const svixTimestamp = firstHeader(req, "svix-timestamp");
    const svixSignature = firstHeader(req, "svix-signature");
    const rawBody = req.rawBody;

    if (!svixId || !svixTimestamp || !svixSignature || rawBody === undefined) {
      return reply.code(400).send({ error: "missing_headers" });
    }

    if (!verifySvix(secret, svixId, svixTimestamp, svixSignature, rawBody)) {
      req.log.warn({ svixId }, "clerk webhook signature verification failed");
      return reply.code(401).send({ error: "invalid_signature" });
    }

    const event = req.body as ClerkEvent;
    if (event.type === "user.deleted") {
      const clerkId = event.data?.id;
      if (!clerkId) {
        req.log.warn({ event: event.type }, "user.deleted missing data.id");
        return { ok: true };
      }
      const removed = await deleteUserByClerkId(clerkId);
      req.log.info({ clerkId, removed }, "processed clerk user.deleted");
    }

    return { ok: true };
  });
}
