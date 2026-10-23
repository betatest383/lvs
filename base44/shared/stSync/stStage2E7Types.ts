/**
 * Stage 2E.7 Shadow Audit — Narrow interface types.
 *
 * Runtime and test-only. Pure type module; no runtime side effects.
 * These interfaces are the ONLY shapes downstream modules accept (never `any`
 * holding a raw Base44 client).
 */

// Approved read-only entity access surface.
export interface ReadOnlyEntityAccess<TEntity = any> {
  filter(query?: any, sort?: string, limit?: number): Promise<TEntity[]>;
  list(sort?: string, limit?: number): Promise<TEntity[]>;
  get(id: string): Promise<TEntity | null>;
  schema?(): Promise<any>;
}

// In-memory projection entity handler. Mutation methods are present here because
// the projection is the ONLY place mutation is allowed (against in-memory state).
export interface ProjectionEntityHandler<TEntity = any> {
  filter(query?: any, sort?: string, limit?: number): Promise<TEntity[]>;
  list(sort?: string, limit?: number): Promise<TEntity[]>;
  get(id: string): Promise<TEntity | null>;
  create(data: any): Promise<TEntity>;
  update(id: string, data: any): Promise<TEntity>;
  delete(id: string): Promise<void>;
  bulkCreate(items: any[]): Promise<TEntity[]>;
  bulkUpdate(items: any[]): Promise<TEntity[]>;
  updateMany(query: any, update: any): Promise<any>;
  deleteMany(query: any): Promise<any>;
}

export interface ProjectionClient {
  asServiceRole: { entities: Record<string, ProjectionEntityHandler> };
}

// Plain-data seed package. No client references.
export interface SeedPackage {
  purchaseOrders: any[];
  purchaseOrderLines: any[];
  vendors: any[];
  warehouses: any[];
  materials: any[];
  watermark: any | null;
  cursor: any | null;
  deferred: any[];
  inventoryTransactions: any[];
  receipts: any[];
  bills: any[];
  transfers: any[];
  adjustments: any[];
  businessEvents: any[];
  webhookEvents: any[];
  readLog: { entity: string; query: any; count: number; timestamp: string }[];
}

export interface SanitizedInput {
  correlationId: string;
  records: any[];
}

export interface DenyRecord {
  entity: string;
  op: string;
  timestamp: string;
  argssummary: string;
}

export interface ResponseEnvelope {
  envelope_version: string;
  correlation_id: string;
  canonical_payload: string;
  canonical_payload_byte_length: number;
  canonical_payload_sha256: string;
}

export interface IdentityRecord {
  repositoryPath: string | null;
  sourceSha256: string | null;
  revision: string | null;
  environment: string | null;
  correlationId: string;
  disclosedLimitations: string[];
}

export interface ScopeSnapshot {
  entity: string;
  count: number;
  sha256: string;
  serialized: string;
}

export type Disposition =
  | "PASS"
  | "FAIL"
  | "STOPPED"
  | "UNAVAILABLE"
  | "INCOMPLETE"
  | "PENDING POST-RUN FREEZE"
  | "DISCLOSED NON-BLOCKING LIMITATION — Q5";

export interface TestResult {
  id: string;
  passed: boolean;
  expected: string;
  actual: string;
  classification: Disposition | "N/A";
}