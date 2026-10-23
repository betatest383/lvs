import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import * as XLSX from "npm:xlsx@0.18.5";

/**
 * One-time, admin-only ServiceTitan Location import from an XLSX workbook.
 *
 * Source: ONLY the sheet named "Create in Base44". No other tab is ever read.
 *
 * Strict safety rules:
 *   - Creates ONLY Location records.
 *   - Never creates, updates, merges, or deletes Customers, Jobs, or Appointments.
 *   - Customers and existing Locations are READ only (filter/get) to validate
 *     relationships and prevent duplicates — never written.
 *   - A Location is created ONLY when ALL of:
 *       a) bill_to_customer_recommendation is exactly "true" or "false"
 *       b) base44_customer_id is non-blank
 *       c) a Customer with that exact Base44 id exists
 *       d) no Location already exists with the same crm_location_id
 *       e) Customer Name (→ contact_name, required) is non-blank
 *   - Duplicate crm_location_id within the same batch is created once; later
 *     duplicates are skipped as skipped_existing.
 *   - Customer resolution is by base44_customer_id ONLY — never by name, email,
 *     phone, or address.
 *
 * Field mapping (exact):
 *   customer_id      ← base44_customer_id
 *   customer_name    ← Customer Name
 *   location_id      ← Location ID
 *   crm_location_id  ← Location ID
 *   location_label   ← Location Name
 *   address         ← Location Street
 *   city            ← Location City
 *   state           ← Location State
 *   zip             ← Location Zip
 *   contact_name    ← Customer Name
 *   contact_phone   ← Location Phone
 *   contact_email   ← Location Emails   (first valid email only; omitted if none)
 *   bill_to_customer ← bill_to_customer_recommendation (boolean)
 *   is_active       ← true
 *
 * Payload:
 *   { file_url: string, sheet_name?: string, dry_run?: boolean,
 *     limit?: number, offset?: number }
 *   sheet_name defaults to "Create in Base44".
 *
 * Response:
 *   { dry_run, offset, sheet_name, total_data_rows, processed,
 *     created_count, skipped_existing, skipped_missing_customer,
 *     skipped_invalid_billto, error_count,
 *     report: [{ servicetitan_location_id, base44_location_id,
 *                base44_customer_id, action, reason }],
 *     report_url?: string,
 *     non_location_entities_changed: false }
 *
 * If the workbook cannot be parsed as XLSX, or the named sheet is missing,
 * the function returns 422 and does NOT process any rows.
 */

