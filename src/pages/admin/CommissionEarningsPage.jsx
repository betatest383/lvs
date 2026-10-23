import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, DollarSign, Download } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import CommissionEarningDetailDialog from '@/components/admin/CommissionEarningDetailDialog';
import { formatCurrency, getCompensationMethodLabel, getEarningStatusLabel, getEarningStatusColor } from '@/lib/commissionEngine';

export default function CommissionEarningsPage() {
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedEarning, setSelectedEarning] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { toast } = useToast();

  const loadEarnings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await base44.entities.CommissionEarning.list('-created_date', 200);
      setEarnings(data);
    } catch (e) {
      toast({ title: 'Error loading earnings', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadEarnings(); }, [loadEarnings]);

  const filtered = earnings.filter(e => {
    const q = search.toLowerCase();
    const matchesSearch = !q || (e.employee_name || '').toLowerCase().includes(q) || (e.customer_name || '').toLowerCase().includes(q) || (e.job_number || '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalEstimated = filtered.filter(e => e.status === 'estimated' || e.status === 'pending_completion').reduce((s, e) => s + (e.calculated_amount || 0), 0);
  const totalEarned = filtered.filter(e => e.status === 'earned' || e.status === 'payable' || e.status === 'paid').reduce((s, e) => s + (e.calculated_amount || 0), 0);

  const handleApprove = async (earning) => {
    try {
      const user = await base44.auth.me();
      await base44.entities.CommissionEarning.update(earning.id, {
        status: 'earned',
        earned_date: new Date().toISOString(),
        approved_by: user?.email,
        approved_at: new Date().toISOString(),
      });
      toast({ title: 'Commission marked as earned' });
      setDetailOpen(false);
      loadEarnings();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleReverse = async (earning) => {
    const reason = prompt('Enter adjustment reason:');
    if (!reason) return;
    try {
      const user = await base44.auth.me();
      await base44.entities.CommissionEarning.update(earning.id, {
        status: 'reversed',
        adjustment_reason: reason,
        approved_by: user?.email,
        approved_at: new Date().toISOString(),
      });
      await base44.entities.CommissionEarning.create({
        employee_id: earning.employee_id,
        employee_name: earning.employee_name,
        job_id: earning.job_id,
        job_number: earning.job_number,
        customer_name: earning.customer_name,
        compensation_plan_id: earning.compensation_plan_id,
        compensation_plan_name: earning.compensation_plan_name,
        role: earning.role,
        compensation_method: earning.compensation_method,
        commission_basis: earning.commission_basis,
        commissionable_amount: earning.commissionable_amount,
        commission_rate: earning.commission_rate,
        calculated_amount: -(earning.calculated_amount || 0),
        status: 'reversed',
        is_adjustment: true,
        adjustment_parent_id: earning.id,
        adjustment_reason: reason,
        created_by: user?.email,
      });
      toast({ title: 'Adjustment record created' });
      setDetailOpen(false);
      loadEarnings();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleExport = () => {
    const csv = [
      ['Employee', 'Job', 'Customer', 'Role', 'Method', 'Basis', 'Commissionable', 'Rate', 'Amount', 'Status', 'Earned Date'].join(','),
      ...filtered.map(e => [
        e.employee_name || '', e.job_number || e.job_id || '', e.customer_name || '',
        e.role || '', e.compensation_method || '', e.commission_basis || '',
        e.commissionable_amount || 0, e.commission_rate || 0, e.calculated_amount || 0,
        e.status || '', e.earned_date ? new Date(e.earned_date).toLocaleDateString() : '',
      ].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `commission_earnings_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Commission Earnings</h1>
          <p className="text-sm text-muted-foreground">View, approve, and adjust earned commissions</p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Total Estimated (Pending)</p>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalEstimated)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Total Earned</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalEarned)}</p>
        </CardContent></Card>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by employee, customer, or job..." className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="estimated">Estimated</SelectItem>
            <SelectItem value="pending_completion">Pending Completion</SelectItem>
            <SelectItem value="earned">Earned</SelectItem>
            <SelectItem value="payable">Payable</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="reversed">Reversed</SelectItem>
            <SelectItem value="disputed">Disputed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No commission earnings found.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(e => (
            <Card key={e.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSelectedEarning(e); setDetailOpen(true); }}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{e.employee_name || e.employee_id}</span>
                    <Badge variant="outline" className={getEarningStatusColor(e.status)}>{getEarningStatusLabel(e.status)}</Badge>
                    {e.is_adjustment && <Badge variant="destructive">Adjustment</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {e.customer_name || '—'} · {e.job_number || e.job_id?.slice(-6) || '—'} · {e.role || '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">{formatCurrency(e.calculated_amount)}</p>
                  <p className="text-xs text-muted-foreground">{e.commission_rate}% of {formatCurrency(e.commissionable_amount)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CommissionEarningDetailDialog
        open={detailOpen}
        earning={selectedEarning}
        onApprove={handleApprove}
        onReverse={handleReverse}
        onClose={() => setDetailOpen(false)}
        canApprove={true}
      />
    </div>
  );
}