/**
 * ServiceTitan Appointment Sync — Configuration & Watermark Wiring
 *
 * Wires the generic sync engine to the Appointment domain.
 * This is the single place where Appointment-specific config lives.
 */

import type { WatermarkConfig, LockConfig, PreflightConfig, RecoveryScanConfig } from "./stSync/stSyncTypes.ts";

// ─── Constants ────────────────────────────────────────────────────────────────

export const APPOINTMENT_WATERMARK_KEY = "appointment_go_live";
export const APPOINTMENT_SYNC_STRATEGY = "new_and_active_appointments_only";
export const APPOINTMENT_DOMAIN = "appointment";
export const APPOINTMENT_INTEGRATION_NAME = "servicetitan_appointment_sync";

/** JPM v2 appointments endpoint */
export const APPOINTMENTS_API_PATH = (tenantId: string) =>
  `/jpm/v2/tenant/${tenantId}/appointments`;

export const APPOINTMENT_PAGE_SIZE = 50;
export const APPOINTMENT_MAX_PAGES = 100;

// ─── Configs ─────────────────────────────────────────────────────────────────

export const appointmentWatermarkConfig: WatermarkConfig = {
  entityName: "AppointmentSyncWatermark",
  watermarkKey: APPOINTMENT_WATERMARK_KEY,
  syncStrategy: APPOINTMENT_SYNC_STRATEGY,
  defaultOverlapMinutes: 5,
};

export const appointmentLockConfig: LockConfig = {
  entityName: "ServiceTitanSyncCursor",
  lockDurationMinutes: 10,
};

export const appointmentPreflightConfig: PreflightConfig = {
  domain: APPOINTMENT_DOMAIN,
  watermarkEntityName: "AppointmentSyncWatermark",
  watermarkKey: APPOINTMENT_WATERMARK_KEY,
  apiEndpoint: "", // Set dynamically — see activateAppointmentSync
  expectedSyncStrategy: APPOINTMENT_SYNC_STRATEGY,
  deferredEntityName: "DeferredDependentRecord",
};

/**
 * Build the preflight config with the tenant-specific API endpoint.
 */
export function buildAppointmentPreflightConfig(tenantId: string): PreflightConfig {
  return {
    ...appointmentPreflightConfig,
    apiEndpoint: APPOINTMENTS_API_PATH(tenantId),
  };
}