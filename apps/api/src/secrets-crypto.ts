import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { config } from "./config.js";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function decodeKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, "hex");
  const b64 = Buffer.from(trimmed, "base64");
  if (b64.length === 32) return b64;
  throw new Error(
    "SECRET_ENCRYPTION_KEY must be 32 bytes encoded as base64 or hex",
  );
}

function loadKey(): Buffer {
  const raw = config.SECRET_ENCRYPTION_KEY;
  if (raw) return decodeKey(raw);
  if (config.NODE_ENV === "production") {
    throw new Error(
      "SECRET_ENCRYPTION_KEY is required in production to encrypt function secrets",
    );
  }
  // Deterministic dev fallback so restarts can still decrypt existing rows.
  return createHash("sha256").update("nvoke-dev-secret-key").digest();
}

const KEY = loadKey();

export function encryptSecret(plaintext: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

export function decryptSecret(blob: Buffer): string {
  if (blob.length < IV_LEN + TAG_LEN) {
    throw new Error("ciphertext too short");
  }
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

export function maskPreview(value: string): string {
  if (value.length <= 8) return "•".repeat(Math.max(4, value.length));
  const tail = value.slice(-4);
  const dotCount = Math.min(8, value.length - 4);
  return "•".repeat(dotCount) + tail;
}
