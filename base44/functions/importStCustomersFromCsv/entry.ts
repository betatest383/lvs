import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

/**
 * One-time, admin-only ServiceTitan Customer import from a CSV export.
 *
 * Strict matching: a Base44 Customer is matched SOLELY by
 * `servicetitan_customer_id === Customer ID`. Name, email, phone, and address
 * are NEVER used for matching.
 *
 * Behavior per row:
 *   - If a Customer with that servicetitan_customer_id already exists → SKIP
 *     (never overwrite, never duplicate).
 *   - If absent → CREATE with:
 *       servicetitan_customer_id = Customer ID
 *       name                    = Customer Name
 *       email / alt_email       = first / second value from comma-separated Email
 *       phone / alt_phone       = first / second value from comma-separated Phone Number
 *       billing_address         = Full Address
 *       servicetitan_sync_status = synced
 *       servicetitan_source      = api
 *       import_source            = api_export
 *   - Invalid rows (missing Customer ID or missing Customer Name) are skipped
 *     and reported, never guessed.
 *
 * Safety:
 *   - Admin/owner only (base44.auth.me() role check), else 403.
 *   - Processes in batches of 100.
 *   - Idempotent / safe to rerun: every batch re-checks existence before create.
 *   - Never creates Locations, Jobs, or Appointments.
 *   - Never deletes or merges Base44 records.
 *
 * Payload:
 *   { file_url: string, dry_run?: boolean, limit?: number, offset?: number }
 *
 * Response:
 *   { dry_run, offset, total_rows_in_file, processed, created_count,
 *     skipped_count, error_count, created:[...], skipped_existing:[...],
 *     errors:[...], report_url?: string }
 *
 * For dry_run, the created/skipped/errors arrays are returned inline (small).
 * For a real run, a CSV report is uploaded (best-effort) and report_url returned;
 * counts are always returned.
 */

