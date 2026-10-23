/**
 * ServiceTitan OAuth 2.0 Token Management
 *
 * Handles client-credentials flow token acquisition and caching for
 * ServiceTitan CRM v2 API access.
 *
 * Required secrets:
 *   SERVICETITAN_CLIENT_ID     — OAuth client ID
 *   SERVICETITAN_CLIENT_SECRET — OAuth client secret
 *   SERVICETITAN_APP_KEY       — Application key (ST-App-Key header)
 *   SERVICETITAN_ENVIRONMENT   — "production" or "integration"
 *
 * OAuth scope: tn.crm.customers:r (granted via developer app configuration)
 */

// ─── Token Cache ────────────────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

// ─── Environment URLs ───────────────────────────────────────────────────────

export function getTokenEndpoint(environment: string): string {
  return environment === "production"
    ? "https://auth.servicetitan.io/connect/token"
    : "https://auth.beta.servicetitan.io/connect/token";
}

export function getApiBaseUrl(environment: string): string {
  return environment === "production"
    ? "https://api.servicetitan.io"
    : "https://api.beta.servicetitan.io";
}

// ─── Token Acquisition ──────────────────────────────────────────────────────

/**
 * Get a valid OAuth access token, refreshing if necessary.
 * Uses client_credentials grant type.
 *
 * @throws if SERVICETITAN_CLIENT_ID or SERVICETITAN_CLIENT_SECRET is not set
 */
export async function getAccessToken(environment: string): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  const clientId = Deno.env.get("SERVICETITAN_CLIENT_ID");
  const clientSecret = Deno.env.get("SERVICETITAN_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error(
      "SERVICETITAN_CLIENT_ID and SERVICETITAN_CLIENT_SECRET must be set for API synchronization"
    );
  }

  const tokenEndpoint = getTokenEndpoint(environment);

  const body = new URLSearchParams();
  body.append("grant_type", "client_credentials");
  body.append("client_id", clientId);
  body.append("client_secret", clientSecret);

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    cachedToken = null;
    throw new Error(`OAuth token request failed (${response.status}): ${text}`);
  }

  const tokenData = await response.json();

  // Cache with 60s buffer before actual expiry
  const expiresIn = (tokenData.expires_in || 3600) - 60;
  cachedToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return tokenData.access_token;
}

/**
 * Clear the cached token (e.g. after a 401 response).
 */
export function clearCachedToken(): void {
  cachedToken = null;
}

/**
 * Get the ServiceTitan application key.
 * @throws if SERVICETITAN_APP_KEY is not set
 */
export function getAppKey(): string {
  const appKey = Deno.env.get("SERVICETITAN_APP_KEY");
  if (!appKey) {
    throw new Error("SERVICETITAN_APP_KEY must be set for API synchronization");
  }
  return appKey;
}

/**
 * Get the configured tenant ID.
 * @throws if SERVICETITAN_TENANT_ID is not set
 */
export function getTenantId(): string {
  const tenantId = Deno.env.get("SERVICETITAN_TENANT_ID");
  if (!tenantId) {
    throw new Error("SERVICETITAN_TENANT_ID must be set for API synchronization");
  }
  return tenantId;
}

/**
 * Get the configured environment.
 * Defaults to "production" if not set.
 */
export function getEnvironment(): string {
  const env = Deno.env.get("SERVICETITAN_ENVIRONMENT");
  return env === "integration" ? "integration" : "production";
}

// ─── API Request Helper ──────────────────────────────────────────────────────

export interface ApiRequestOptions {
  method?: string;
  params?: Record<string, string>;
  body?: any;
  timeoutMs?: number;
}

/**
 * Make an authenticated ServiceTitan API request.
 * Automatically includes Authorization header and ST-App-Key.
 *
 * Does NOT retry — callers should use retryWithBackoff for retry logic.
 */
export async function apiRequest(
  path: string,
  environment: string,
  options: ApiRequestOptions = {}
): Promise<any> {
  const token = await getAccessToken(environment);
  const appKey = getAppKey();
  const baseUrl = getApiBaseUrl(environment);

  let url = `${baseUrl}${path}`;
  if (options.params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value != null) searchParams.append(key, String(value));
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "ST-App-Key": appKey,
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401) {
    clearCachedToken();
    throw new ApiError("OAuth token expired or invalid (401)", 401, true);
  }

  if (response.status === 403) {
    const text = await response.text();
    throw new ApiError(`Forbidden (403): ${text}`, 403, false);
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    throw new ApiError(
      `Rate limited (429)${retryAfter ? ` — Retry-After: ${retryAfter}s` : ""}`,
      429,
      true,
      retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined
    );
  }

  if (response.status >= 500) {
    const text = await response.text();
    throw new ApiError(`Server error (${response.status}): ${text}`, response.status, true);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(`API request failed (${response.status}): ${text}`, response.status, false);
  }

  return response.json();
}

// ─── API Error ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  retryable: boolean;
  retryDelayMs?: number;

  constructor(
    message: string,
    statusCode: number,
    retryable: boolean,
    retryDelayMs?: number
  ) {
    super(message);
    this.name = "ApiError";
    this.retryable = retryable;
    this.retryDelayMs = retryDelayMs;
  }
}

// ─── Retry with Backoff ─────────────────────────────────────────────────────

/**
 * Retry a function with bounded exponential backoff.
 *
 * Retries on ApiError where retryable=true.
 * Delays: 2s, 4s, 8s, 16s, 32s (max 5 attempts).
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 5,
  baseDelayMs: number = 2000
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err instanceof ApiError && !err.retryable) {
        throw err;
      }
      if (attempt === maxAttempts - 1) {
        throw err;
      }
      const delay = err instanceof ApiError && err.retryDelayMs
        ? err.retryDelayMs
        : baseDelayMs * Math.pow(2, attempt);
      console.log(`[ST AUTH] Retry attempt ${attempt + 1}/${maxAttempts} after ${delay}ms: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}