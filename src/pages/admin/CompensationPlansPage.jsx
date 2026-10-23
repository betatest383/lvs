import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Edit2, Trash2, Search, DollarSign } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import CompensationPlanFormDialog from '@/components/admin/CompensationPlanFormDialog';
import { formatCurrency, getCompensationMethodLabel, getCommissionBasisLabel, getCommissionTimingLabel } from '@/lib/commissionEngine';

export default function CompensationPlansPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const { toast } = useToast();

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await base44.entities.EmployeeCompensationPlan.list('-updated_date', 200);
      setPlans(data);
    } catch (e) {
      toast({ title: 'Error loading plans', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const filtered = plans.filter(p => {
    const q = search.toLowerCase();
    return !q || (p.name || '').toLowerCase().includes(q) || (p.role || '').toLowerCase().includes(q) || (p.employee_name || '').toLowerCase().includes(q);
  });

  const handleSave = async (formData) => {
    try {
      if (editingPlan) {
        await base44.entities.EmployeeCompensationPlan.update(editingPlan.id, { ...formData, updated_by: (await base44.auth.me())?.email });
        toast({ title: 'Plan updated' });
      } else {
        const user = await base44.auth.me();
        await base44.entities.EmployeeCompensationPlan.create({ ...formData, created_by: user?.email, updated_by: user?.email });
        toast({ title: 'Plan created' });
      }
      setDialogOpen(false);
      setEditingPlan(null);
      loadPlans();
    } catch (e) {
      toast({ title: 'Error saving plan', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (plan) => {
    if (!confirm(`Delete "${plan.name}"?`)) return;
    try {
      await base44.entities.EmployeeCompensationPlan.update(plan.id, { status: 'archived' });
      toast({ title: 'Plan archived' });
      loadPlans();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const stats = {
    total: plans.length,
    active: plans.filter(p => p.status === 'active').length,
    commission: plans.filter(p => p.compensation_method === 'commission' || p.compensation_method === 'hourly_plus_commission').length,
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Compensation Plans</h1>
          <p className="text-sm text-muted-foreground">Configure employee compensation methods and commission rules</p>
        </div>
        <Button onClick={() => { setEditingPlan(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> New Plan
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total Plans</p><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Active</p><p className="text-2xl font-bold text-green-600">{stats.active}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Commission-Based</p><p className="text-2xl font-bold text-blue-600">{stats.commission}</p></CardContent></Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, role, or employee..." className="pl-9" />
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No compensation plans found. Create one to get started.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(plan => (
            <Card key={plan.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{plan.name}</h3>
                      <Badge variant={plan.status === 'active' ? 'default' : 'secondary'}>{plan.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Role: {plan.role || '—'}
                      {plan.employee_name ? ` · Employee: ${plan.employee_name}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                      <span>Method: <strong className="text-foreground">{getCompensationMethodLabel(plan.compensation_method)}</strong></span>
                      {(plan.compensation_method === 'commission' || plan.compensation_method === 'hourly_plus_commission') && (
                        <>
                          <span>Rate: <strong className="text-foreground">{plan.commission_rate_percentage}%</strong></span>
                          <span>Basis: <strong className="text-foreground">{getCommissionBasisLabel(plan.commission_basis)}</strong></span>
                          <span>Timing: <strong className="text-foreground">{getCommissionTimingLabel(plan.commission_timing)}</strong></span>
                        </>
                      )}
                      {plan.compensation_method === 'hourly' && (
                        <span>Rate: <strong className="text-foreground">{formatCurrency(plan.hourly_rate)}/hr</strong></span>
                      )}
                      {plan.compensation_method === 'salary' && (
                        <span>Salary: <strong className="text-foreground">{formatCurrency(plan.salary_amount)}/yr</strong></span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { setEditingPlan(plan); setDialogOpen(true); }}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(plan)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CompensationPlanFormDialog
        open={dialogOpen}
        plan={editingPlan}
        onSave={handleSave}
        onClose={() => { setDialogOpen(false); setEditingPlan(null); }}
      />
    </div>
  );
}