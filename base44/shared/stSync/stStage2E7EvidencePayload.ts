/**
 * Stage 2E.7 Shadow Audit — Evidence payload + response envelope.
 *
 * Assembles the sanitized canonical evidence payload and the deterministic
 * response envelope. The envelope retains `canonical_payload` as one exact
 * deterministic UTF-8 string; `canonical_payload_byte_length` and
 * `canonical_payload_sha256` cover ONLY that exact string and exclude the
 * outer envelope and their own fields.
 *
 * Runtime and test-only. No persistence.
 */

import { canonicalJson, sha256Hex } from "./stStage2E7ReadCapture.ts";
import { redactObject, verifyRedaction } from "./stStage2E5Shared.ts";
import type { ResponseEnvelope } from "./stStage2E7Types.ts";

export const ENVELOPE_VERSION = "2E7SA-env-v1";

export interface BuildEnvelopeInput {
  correlationId: string;
  evidence: any;
}

export async function buildEnvelopeAsync(input: BuildEnvelopeInput): Promise<ResponseEnvelope> {
  const sanitized = redactObject(input.evidence);
  const canonical_payload = canonicalJson(sanitized);
  const encoded = new TextEncoder().encode(canonical_payload);
  const canonical_payload_byte_length = encoded.length;
  const canonical_payload_sha256 = await sha256Hex(canonical_payload);
  return {
    envelope_version: ENVELOPE_VERSION,
    correlation_id: input.correlationId,
    canonical_payload,
    canonical_payload_byte_length,
    canonical_payload_sha256,
  };
}

export interface EnvelopeVerification {
  lengthOk: boolean;
  hashOk: boolean;
}

export async function verifyEnvelope(env: ResponseEnvelope): Promise<EnvelopeVerification> {
  const encoded = new TextEncoder().encode(env.canonical_payload);
  const lengthOk = encoded.length === env.canonical_payload_byte_length;
  const recomputed = await sha256Hex(env.canonical_payload);
  const hashOk = recomputed === env.canonical_payload_sha256;
  return { lengthOk, hashOk };
}

export interface SanitizationResult {
  sanitized: any;
  leaks: string[];
}

export function sanitizeEvidence(evidence: any): SanitizationResult {
  const sanitized = redactObject(evidence);
  const { leakedValues } = verifyRedaction(JSON.stringify(sanitized));
  return { sanitized, leaks: leakedValues };
}

export interface PredictedSizeResult {
  predictedBytes: number;
  state: "UNAPPROVED" | "OK" | "OVERSIZE";
  stop: boolean;
}

export function predictedPayloadSize(recordCount: number, avgRecordBytes: number, threshold: number | null): PredictedSizeResult {
  const predictedBytes = recordCount * avgRecordBytes;
  if (threshold === null) {
    return { predictedBytes, state: "UNAPPROVED", stop: true };
  }
  if (predictedBytes > threshold) {
    return { predictedBytes, state: "OVERSIZE", stop: true };
  }
  return { predictedBytes, state: "OK", stop: false };
}