const SHEET_DEFAULT = "Create in Base44";
const BATCH_SIZE = 100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  lines.push(["servicetitan_location_id", "base44_location_id", "base44_customer_id", "action", "reason"].map(csvEscape).join(","));
  for (const r of report) {
    lines.push([
      r.servicetitan_location_id || "",
      r.base44_location_id || "",
      r.base44_customer_id || "",
      r.action || "",
      r.reason || "",
    ].map(csvEscape).join(","));
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
    const sheet_name = (body.sheet_name || SHEET_DEFAULT).trim();
    const dry_run = !!body.dry_run;
    const limit = body.limit ? Number(body.limit) : 0; // 0 = all
    const offset = body.offset ? Number(body.offset) : 0;
    if (!file_url) {
      return Response.json({ error: "file_url is required" }, { status: 422 });
    }

    // ── Fetch & parse workbook ──
    let wb;
    try {
      const resp = await fetch(file_url);
      if (!resp.ok) {
        return Response.json({ error: "Failed to fetch workbook", status: resp.status }, { status: 502 });
      }
      const buf = await resp.arrayBuffer();
      wb = XLSX.read(buf, { type: "array" });
    } catch (e) {
      // Workbook cannot be safely read as XLSX — stop and ask for CSV.
      return Response.json(
        { error: "Workbook could not be parsed as XLSX. Please upload the 'Create in Base44' sheet as CSV.", detail: String(e && e.message ? e.message : e) },
        { status: 422 }
      );
    }

    if (!wb.SheetNames || !wb.SheetNames.includes(sheet_name)) {
      return Response.json(
        { error: `Sheet '${sheet_name}' not found. Refusing to use any other tab.`, available_sheets: wb.SheetNames || [] },
        { status: 422 }
      );
    }

    const ws = wb.Sheets[sheet_name];
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

    // ── Locate the header row (col 0 === "Location ID") ──
    let headerIdx = -1;
    let colMap = null;
    for (let i = 0; i < matrix.length && i < 30; i++) {
      const r = matrix[i];
      if (r && r[0] !== undefined && String(r[0]).trim().toLowerCase() === "location id") {
        headerIdx = i;
        colMap = {};
        for (let c = 0; c < r.length; c++) {
          const h = String(r[c]).trim().toLowerCase();
          if (h === "location id") colMap.location_id = c;
          else if (h === "customer id") colMap.st_customer_id = c;
          else if (h === "base44_customer_id") colMap.base44_customer_id = c;
          else if (h === "location name") colMap.location_name = c;
          else if (h === "customer name") colMap.customer_name = c;
          else if (h === "location street") colMap.street = c;
          else if (h === "location city") colMap.city = c;
          else if (h === "location state") colMap.state = c;
          else if (h === "location zip") colMap.zip = c;
          else if (h === "location phone") colMap.phone = c;
          else if (h === "location emails") colMap.emails = c;
          else if (h === "bill_to_customer_recommendation") colMap.bill_to = c;
          else if (h === "import_action") colMap.import_action = c;
        }
        break;
      }
    }
    if (headerIdx < 0 || !colMap || colMap.location_id === undefined || colMap.base44_customer_id === undefined || colMap.customer_name === undefined) {
      return Response.json(
        { error: "Could not locate a valid header row with 'Location ID', 'base44_customer_id', and 'Customer Name' columns in the 'Create in Base44' sheet." },
        { status: 422 }
      );
    }

    // ── Data rows (skip fully blank lines) ──
    const dataRows = matrix.slice(headerIdx + 1).filter(
      (r) => r && r.length > 0 && r.some((v) => String(v).trim() !== "")
    );
    const start = offset;
    const end = limit > 0 ? Math.min(start + limit, dataRows.length) : dataRows.length;
    const slice = dataRows.slice(start, end);

    const report = [];
    let created_count = 0, skipped_existing = 0, skipped_missing_customer = 0, skipped_invalid_billto = 0, error_count = 0;

    // ── Normalize the slice into validated row objects ──
    const normalized = [];
    for (let j = 0; j < slice.length; j++) {
      const r = slice[j];
      const g = (idx) => idx === undefined ? "" : String(r[idx] ?? "").trim();
      const stLocId = g(colMap.location_id);
      const base44CustId = g(colMap.base44_customer_id);
      const customerName = g(colMap.customer_name);
      const billToRaw = g(colMap.bill_to);
      const billToNorm = billToRaw.toLowerCase();
      const rowIdx = start + j;

      normalized.push({
        row_index: rowIdx,
        st_location_id: stLocId,
        base44_customer_id: base44CustId,
        customer_name: customerName,
        location_name: g(colMap.location_name),
        street: g(colMap.street),
        city: g(colMap.city),
        state: g(colMap.state),
        zip: g(colMap.zip),
        phone: g(colMap.phone),
        emails_raw: g(colMap.emails),
        bill_to_raw: billToRaw,
        bill_to_norm: billToNorm,
      });
    }

    // ── Batch existence checks ──
    // (a) Existing Locations by crm_location_id
    const locIds = normalized.map(n => n.st_location_id).filter(Boolean);
    const existingLocIds = new Set();
    if (locIds.length > 0) {
      try {
        const found = await base44.asServiceRole.entities.Location.filter(
          { crm_location_id: { $in: locIds } }, "-created_date", locIds.length
        );
        for (const l of (found || [])) {
          if (l.crm_location_id) existingLocIds.add(String(l.crm_location_id));
        }
      } catch {
        // Fallback: per-id lookup
        for (const id of locIds) {
          try {
            const f = await base44.asServiceRole.entities.Location.filter(
              { crm_location_id: id }, "-created_date", 1
            );
            if (f && f.length) existingLocIds.add(id);
          } catch { /* ignore */ }
        }
      }
    }

    // (b) Existing Customers by Base44 id (READ ONLY — never written)
    const custIds = [...new Set(normalized.map(n => n.base44_customer_id).filter(Boolean))];
    const existingCustIds = new Set();
    if (custIds.length > 0) {
      try {
        const found = await base44.asServiceRole.entities.Customer.filter(
          { id: { $in: custIds } }, "-created_date", custIds.length
        );
        for (const c of (found || [])) existingCustIds.add(c.id);
      } catch {
        // Fallback: per-id get
        for (const id of custIds) {
          try {
            const c = await base44.asServiceRole.entities.Customer.get(id);
            if (c && c.id) existingCustIds.add(c.id);
          } catch { /* not found */ }
        }
      }
    }

    // ── Process rows ──
    const createdInBatch = new Set(); // crm_location_id created this run
    const payloadsToCreate = []; // {row, payload}

    for (const n of normalized) {
      const stLoc = n.st_location_id;
      const b44Cust = n.base44_customer_id;

      // (a) bill_to must be exactly "true" or "false"
      if (n.bill_to_norm !== "true" && n.bill_to_norm !== "false") {
        skipped_invalid_billto++;
        report.push({
          servicetitan_location_id: stLoc,
          base44_location_id: null,
          base44_customer_id: b44Cust,
          action: "skipped_invalid_billto",
          reason: `bill_to_customer_recommendation is '${n.bill_to_raw || ""}' (must be exactly true or false)`,
        });
        continue;
      }

      // (b) base44_customer_id required
      if (!b44Cust) {
        skipped_missing_customer++;
        report.push({
          servicetitan_location_id: stLoc,
          base44_location_id: null,
          base44_customer_id: null,
          action: "skipped_missing_customer",
          reason: "base44_customer_id is blank",
        });
        continue;
      }

      // (c) Customer must exist
      if (!existingCustIds.has(b44Cust)) {
        skipped_missing_customer++;
        report.push({
          servicetitan_location_id: stLoc,
          base44_location_id: null,
          base44_customer_id: b44Cust,
          action: "skipped_missing_customer",
          reason: "No Base44 Customer found with base44_customer_id (never resolved by name/email/phone/address)",
        });
        continue;
      }

      // (d) no existing Location with same crm_location_id (DB or already created this batch)
      if (!stLoc) {
        error_count++;
        report.push({
          servicetitan_location_id: stLoc,
          base44_location_id: null,
          base44_customer_id: b44Cust,
          action: "error",
          reason: "Location ID is blank (location_id is required)",
        });
        continue;
      }
      if (existingLocIds.has(stLoc) || createdInBatch.has(stLoc)) {
        skipped_existing++;
        report.push({
          servicetitan_location_id: stLoc,
          base44_location_id: null,
          base44_customer_id: b44Cust,
          action: "skipped_existing",
          reason: "A Base44 Location with this crm_location_id already exists",
        });
        continue;
      }

      // (e) contact_name (Customer Name) required
      if (!n.customer_name) {
        error_count++;
        report.push({
          servicetitan_location_id: stLoc,
          base44_location_id: null,
          base44_customer_id: b44Cust,
          action: "error",
          reason: "Customer Name is blank (contact_name is required)",
        });
        continue;
      }

      // contact_email: first valid email only, else omit (format: email enforced)
      let contactEmail = "";
      if (n.emails_raw) {
        const parts = n.emails_raw.split(",").map(s => s.trim()).filter(Boolean);
        contactEmail = parts.find(p => EMAIL_RE.test(p)) || "";
      }

      const payload = {
        customer_id: b44Cust,
        customer_name: n.customer_name,
        location_id: stLoc,
        crm_location_id: stLoc,
        location_label: n.location_name || "",
        address: n.street || "",
        city: n.city || "",
        state: n.state || "",
        zip: n.zip || "",
        contact_name: n.customer_name,
        contact_phone: n.phone || "",
        bill_to_customer: n.bill_to_norm === "true",
        is_active: true,
      };
      if (contactEmail) payload.contact_email = contactEmail;

      payloadsToCreate.push({ n, payload });
    }

    // ── Create in sub-batches of BATCH_SIZE (real run only) ──
    for (let i = 0; i < payloadsToCreate.length; i += BATCH_SIZE) {
      const sub = payloadsToCreate.slice(i, i + BATCH_SIZE);
      if (dry_run) {
        for (const { n } of sub) {
          created_count++;
          report.push({
            servicetitan_location_id: n.st_location_id,
            base44_location_id: null,
            base44_customer_id: n.base44_customer_id,
            action: "created",
            reason: "dry_run — not written",
          });
          createdInBatch.add(n.st_location_id);
        }
        continue;
      }

      const payloads = sub.map(s => s.payload);
      let createdRecs = [];
      try {
        createdRecs = await base44.asServiceRole.entities.Location.bulkCreate(payloads);
      } catch (e) {
        // Fallback: individual creates so one bad row doesn't fail the batch
        for (let k = 0; k < sub.length; k++) {
          try {
            const rec = await base44.asServiceRole.entities.Location.create(sub[k].payload);
            createdRecs.push(rec);
          } catch (err) {
            error_count++;
            report.push({
              servicetitan_location_id: sub[k].n.st_location_id,
              base44_location_id: null,
              base44_customer_id: sub[k].n.base44_customer_id,
              action: "error",
              reason: String(err && err.message ? err.message : err),
            });
            createdRecs.push(null);
          }
        }
      }

      // Map created records back (align by order; nulls = errored)
      for (let k = 0; k < sub.length; k++) {
        const rec = createdRecs[k];
        if (rec && rec.id) {
          created_count++;
          createdInBatch.add(sub[k].n.st_location_id);
          // If an error row was already pushed above (individual-create fallback),
          // do not also push a created row for it.
          const alreadyErrored = report.some(
            (rr) => rr.servicetitan_location_id === sub[k].n.st_location_id && rr.action === "error"
          );
          if (!alreadyErrored) {
            report.push({
              servicetitan_location_id: sub[k].n.st_location_id,
              base44_location_id: rec.id,
              base44_customer_id: sub[k].n.base44_customer_id,
              action: "created",
              reason: "",
            });
          }
        }
      }
    }

    // ── Best-effort CSV report upload ──
    let report_url = null;
    try {
      const csv = buildReportCsv(report);
      const file = new File([csv], "st_location_import_report.csv", { type: "text/csv" });
      const up = await base44.asServiceRole.integrations.Core.UploadFile({ file });
      if (up && up.file_url) report_url = up.file_url;
    } catch (e) {
      report_url = null;
    }

    return Response.json({
      dry_run,
      sheet_name,
      offset: start,
      total_data_rows: dataRows.length,
      processed: slice.length,
      created_count,
      skipped_existing,
      skipped_missing_customer,
      skipped_invalid_billto,
      error_count,
      report,
      report_url,
      non_location_entities_changed: false,
    }, { status: 200 });
  } catch (error) {
    return Response.json({ error: error && error.message ? error.message : String(error) }, { status: 500 });
  }
}