/**
 * Outbound Failure Classification (Stage 2B-A)
 *
 * Classifies outbound push failures into specific categories so that retry
 * behavior and diagnostics can reflect the failure type.
 *
 * Only retryable failure types are retried. Non-retryable failures
 * dead-letter immediately.
 */

export type OutboundFailureType =
  | "oauth_expired"
  | "oauth_scope_insufficient"
  | "invalid_request_payload"
  | "mapping_failure"
  | "validation_error"
  | "duplicate_conflict"
  | "network_failure"
  | "rate_limiting"
  | "servicetitan_5xx"
  | "retry_exhausted"
  | "unknown";

export interface ClassifiedFailure {
  failure_type: OutboundFailureType;
  retryable: boolean;
  error: string;
}

/**
 * Classify an outbound API error into a specific failure type.
 *
 * Retryable types:
 *   - oauth_expired (401) — token refresh will happen on retry
 *   - network_failure — transient
 *   - rate_limiting (429) — retry after delay
 *   - servicetitan_5xx — transient server error
 *
 * Non-retryable types:
 *   - oauth_scope_insufficient (403) — requires OAuth app reconfiguration
 *   - invalid_request_payload (400) — data issue, won't fix on retry
 *   - mapping_failure — data transformation issue
 *   - validation_error (422) — ST rejected the payload
 *   - duplicate_conflict (409) — ST already has this customer
 *   - retry_exhausted — max attempts reached
 *   - unknown — unclassified, default non-retryable for safety
 */
export function classifyOutboundFailure(
  error: any,
  statusCode?: number,
  responseBody?: string
): ClassifiedFailure {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  const body = responseBody || "";
  const code = statusCode || 0;

  // OAuth token expired (401)
  if (code === 401 || message.includes("401") || message.includes("token expired")) {
    return { failure_type: "oauth_expired", retryable: true, error: message };
  }

  // OAuth scope insufficient (403)
  if (code === 403 || message.includes("403") || message.includes("Forbidden")) {
    return {
      failure_type: "oauth_scope_insufficient",
      retryable: false,
      error: `OAuth scope insufficient (403): ${body || message}. Outbound writes require a write scope — update the OAuth app in the ServiceTitan developer portal.`,
    };
  }

  // Rate limiting (429)
  if (code === 429 || message.includes("429") || message.includes("Rate limited")) {
    return { failure_type: "rate_limiting", retryable: true, error: message };
  }

  // Duplicate conflict (409)
  if (code === 409 || message.includes("409") || body.includes("conflict") || body.includes("duplicate")) {
    return { failure_type: "duplicate_conflict", retryable: false, error: `Duplicate conflict (409): ${body || message}` };
  }

  // Validation error (422)
  if (code === 422 || message.includes("422") || body.includes("validation")) {
    return { failure_type: "validation_error", retryable: false, error: `Validation error (422): ${body || message}` };
  }

  // Invalid request payload (400)
  if (code === 400 || message.includes("400") || message.includes("Bad Request")) {
    return { failure_type: "invalid_request_payload", retryable: false, error: `Invalid request (400): ${body || message}` };
  }

  // ServiceTitan 5xx errors
  if (code >= 500 || message.includes("Server error") || message.includes("5")) {
    if (message.includes("502") || message.includes("503") || message.includes("504") || code >= 500) {
      return { failure_type: "servicetitan_5xx", retryable: true, error: `ServiceTitan server error (${code}): ${body || message}` };
    }
  }

  // Network failure (fetch threw, no response)
  if (message.includes("fetch") || message.includes("network") || message.includes("ECONNREFUSED") || message.includes("timeout") || message.includes("NetworkError")) {
    return { failure_type: "network_failure", retryable: true, error: message };
  }

  // Retry exhausted
  if (message.includes("Retry") && message.includes("attempt")) {
    return { failure_type: "retry_exhausted", retryable: false, error: message };
  }

  // Mapping failure (data transformation issue)
  if (message.includes("Missing required field") || message.includes("Cannot push") || message.includes("mapping")) {
    return { failure_type: "mapping_failure", retryable: false, error: message };
  }

  // Unknown — default non-retryable for safety
  return { failure_type: "unknown", retryable: false, error: message };
}

/**
 * Determine the retry delay based on failure type.
 * Returns milliseconds, or null for non-retryable failures.
 */
export function getRetryDelay(failureType: OutboundFailureType, attempt: number): number | null {
  const base = 2000;
  const exponential = base * Math.pow(2, attempt);

  switch (failureType) {
    case "oauth_expired":
      return 1000; // quick — token refreshes on retry
    case "rate_limiting":
      return 30000; // 30s — let rate limit cool down
    case "network_failure":
      return exponential; // 2s, 4s, 8s...
    case "servicetitan_5xx":
      return exponential; // 2s, 4s, 8s...
    default:
      return null; // non-retryable
  }
}