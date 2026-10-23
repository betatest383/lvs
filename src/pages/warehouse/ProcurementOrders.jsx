import { useEffect,useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card,CardContent,CardHeader,CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
export default function ProcurementOrders(){
 const [orders,setOrders]=useState([]),[busy,setBusy]=useState('');
 const load=()=>base44.entities.ProcurementOrder.list('-created_date',100).then(setOrders).catch(()=>toast.error('Could not load purchase orders'));
 useEffect(()=>{load()},[]);
 const approve=async(id)=>{setBusy(id);try{const r=await base44.functions.invoke('approveProcurementOrder',{procurement_order_id:id});if(r.data?.error)throw new Error(r.data.error);toast.success('Purchase order approved and emailed to vendor');load()}catch(e){toast.error(e.message||'Could not send purchase order')}finally{setBusy('')}};
 const lines=(o)=>{try{return JSON.parse(o.line_items||'[]')}catch{return[]}};
 const review=orders.filter(o=>o.status==='needs_review');
 return <div className="p-6 max-w-6xl mx-auto space-y-4"><div><h1 className="text-2xl font-bold">Purchase Orders</h1><p className="text-sm text-muted-foreground">Shortages from sold estimates. Review before the order is emailed to the vendor.</p></div>{review.map(o=><Card key={o.id} className="border-amber-300"><CardHeader><CardTitle className="flex justify-between gap-4 text-base"><span>{o.procurement_order_number+' · Needs Review'}</span><span>{o.vendor_name||'Vendor needs assignment'}</span></CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm">Job: {o.job_id} · Sold estimate: {o.estimate_id}</p><ul className="text-sm list-disc pl-5">{lines(o).map((l,i)=><li key={i}>{String(l.quantity_ordered)+' × '+String(l.item_name)+(l.sku?' ('+l.sku+')':'')}</li>)}</ul><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{o.vendor_email||'Vendor email missing'}</span><Button disabled={!o.vendor_email||busy===o.id} onClick={()=>approve(o.id)}>{busy===o.id?'Sending…':'Approve & Email Vendor'}</Button></div></CardContent></Card>)}{review.length===0&&<Card><CardContent className="p-6 text-muted-foreground">No purchase orders need review.</CardContent></Card>}</div>
}