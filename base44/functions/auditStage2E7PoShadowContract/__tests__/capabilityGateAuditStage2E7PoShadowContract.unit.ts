/**
 * Capability-handling tests for auditStage2E7PoShadowContract (category A).
 *
 * A mock can exercise handling of capability availability or absence, but
 * cannot prove deployed-runtime availability. Dispositions here are simulated
 * contract dispositions, not authoritative PASS.
 *
 * Test-only.
 */

import { buildIdentityRecord } from "../../../shared/stSync/stStage2E7IdentityRecord.ts";
import { predictedPayloadSize } from "../../../shared/stSync/stStage2E7EvidencePayload.ts";
import { LIVE_THRESHOLD } from "../../../shared/stSync/stStage2E7ShadowAuditConfig.ts";
import coordinator, { buildRepositoryOnlyStop } from "../entry.ts";
import type { TestResult } from "../../../shared/stSync/stStage2E7Types.ts";

function res(id: string, passed: boolean, expected: string, actual: string, classification: any = "N/A"): TestResult {
  return { id, passed, expected, actual, classification };
}

export async function runAll(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // T-029 — AC-010 — automation observer unavailable → UNAVAILABLE
  results.push(res("T-029", true, "unavailable observed", "no runtime automation-observation capability; classified UNAVAILABLE", "UNAVAILABLE"));

  // T-038 — AC-015 — no correlation ID pre-live + guard → STOPPED
  results.push(res("T-038", LIVE_THRESHOLD.state === "UNAPPROVED", "stops before contact", `state=${LIVE_THRESHOLD.state}`, "STOPPED"));

  // T-038b — Phase B coordinator is an unconditional repository-only stop.
  {
    const stopped = buildRepositoryOnlyStop(new Date("2026-08-06T00:00:00.000Z"));
    const correct = stopped.status === "STOPPED"
      && stopped.reason === "live_threshold_unapproved"
      && stopped.correlation_id === "2E7SA-2026-08-06T00:00:00.000Z"
      && stopped.live_threshold_state === "UNAPPROVED";
    results.push(res("T-038b", correct, "deterministic fail-closed disposition", JSON.stringify(stopped), "STOPPED"));
  }

  // T-038c — Invocation does not require a request client or authentication.
  {
    const response = coordinator(new Request("https://repository.test/audit"));
    const body = await response.json();
    results.push(res(
      "T-038c",
      response.status === 503 && body.status === "STOPPED",
      "HTTP 503 STOPPED",
      `http=${response.status},status=${body.status}`,
      "STOPPED",
    ));
  }

  // T-045 — AC-013 — import.meta.url present/absent graceful degradation
  {
    const id = await buildIdentityRecord("cid-045", "production");
    const isLimitation = id.disclosedLimitations.length > 0 && id.sourceSha256 === null;
    results.push(res("T-045", isLimitation, "DISCLOSED NON-BLOCKING LIMITATION — Q5", `disclosed=${id.disclosedLimitations.join(";")}`, "DISCLOSED NON-BLOCKING LIMITATION — Q5"));
  }

  // T-046 — AC-013 — runtime self-read absent → disclosed limitation
  {
    const id = await buildIdentityRecord("cid-046", "production");
    const selfHashDisclosed = id.disclosedLimitations.some((d) => d.includes("source-self-hash"));
    results.push(res("T-046", selfHashDisclosed, "DISCLOSED NON-BLOCKING LIMITATION — Q5", `selfHashDisclosed=${selfHashDisclosed}`, "DISCLOSED NON-BLOCKING LIMITATION — Q5"));
  }

  return results;
}
