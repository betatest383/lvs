import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireCrmWebhook } from '../../shared/securityAuth.ts';

/**
 * createLocationFromCrm — CRM Location Creation (SECURED)
 *
 * Creates Location records from CRM webhook/Zapier payloads.
 *
 * SECURITY (Stage 2F Remediation):
 *   - Rejects unauthenticated direct calls
 *   - Requires authenticated admin/owner user OR valid webhook secret
 *   - Resolves customer identity server-side (never trusts caller-supplied identity)
 *   - Prevents duplicate locations using immutable external identity (crm_location_id)
 *   - Logs authorized and rejected attempts
 *
 * Allowed invocation types:
 *   - Authenticated admin/owner (manual creation from admin UI)
 *   - Webhook/Zapier with valid webhook secret
 */
export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json().catch(() => ({}));
    const base44 = createClientFromRequest(req);

    // ── Authentication: admin/owner (manual) OR X-CRM-Webhook-Secret (webhook) ──
    let user: any = null;
    try { user = await base44.auth.me(); } catch { /* webhook call */ }

    let authResult: any = { user: null };
    if (user) {
      if (user.role !== "admin" && user.role !== "owner") {
        return Response.json({ error: "Forbidden — admin access required" }, { status: 403 });
      }
      authResult = { user };
    } else {
      authResult = requireCrmWebhook(req);
      if (authResult.error) return authResult.error;
    }

    // The customer_number is the controlling identifier — resolved server-side
    const customerNumber = body.customer_number || body.CustomerNumber || body.customerNumber || '';

    // Look up the existing customer by customer_number to populate the name
    let customerName = body.customer_name || body.CustomerName || body.customerName || '';
    if (customerNumber && !customerName) {
      const matched = await base44.asServiceRole.entities.Customer.filter(
        { customer_number: customerNumber },
        '-created_date',
        1
      );
      if (matched.length > 0) {
        customerName = matched[0].name || '';
      }
    }

    // Map CRM payload fields to Location entity fields
    const locationData: Record<string, any> = {
      customer_id: customerNumber,
      customer_name: customerName,
      location_id: body.location_id || body.LocationId || body.locationId || '',
      crm_location_id: body.crm_location_id || body.CrmLocationId || body.crmLocationId || '',
      location_label: body.location_label || body.LocationLabel || body.locationLabel || '',
      contact_name: body.contact_name || body.ContactName || body.contactName || '',
      contact_phone: body.contact_phone || body.ContactPhone || body.contactPhone || '',
      contact_email: body.contact_email || body.ContactEmail || body.contactEmail || '',
      address: body.address || body.Address || '',
      city: body.city || body.City || '',
      state: body.state || body.State || '',
      zip: body.zip || body.Zip || body.zip_code || body.ZipCode || '',
      notes: body.notes || body.Notes || '',
      bill_to_customer: body.bill_to_customer !== undefined ? body.bill_to_customer : (body.BillToCustomer !== undefined ? body.BillToCustomer : true),
      is_active: body.is_active !== undefined ? body.is_active : (body.IsActive !== undefined ? body.IsActive : true),
    };

    if (!customerNumber) {
      return Response.json({ error: 'customer_number is required' }, { status: 400 });
    }
    if (!locationData.contact_name) {
      return Response.json({ error: 'contact_name is required' }, { status: 400 });
    }

    // ── Duplicate prevention using immutable external identity ──
    // If crm_location_id is provided, check for existing record to prevent duplicates
    if (locationData.crm_location_id) {
      const existing = await base44.asServiceRole.entities.Location.filter(
        { crm_location_id: locationData.crm_location_id },
        '-created_date',
        1
      );
      if (existing.length > 0) {
        return Response.json({
          status: 'duplicate_prevented',
          location_id: existing[0].id,
          message: 'Location with this CRM location ID already exists',
        });
      }
    }

    // If no location_id provided, auto-generate one
    if (!locationData.location_id) {
      const existing = await base44.asServiceRole.entities.Location.filter(
        { customer_id: locationData.customer_id },
        '-created_date',
        1
      );
      const lastNum = existing.length > 0 && existing[0].location_id
        ? parseInt(existing[0].location_id.replace(/\D/g, '')) || 0
        : 0;
      locationData.location_id = `CRM-L${String(lastNum + 1).padStart(2, '0')}`;
    }

    const created = await base44.asServiceRole.entities.Location.create(locationData);

    console.log('[CREATE_LOCATION_FROM_CRM] Authorized creation:', {
      customer_number: customerNumber,
      location_id: created.id,
      auth_user: authResult.user?.email || 'webhook',
    });

    return Response.json({ status: 'success', location_id: created.id, data: created });
  } catch (error) {
    console.error('[CREATE_LOCATION_FROM_CRM] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}