/**
 * Focused unit tests for the Zapier job-snapshot envelope validator.
 *
 * Pure-logic verification of the request-contract rules (cases 3–6 and the
 * validation aspects of 5/6/9). These tests do not perform I/O and do not
 * touch the database or any external system. They document and structurally
 * verify the validation contract independently of the HTTP/SDK runtime.
 *
 * Run with: deno test (repo Deno runtime). Not executed in the Node sandbox.
 */
import { assertEquals } from "npm:std@0.224.0/assert/mod.ts";
import { validateEnvelope, buildRequestMetadata } from "../../../shared/zapierJobSnapshotValidator.ts";

function validEnvelope(overrides: Record<string, unknown> = {}): any {
  return {
    schema_version: "1.0",
    source: "zapier",
    event_type: "servicetitan.job_snapshot",
    environment: "diagnostic",
    job_id: "47599963",
    correlation_id: "corr-1",
    snapshot_json: JSON.stringify({ id: "47599963", customer_name: "Test Customer" }),
    ...overrides,
  };
}

Deno.test("validateEnvelope: valid envelope passes and returns parsed snapshot", () => {
  const r = validateEnvelope(validEnvelope());
  assertEquals(r.valid, true);
  assertEquals(r.parsedSnapshot.id, "47599963");
});

Deno.test("validateEnvelope: wrong schema_version rejected (422)", () => {
  const r = validateEnvelope(validEnvelope({ schema_version: "2.0" }));
  assertEquals(r.valid, false);
  assertEquals(r.status, 422);
});

Deno.test("validateEnvelope: wrong source rejected (422)", () => {
  const r = validateEnvelope(validEnvelope({ source: "servicetitan" }));
  assertEquals(r.valid, false);
  assertEquals(r.status, 422);
});

Deno.test("validateEnvelope: wrong event_type rejected (422)", () => {
  const r = validateEnvelope(validEnvelope({ event_type: "job.created" }));
  assertEquals(r.valid, false);
  assertEquals(r.status, 422);
});

Deno.test("validateEnvelope: production environment rejected (422)", () => {
  const r = validateEnvelope(validEnvelope({ environment: "production" }));
  assertEquals(r.valid, false);
  assertEquals(r.status, 422);
});

Deno.test("validateEnvelope: missing/empty job_id rejected (422)", () => {
  const r = validateEnvelope(validEnvelope({ job_id: "" }));
  assertEquals(r.valid, false);
  assertEquals(r.status, 422);
});

Deno.test("validateEnvelope: snapshot_json not a string rejected (422)", () => {
  const r = validateEnvelope(validEnvelope({ snapshot_json: { id: "47599963" } }));
  assertEquals(r.valid, false);
  assertEquals(r.status, 422);
});

Deno.test("validateEnvelope: malformed snapshot_json rejected (422)", () => {
  const r = validateEnvelope(validEnvelope({ snapshot_json: "{not valid" }));
  assertEquals(r.valid, false);
  assertEquals(r.status, 422);
});

Deno.test("validateEnvelope: snapshot root not an object rejected (422)", () => {
  const r = validateEnvelope(validEnvelope({ snapshot_json: "[1,2,3]" }));
  assertEquals(r.valid, false);
  assertEquals(r.status, 422);
});

Deno.test("validateEnvelope: job_id mismatch rejected (422)", () => {
  const r = validateEnvelope(validEnvelope({
    job_id: "47599963",
    snapshot_json: JSON.stringify({ id: "999999" }),
  }));
  assertEquals(r.valid, false);
  assertEquals(r.status, 422);
});

Deno.test("validateEnvelope: snapshot with no job id field passes (no mismatch check)", () => {
  const r = validateEnvelope(validEnvelope({
    snapshot_json: JSON.stringify({ customer_name: "No Job ID Here" }),
  }));
  assertEquals(r.valid, true);
});

Deno.test("buildRequestMetadata: never includes secret or idempotency values", () => {
  const m = JSON.parse(buildRequestMetadata("POST", "application/json", "Zapier/1.0", "lvcos.local"));
  assertEquals(m.method, "POST");
  assertEquals(m.content_type, "application/json");
  assertEquals(m.user_agent, "Zapier/1.0");
  assertEquals(m.host, "lvcos.local");
  assertEquals(Object.keys(m).includes("secret"), false);
  assertEquals(Object.keys(m).includes("x-crm-webhook-secret"), false);
  assertEquals(Object.keys(m).includes("idempotency-key"), false);
});