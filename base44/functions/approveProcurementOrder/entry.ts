import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
Deno.serve(async(req)=>{
 const base44=createClientFromRequest(req);
 try{
  const user=await base44.auth.me(); if(!user)return Response.json({error:'Unauthorized'},{status:401});
  const role=String(user.role||user.data?.role||'').toLowerCase().replace(/\s+/g,'_');
  if(!['owner','admin','warehouse_manager','procurement_manager','purchasing_manager'].includes(role))return Response.json({error:'Only Owner, Admin, Warehouse Manager, or Procurement Manager can approve and send a purchase order.'},{status:403});
  const {procurement_order_id}=await req.json(); if(!procurement_order_id)return Response.json({error:'procurement_order_id required'},{status:400});
  const po=await base44.asServiceRole.entities.ProcurementOrder.get(procurement_order_id);
  if(!po)return Response.json({error:'Purchase order not found'},{status:404});
  if(po.status==='sent_to_vendor')return Response.json({ok:true,idempotent:true,order:po});
  if(po.status!=='needs_review')return Response.json({error:'Only purchase orders in Needs Review can be approved'},{status:422});
  if(!po.vendor_email){await base44.asServiceRole.entities.ProcurementOrder.update(po.id,{status:'exception',email_error:'Vendor email is required before approval'});return Response.json({error:'Vendor email is missing; assign a vendor email before approval.'},{status:422})}
  let lines=[];try{lines=JSON.parse(po.line_items||'[]')}catch{}
  const esc=(v:any)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const rows=lines.map((l:any)=>'<tr><td>'+esc(l.item_name||'Item')+'</td><td>'+esc(l.sku||'')+'</td><td>'+esc(l.quantity_ordered||0)+'</td></tr>').join('');
  await base44.integrations.Core.SendEmail({to:po.vendor_email,subject:'Purchase Order '+(po.procurement_order_number||po.id),body:'<h2>Lehigh Valley Chimney Purchase Order '+esc(po.procurement_order_number||'')+'</h2><p>Job: '+esc(po.job_id)+'</p><table border="1" cellpadding="6"><tr><th>Item</th><th>SKU</th><th>Qty</th></tr>'+rows+'</table><p>Please confirm availability and delivery timing.</p>'});
  const now=new Date().toISOString();const order=await base44.asServiceRole.entities.ProcurementOrder.update(po.id,{status:'sent_to_vendor',approved_by:user.email||user.id,approved_at:now,sent_by:user.email||user.id,sent_at:now,email_error:''});
  return Response.json({ok:true,order});
 }catch(e:any){return Response.json({error:e.message||String(e)},{status:500})}
});