const BATCH_SIZE = 100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// RFC-4180-ish CSV parser: handles quoted fields, escaped quotes, commas in quotes.
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field); field = "";
      } else if (c === "\n") {
        row.push(field); rows.push(row); row = []; field = "";
      } else if (c === "\r") {
        // ignore
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function splitList(val) {
  if (!val) return [];
  return val.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

function csvEscape(v) {
  if (v === undefined || v === null) return "";
  const s = String(v);
  if (s.indexOf(",") >= 0 || s.indexOf('"') >= 0 || s.indexOf("\n") >= 0) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildReportCsv(report) {
  const lines = [];
  lines.push("Section,servicetitan_customer_id,base44_id,name,reason");
  for (const c of report.created) {
    lines.push(["created", c.servicetitan_customer_id, c.base44_id || "", c.name, ""].map(csvEscape).join(","));
  }
  for (const s of report.skipped_existing) {
    lines.push(["skipped_existing", s.servicetitan_customer_id, "", "", ""].map(csvEscape).join(","));
  }
  for (const e of report.errors) {
    lines.push(["error", e.customer_id || "", "", "", e.reason].map(csvEscape).join(","));
  }
  return lines.join("\n");
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // ── Admin/owner auth ──
    const user = await base44.auth.me();
    if (!user || (user.role !== "admin" && user.role !== "owner")) {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const file_url = body.file_url;
    const dry_run = !!body.dry_run;
    const limit = body.limit ? Number(body.limit) : 0; // 0 = all
    const offset = body.offset ? Number(body.offset) : 0;
    if (!file_url) {
      return Response.json({ error: "file_url is required" }, { status: 422 });
    }

    // ── Fetch CSV ──
    const resp = await fetch(file_url);
    if (!resp.ok) {
      return Response.json({ error: "Failed to fetch CSV", status: resp.status }, { status: 502 });
    }
    const text = await resp.text();
    const rows = parseCSV(text);

    // ── Locate header row ──
    let headerIdx = -1;
    let colMap = null;
    for (let i = 0; i < rows.length && i < 30; i++) {
      const r = rows[i];
      if (r && r[0] && String(r[0]).trim().toLowerCase() === "customer id") {
        headerIdx = i;
        colMap = {};
        for (let c = 0; c < r.length; c++) {
          const h = String(r[c]).trim().toLowerCase();
          if (h === "customer id") colMap.id = c;
          else if (h === "customer name") colMap.name = c;
          else if (h === "phone number") colMap.phone = c;
          else if (h === "email") colMap.email = c;
          else if (h === "full address") colMap.address = c;
        }
        break;
      }
    }
    if (headerIdx < 0 || !colMap || colMap.id === undefined || colMap.name === undefined) {
      return Response.json({ error: "Could not locate header row with Customer ID and Customer Name columns" }, { status: 422 });
    }

    // ── Data rows (skip fully blank lines) ──
    const dataRows = rows.slice(headerIdx + 1).filter(
      (r) => r && r.length > 0 && r.some((v) => String(v).trim() !== "")
    );
    const start = offset;
    const end = limit > 0 ? Math.min(start + limit, dataRows.length) : dataRows.length;
    const slice = dataRows.slice(start, end);

    const report = {
      dry_run,
      offset: start,
      total_rows_in_file: dataRows.length,
      processed: 0,
      created: [],
      skipped_existing: [],
      errors: [],
    };

    // ── Process in batches of 100 ──
    for (let i = 0; i < slice.length; i += BATCH_SIZE) {
      const batch = slice.slice(i, i + BATCH_SIZE);
      const validated = [];
      for (let j = 0; j < batch.length; j++) {
        const r = batch[j];
        const absRowIdx = start + i + j;
        const stId = r[colMap.id] !== undefined ? String(r[colMap.id]).trim() : "";
        const name = r[colMap.name] !== undefined ? String(r[colMap.name]).trim() : "";
        if (!stId) { report.errors.push({ row_index: absRowIdx, reason: "missing Customer ID" }); continue; }
        if (!name) { report.errors.push({ row_index: absRowIdx, customer_id: stId, reason: "missing Customer Name" }); continue; }
        const phones = colMap.phone !== undefined ? splitList(String(r[colMap.phone] || "")) : [];
        const emails = colMap.email !== undefined ? splitList(String(r[colMap.email] || "")) : [];
        const address = colMap.address !== undefined ? String(r[colMap.address] || "").trim() : "";
        validated.push({
          stId, name, address,
          row_index: absRowIdx,
          email: emails[0] && EMAIL_RE.test(emails[0]) ? emails[0] : "",
          alt_email: emails[1] && EMAIL_RE.test(emails[1]) ? emails[1] : "",
          phone: phones[0] || "",
          alt_phone: phones[1] || "",
        });
      }
      if (validated.length === 0) continue;

      // ── Batch existence check (strict: servicetitan_customer_id only) ──
      const ids = validated.map((v) => v.stId);
      const existing = new Set();
      try {
        const found = await base44.asServiceRole.entities.Customer.filter(
          { servicetitan_customer_id: { $in: ids } },
          "-created_date",
          ids.length
        );
        for (const c of (found || [])) {
          if (c.servicetitan_customer_id) existing.add(String(c.servicetitan_customer_id));
        }
      } catch (e) {
        // Fallback: per-id lookup if $in unsupported
        for (const id of ids) {
          try {
            const f = await base44.asServiceRole.entities.Customer.filter(
              { servicetitan_customer_id: id }, "-created_date", 1
            );
            if (f && f.length) existing.add(id);
          } catch { /* ignore individual lookup failure */ }
        }
      }

      const toCreate = [];
      for (const v of validated) {
        if (existing.has(v.stId)) {
          report.skipped_existing.push({ servicetitan_customer_id: v.stId });
        } else {
          toCreate.push(v);
        }
      }

      // ── Create (real run only) ──
      if (toCreate.length === 0) {
        report.processed += validated.length;
        continue;
      }

      if (dry_run) {
        for (const v of toCreate) {
          report.created.push({ servicetitan_customer_id: v.stId, base44_id: null, name: v.name });
        }
        report.processed += validated.length;
        continue;
      }

      const payloads = toCreate.map((v) => {
        const p = {
          servicetitan_customer_id: v.stId,
          name: v.name,
          servicetitan_sync_status: "synced",
          servicetitan_source: "api",
          import_source: "api_export",
        };
        if (v.email) p.email = v.email;
        if (v.alt_email) p.alt_email = v.alt_email;
        if (v.phone) p.phone = v.phone;
        if (v.alt_phone) p.alt_phone = v.alt_phone;
        if (v.address) p.billing_address = v.address;
        return p;
      });

      let createdRecs = [];
      try {
        createdRecs = await base44.asServiceRole.entities.Customer.bulkCreate(payloads);
      } catch (e) {
        // Fallback: individual creates so one bad row doesn't fail the batch
        for (let k = 0; k < payloads.length; k++) {
          try {
            const rec = await base44.asServiceRole.entities.Customer.create(payloads[k]);
            createdRecs.push(rec);
          } catch (err) {
            report.errors.push({
              row_index: toCreate[k].row_index,
              customer_id: toCreate[k].stId,
              reason: String(err && err.message ? err.message : err),
            });
            createdRecs.push(null);
          }
        }
      }

      // Map created records back (align by order; nulls = errored)
      for (let k = 0; k < toCreate.length; k++) {
        const rec = createdRecs[k];
        if (rec && rec.id) {
          report.created.push({
            servicetitan_customer_id: toCreate[k].stId,
            base44_id: rec.id,
            name: toCreate[k].name,
          });
        }
      }
      report.processed += validated.length;
    }

    report.created_count = report.created.length;
    report.skipped_count = report.skipped_existing.length;
    report.error_count = report.errors.length;

    // ── Best-effort CSV report upload ──
    let report_url = null;
    try {
      const csv = buildReportCsv(report);
      const file = new File([csv], "st_customer_import_report.csv", { type: "text/csv" });
      const up = await base44.asServiceRole.integrations.Core.UploadFile({ file });
      if (up && up.file_url) report_url = up.file_url;
    } catch (e) {
      report.report_upload_error = String(e && e.message ? e.message : e);
    }

    // For a real (non-dry) run, keep the response small: return counts + report URL.
    // For dry runs, return the full arrays inline so the caller can review rows.
    const responsePayload = dry_run
      ? report
      : {
          dry_run,
          offset: report.offset,
          total_rows_in_file: report.total_rows_in_file,
          processed: report.processed,
          created_count: report.created_count,
          skipped_count: report.skipped_count,
          error_count: report.error_count,
          report_url,
          report_upload_error: report.report_upload_error || undefined,
          errors: report.errors, // include errors inline (usually small)
        };
    if (report_url) responsePayload.report_url = report_url;

    return Response.json(responsePayload, { status: 200 });
  } catch (error) {
    return Response.json({ error: error && error.message ? error.message : String(error) }, { status: 500 });
  }
}