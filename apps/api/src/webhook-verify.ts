import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebhookVerifyKind } from "./queries/functions.js";

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

const STRIPE_TOLERANCE_SECONDS = 5 * 60;

function hexEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}

function verifyStripe(
  secret: string,
  rawBody: string,
  signatureHeader: string,
): VerifyResult {
  const parts = Object.fromEntries(
    signatureHeader
      .split(",")
      .map((p) => p.split("=", 2))
      .filter((p) => p.length === 2)
      .map(([k, v]) => [k.trim(), v.trim()]),
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) {
    return { ok: false, reason: "malformed_signature" };
  }
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, reason: "malformed_signature" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNum) > STRIPE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }
  const signed = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signed).digest("hex");
  if (!hexEq(expected, v1)) {
    return { ok: false, reason: "signature_mismatch" };
  }
  return { ok: true };
}

function verifyGithub(
  secret: string,
  rawBody: string,
  signatureHeader: string,
): VerifyResult {
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) {
    return { ok: false, reason: "malformed_signature" };
  }
  const provided = signatureHeader.slice(prefix.length).trim();
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!hexEq(expected, provided)) {
    return { ok: false, reason: "signature_mismatch" };
  }
  return { ok: true };
}

function verifyGenericHmac(
  secret: string,
  rawBody: string,
  signatureHeader: string,
): VerifyResult {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7).trim()
    : signatureHeader.trim();
  if (!hexEq(expected, provided)) {
    return { ok: false, reason: "signature_mismatch" };
  }
  return { ok: true };
}

export function defaultSignatureHeader(kind: WebhookVerifyKind): string | null {
  if (kind === "stripe") return "stripe-signature";
  if (kind === "github") return "x-hub-signature-256";
  return null;
}

export interface VerifyInput {
  kind: WebhookVerifyKind;
  secret: string;
  signatureHeader: string | null; // only used when kind === "hmac_sha256"
  rawBody: string;
  headers: Record<string, string>; // lowercased keys
}

export function verifyWebhookSignature(input: VerifyInput): VerifyResult {
  if (input.kind === "none") return { ok: true };

  const headerName =
    input.kind === "hmac_sha256"
      ? input.signatureHeader?.toLowerCase() ?? null
      : defaultSignatureHeader(input.kind);

  if (!headerName) {
    return { ok: false, reason: "no_signature_header_configured" };
  }
  const signature = input.headers[headerName];
  if (!signature) {
    return { ok: false, reason: "signature_header_missing" };
  }
  if (input.kind === "stripe") {
    return verifyStripe(input.secret, input.rawBody, signature);
  }
  if (input.kind === "github") {
    return verifyGithub(input.secret, input.rawBody, signature);
  }
  return verifyGenericHmac(input.secret, input.rawBody, signature);
}
