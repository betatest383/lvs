/**
 * Stage 2E.7 Shadow Audit — Fail-closed read-only Base44 facade (D-A).
 *
 * The sole production-data access surface. Wraps the raw Base44 client's
 * `asServiceRole.entities` with per-entity Proxies that:
 *   - delegate ONLY approved read ops (filter/list/get/schema) to the underlying client;
 *   - throw `ProductionWriteDenied` BEFORE reaching the underlying client for any
 *     denied mutation op, nested-client access, or unknown/dynamic property;
 *   - record denied attempts without sensitive arguments.
 *
 * The raw Base44 client is never exposed downstream. Only this facade (and the
 * narrow ReadOnlyEntityAccess it produces) is permitted.
 */

import type { ReadOnlyEntityAccess, DenyRecord } from "./stStage2E7Types.ts";
import {
  APPROVED_READ_OPS,
  DENIED_WRITE_OPS,
  DENIED_NESTED,
} from "./stStage2E7ShadowAuditConfig.ts";

export class ProductionWriteDenied extends Error {
  constructor(entity: string, op: string) {
    super(`Production write denied: ${entity}.${op}`);
    this.name = "ProductionWriteDenied";
  }
}

export interface ReadOnlyFacade {
  asServiceRole: { entities: Record<string, ReadOnlyEntityAccess> };
  deniedAttempts: DenyRecord[];
  isLive: false;
}

function recordDeny(denied: DenyRecord[], entity: string, op: string): void {
  denied.push({
    entity,
    op,
    timestamp: new Date().toISOString(),
    argssummary: "[denied-args-redacted]",
  });
}

export function createReadOnlyFacade(rawClient: any): ReadOnlyFacade {
  const deniedAttempts: DenyRecord[] = [];
  const rawEntities = rawClient?.asServiceRole?.entities ?? {};
  const facadeEntities: Record<string, ReadOnlyEntityAccess> = {};

  for (const entityName of Object.keys(rawEntities)) {
    const entity = rawEntities[entityName];
    const handler: any = new Proxy(entity, {
      get(_target: any, prop: string) {
        // Approved read ops: delegate.
        if (APPROVED_READ_OPS.includes(prop as any)) {
          const fn = entity[prop];
          return typeof fn === "function" ? fn.bind(entity) : fn;
        }
        // Denied write ops: throw BEFORE delegation.
        if (DENIED_WRITE_OPS.includes(prop as any)) {
          return function (..._args: any[]) {
            recordDeny(deniedAttempts, entityName, String(prop));
            throw new ProductionWriteDenied(entityName, String(prop));
          };
        }
        // Denied nested client access.
        if (DENIED_NESTED.includes(prop as any)) {
          return function (..._args: any[]) {
            recordDeny(deniedAttempts, entityName, `nested:${String(prop)}`);
            throw new ProductionWriteDenied(entityName, `nested:${String(prop)}`);
          };
        }
        // Unknown / dynamic / newly-added property: deny.
        recordDeny(deniedAttempts, entityName, `unknown:${String(prop)}`);
        throw new ProductionWriteDenied(entityName, `unknown:${String(prop)}`);
      },
    });
    facadeEntities[entityName] = handler as ReadOnlyEntityAccess;
  }

  return {
    asServiceRole: { entities: facadeEntities },
    deniedAttempts,
    isLive: false,
  };
}