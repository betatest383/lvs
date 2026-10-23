/**
 * auditStage2E7PoShadowContract — repository-only fail-closed coordinator.
 *
 * Phase B does not authorize authentication, ServiceTitan contact, Base44
 * production access, or evidence generation. Keep this entry point free of the
 * Base44 SDK and all live-path modules so importing or invoking it cannot cross
 * any of those boundaries. A later live phase must replace this coordinator in
 * an explicitly reviewed change; changing configuration alone cannot enable a
 * dormant production path.
 */

import {
  LIVE_THRESHOLD,
  STAGE_2E7_CORRELATION_PREFIX,
} from "../../shared/stSync/stStage2E7ShadowAuditConfig.ts";

export interface RepositoryOnlyStop {
  status: "STOPPED";
  reason: "live_threshold_unapproved";
  message: string;
  correlation_id: string;
  live_threshold_state: "UNAPPROVED";
}

/** Pure response builder exported for repository-only contract tests. */
export function buildRepositoryOnlyStop(now = new Date()): RepositoryOnlyStop {
  return {
    status: "STOPPED",
    reason: "live_threshold_unapproved",
    message:
      "Repository-only build; authentication, ServiceTitan contact, Base44 production access, and live evidence generation are not authorized.",
    correlation_id: `${STAGE_2E7_CORRELATION_PREFIX}-${now.toISOString()}`,
    live_threshold_state: LIVE_THRESHOLD.state,
  };
}

export default function (_req: Request): Response {
  return Response.json(buildRepositoryOnlyStop(), { status: 503 });
}
