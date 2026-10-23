/**
 * Stage 2E.7 Shadow Audit — Identity record builder (AC-013).
 *
 * Builds the source/build identity record. Unavailable platform identity
 * capabilities degrade to disclosed non-blocking limitations per Q5 (only
 * when remaining identity evidence is conclusive).
 *
 * Runtime and test-only. No production contact.
 */

import type { IdentityRecord } from "./stStage2E7Types.ts";

export async function buildIdentityRecord(
  correlationId: string,
  environment: string,
): Promise<IdentityRecord> {
  const disclosedLimitations: string[] = [];
  let repositoryPath: string | null = null;
  let sourceSha256: string | null = null;
  let revision: string | null = null;

  try {
    repositoryPath = (import.meta as any)?.url ?? null;
  } catch {
    repositoryPath = null;
  }
  if (!repositoryPath) disclosedLimitations.push("runtime source-path unavailable");

  try {
    if (repositoryPath) {
      // Runtime self-read may or may not be available in the deployed runtime.
      const text = await Deno.readTextFile(new URL(repositoryPath));
      const enc = new TextEncoder().encode(text);
      const buf = await crypto.subtle.digest("SHA-256", enc);
      sourceSha256 = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    sourceSha256 = null;
  }
  if (!sourceSha256) disclosedLimitations.push("runtime source-self-hash unavailable");

  if (!revision) disclosedLimitations.push("runtime repository-revision unavailable");

  return {
    repositoryPath,
    sourceSha256,
    revision,
    environment,
    correlationId,
    disclosedLimitations,
  };
}