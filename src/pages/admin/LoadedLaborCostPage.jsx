import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Pencil, Archive, RotateCcw, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import LoadedLaborCostFormDialog from '@/components/admin/pricing/LoadedLaborCostFormDialog';

export default function LoadedLaborCostPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => {
    setLoading(true);
    base44.entities.LoadedLaborCost.filter({}, null, 100)
      .then(setRecords)
      .catch(() => toast.error('Failed to load labor costs'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.LoadedLaborCost.update(editing.id, data);
      toast.success('Labor cost updated');
    } else {
      await base44.entities.LoadedLaborCost.create(data);
      toast.success('Labor cost created');
    }
    setEditing(null);
    load();
  };

  const archive = async (rec) => {
    await base44.entities.LoadedLaborCost.update(rec.id, { status: 'archived' });
    toast.success('Archived');
    load();
  };

  const restore = async (rec) => {
    await base44.entities.LoadedLaborCost.update(rec.id, { status: 'active' });
    toast.success('Restored');
    load();
  };

  const sorted = [...records].sort((a, b) => (a.role || '').localeCompare(b.role || ''));
  const active = sorted.filter(r => r.status !== 'archived');
  const archived = sorted.filter(r => r.status === 'archived');

  const renderRow = (rec) => (
    <div key={rec.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent/5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{rec.role}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rec.status === 'active' ? 'bg-green-100 text-green-700' : rec.status === 'inactive' ? 'bg-gray-100 text-gray-700' : 'bg-red-100 text-red-700'}`}>{rec.status}</span>
        </div>
        <p className="text-xs text-muted-foreground">Base: ${rec.base_hourly_wage?.toFixed(2)}/hr · Tax: {rec.payroll_tax_percentage}% · WC: {rec.workers_comp_percentage}%</p>
        {rec.effective_start_date && <p className="text-xs text-muted-foreground">Effective: {rec.effective_start_date} → {rec.effective_end_date || '...'}</p>}
      </div>
      <div className="text-right">
        <p className="text-lg font-bold">${rec.loaded_hourly_cost?.toFixed(2)}</p>
        <p className="text-xs text-muted-foreground">loaded/hr</p>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(rec); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
        {rec.status === 'archived' ? (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => restore(rec)}><RotateCcw className="w-3.5 h-3.5" /></Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => archive(rec)}><Archive className="w-3.5 h-3.5" /></Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><DollarSign className="w-6 h-6" /> Loaded Labor Cost Registry</h1>
          <p className="text-muted-foreground">Role-based loaded hourly costs for pricing calculations. Wage data is never exposed to technicians.</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-1" /> Add Role
        </Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Active Roles</h3>
            {active.length === 0 ? <p className="text-sm text-muted-foreground py-4">No active labor cost records.</p> : active.map(renderRow)}
          </div>
          {archived.length > 0 && (
            <div className="space-y-2 pt-4 border-t">
              <h3 className="text-sm font-semibold text-muted-foreground">Archived</h3>
              {archived.map(renderRow)}
            </div>
          )}
        </>
      )}
      <LoadedLaborCostFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Edit Labor Cost' : 'New Labor Cost'}
        initialData={editing || { status: 'active', base_hourly_wage: 0, payroll_tax_percentage: 0, workers_comp_percentage: 0, benefit_cost_per_hour: 0, insurance_cost_per_hour: 0, other_burden_per_hour: 0 }}
        onSave={handleSave}
      />
    </div>
  );
}