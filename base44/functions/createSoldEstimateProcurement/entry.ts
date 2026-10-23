import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const parse=(v:any)=>{try{return typeof v==='string'?JSON.parse(v||'[]'):(v||[])}catch{return []}};
const no=(prefix:string)=>prefix+'-'+crypto.randomUUID().slice(0,8).toUpperCase();

Deno.serve(async(req)=>{
 const base44=createClientFromRequest(req);
 try {
  const user=await base44.auth.me(); if(!user)return Response.json({error:'Unauthorized'},{status:401});
  const {job_id,estimate_id}=await req.json(); if(!job_id&&!estimate_id)return Response.json({error:'job_id or estimate_id required'},{status:400});
  let estimate=estimate_id?await base44.asServiceRole.entities.Estimate.get(estimate_id).catch(()=>null):null;
  if(!estimate&&job_id)estimate=(await base44.asServiceRole.entities.Estimate.filter({job_id},'-created_date',20))[0]||null;
  const jid=job_id||estimate?.job_id; if(!estimate||!jid)return Response.json({error:'Sold estimate not found'},{status:404});
  const [wf,packages,scopes,job]=await Promise.all([
   base44.asServiceRole.entities.AppointmentWorkflow.filter({job_id:jid},'-updated_date',5),
   base44.asServiceRole.entities.EstimatePackage.filter({job_id:jid},'-created_date',50),
   base44.asServiceRole.entities.ScopeOfWork.filter({job_id:jid},'-created_date',50),
   base44.asServiceRole.entities.Job.get(jid).catch(()=>null)
  ]);
  const packageId=estimate.selected_package_id||wf[0]?.selected_option_id;
  const scope=scopes.find((s:any)=>s.estimate_package_id===packageId&&!s.superseded_by_id);
  if(!scope)return Response.json({error:'Selected option scope not found'},{status:422});
  const key='sold-estimate:'+estimate.id+':'+packageId;
  const existing=await base44.asServiceRole.entities.MaterialTransferSheet.filter({job_id:jid},'-created_date',100).catch(()=>[]);
  const existingTransfer=existing.find((t:any)=>(t.notes||'').includes(key));
  const materials=parse(scope.required_materials);
  if(!materials.length)return Response.json({ok:true,skipped:true,reason:'No itemized materials on sold option scope'});
  const reserve:any[]=[], shortages:any[]=[];
  for(const m of materials){
   const id=m.material_id||m.inventory_master_id; const qty=Number(m.quantity||0); if(!id||qty<=0){shortages.push({...m,reason:'Missing inventory ID'});continue}
   const item=await base44.asServiceRole.entities.InventoryMaster.get(id).catch(()=>null);
   if(!item){shortages.push({...m,reason:'Inventory item not found'});continue}
   const available=Math.max(0,Number(item.quantity_available||0)), take=Math.min(available,qty);
   if(take>0)reserve.push({item,qty:take});
   if(take<qty)shortages.push({inventory_master_id:id,item_name:item.item_name,sku:item.sku,vendor_id:item.vendor_id,vendor_sku:item.vendor_sku,quantity_ordered:qty-take,unit_cost:Number(item.purchase_cost||item.unit_cost||0),line_total:(qty-take)*Number(item.purchase_cost||item.unit_cost||0),reason:available?'Partial stock':'Out of stock'});
  }
  let transfer=existingTransfer||null;
  if(!transfer&&reserve.length){
   const lines:any[]=[];
   for(const r of reserve){
    const before={available:Number(r.item.quantity_available||0),reserved:Number(r.item.quantity_reserved||0)};
    const after={available:before.available-r.qty,reserved:before.reserved+r.qty};
    await base44.asServiceRole.entities.InventoryMaster.update(r.item.id,{quantity_available:after.available,quantity_reserved:after.reserved});
    await base44.asServiceRole.entities.InventoryTransaction.create({transaction_id:no('ITX'),transaction_type:'reserve',movement_direction:'neutral',inventory_master_id:r.item.id,inventory_item_name:r.item.item_name,sku:r.item.sku,quantity:r.qty,unit_of_measure:r.item.unit||'ea',unit_cost:Number(r.item.unit_cost||0),total_cost:r.qty*Number(r.item.unit_cost||0),source_document_type:'sales_order',source_document_id:estimate.id,job_id:jid,reason:'Reserved for sold estimate '+(estimate.estimate_number||estimate.id),notes:key,transaction_date:new Date().toISOString(),status:'completed'});
    lines.push({inventory_master_id:r.item.id,sku:r.item.sku,item_name:r.item.item_name,quantity_requested:r.qty,quantity_loaded:0,quantity_returned:0,verified:false,warehouse_location:r.item.warehouse_location,bin_location:r.item.bin_location,unit_cost:r.item.unit_cost||0});
   }
   transfer=await base44.asServiceRole.entities.MaterialTransferSheet.create({transfer_id:no('MTS'),date:new Date().toISOString().slice(0,10),job_id:jid,job_number:job?.crm_job_number||job?.servicetitan_job_number||jid,customer_name:job?.customer_name||estimate.customer_name||'',technician:'Warehouse',line_items:JSON.stringify(lines),status:'Requested',requested_date:new Date().toISOString(),created_by:user.email||user.id,notes:key+'; Sold estimate '+(estimate.estimate_number||estimate.id)+'; package '+packageId});
  }
  const procurement:any[]=[];
  const byVendor=new Map<string,any[]>();
  for(const s of shortages){const k=s.vendor_id||'unassigned'; if(!byVendor.has(k))byVendor.set(k,[]);byVendor.get(k).push(s)}
  for(const [vendorId,lines] of byVendor){
   const poKey=key+':po:'+vendorId; const found=await base44.asServiceRole.entities.ProcurementOrder.filter({idempotency_key:poKey},null,1).catch(()=>[]);
   if(found.length){procurement.push(found[0]);continue}
   const vendor=vendorId!=='unassigned'?await base44.asServiceRole.entities.Vendor.get(vendorId).catch(()=>null):null;
   const subtotal=lines.reduce((n:number,l:any)=>n+Number(l.line_total||0),0);
   const po=await base44.asServiceRole.entities.ProcurementOrder.create({procurement_order_number:no('PO'),status:vendor?.email?'needs_review':'exception',job_id:jid,estimate_id:estimate.id,estimate_package_id:packageId,vendor_id:vendor?.id||'',vendor_name:vendor?.name||vendor?.vendor_name||lines[0]?.vendor_name||'Vendor not assigned',vendor_email:vendor?.email||'',line_items:JSON.stringify(lines),subtotal,idempotency_key:poKey,notes:vendor?.email?'Auto-created from sold-estimate shortage. Approve to email vendor.':'Auto-created shortage; assign a vendor with an email before approval.'});
   procurement.push(po);
  }
  return Response.json({ok:true,transfer,procurement_orders:procurement,reserved_lines:reserve.length,shortage_lines:shortages.length});
 }catch(e:any){return Response.json({error:e.message||String(e)},{status:500})}
});