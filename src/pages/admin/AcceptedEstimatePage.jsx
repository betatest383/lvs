import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileCheck, Loader2, ExternalLink } from 'lucide-react';

const parseIds = (value) => { try { return Array.isArray(value) ? value : JSON.parse(value || '[]'); } catch { return []; } };
const money = (value) => '$' + Number(value || 0).toFixed(2);

export default function AcceptedEstimatePage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState({ loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [workflows, decisions, allItems, estimates] = await Promise.all([
        base44.entities.AppointmentWorkflow.filter({ job_id: jobId }).catch(() => []),
        base44.entities.CustomerDecisionRecord.filter({ job_id: jobId }).catch(() => []),
        base44.entities.DraftEstimateItem.filter({ job_id: jobId }).catch(() => []),
        base44.entities.Estimate.filter({ job_id: jobId }).catch(() => []),
      ]);
      const workflow = workflows.sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date))[0];
      const decision = decisions.find(d => d.id === workflow?.current_customer_decision_record_id);
      const pkgId = decision?.estimate_package_id || workflow?.selected_option_id;
      const pkg = pkgId ? await base44.entities.EstimatePackage.get(pkgId).catch(() => null) : null;
      const scope = pkg?.scope_of_work_id ? await base44.entities.ScopeOfWork.get(pkg.scope_of_work_id).catch(() => null) : null;
      const byId = new Map(allItems.map(item => [item.id, item]));
      const items = parseIds(pkg?.estimate_item_ids).map(id => byId.get(id)).filter(Boolean);
      const estimate = estimates.find(e => e.id === decision?.estimate_id) ||
        estimates.find(e => e.selected_package_id === pkgId) || null;
      if (!cancelled) setData({ loading: false, decision, pkg, scope, items, estimate });
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  if (data.loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-muted-foreground" /></div>;
  if (!data.pkg || !data.decision) return <div className="max-w-3xl mx-auto p-6"><Card><CardContent className="p-6 text-center">No customer-approved estimate has been recorded.<Button className="ml-3" variant="outline" onClick={() => navigate(-1)}>Back</Button></CardContent></Card></div>;

  const option = (data.pkg.option_type || 'approved').replace(/^./, c => c.toUpperCase());
  return <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
    <div className="flex items-start justify-between gap-3 flex-wrap"><div className="flex items-start gap-3"><Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4" /></Button><div><h1 className="text-xl font-bold flex items-center gap-2">Approved Estimate <Badge className="bg-green-600">Accepted</Badge></h1><p className="text-sm text-muted-foreground">{data.pkg.customer_name} · {data.pkg.name}{data.estimate?.estimate_number ? ` · ${data.estimate.estimate_number}` : ''}</p></div></div>{data.estimate && <Button variant="outline" className="gap-1.5" onClick={() => navigate(`/admin/estimates/${data.estimate.id}`)}><ExternalLink className="w-4 h-4" /> Open Estimate{data.estimate.estimate_number ? ` #${data.estimate.estimate_number}` : ''}</Button>}</div>
    <Card className="border-green-200 bg-green-50/50"><CardContent className="p-4 grid sm:grid-cols-3 gap-4"><div><p className="text-xs text-muted-foreground">Customer-approved price</p><p className="text-2xl font-bold">{money(data.decision.accepted_price ?? data.pkg.selling_price)}</p></div><div><p className="text-xs text-muted-foreground">Accepted option</p><p className="font-semibold">{option}</p></div><div><p className="text-xs text-muted-foreground">Approved scope</p><p className="font-medium">{data.scope?.production_days || data.pkg.estimated_days || 0} day · {data.scope?.total_estimated_hours || data.pkg.estimated_hours || 0} hours</p></div></CardContent></Card>
    <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex gap-2 items-center"><FileCheck className="w-4 h-4 text-green-600" /> Included services</CardTitle></CardHeader><CardContent className="space-y-2">{data.items.map(item => <div key={item.id} className="flex justify-between gap-3 border-b last:border-0 py-2 text-sm"><span>{item.service_name || 'Service'}</span><span className="text-muted-foreground">Base scope: {money(item.total_item_price)}</span></div>)}</CardContent></Card>
    <p className="text-xs text-muted-foreground">This is the customer-approved estimate record. Use Open Estimate to access its numbered estimate workspace.</p>
  </div>;
}