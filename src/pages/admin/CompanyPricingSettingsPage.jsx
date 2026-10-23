import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function CompanyPricingSettingsPage() {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.CompanyPricingSettings.filter({}, null, 1)
      .then(records => {
        if (records.length > 0) setData(records[0]);
        else setData({
          target_gross_margin_percentage: 45,
          minimum_gross_margin_percentage: 35,
          target_net_margin_percentage: 20,
          target_revenue_per_production_day: 5000,
          target_gross_profit_per_production_day: 2250,
          target_revenue_per_labor_hour: 250,
          default_overhead_allocation_method: 'percentage',
          overhead_percentage: 12,
          default_commission_method: 'percentage_of_revenue',
          require_manager_approval_below_margin: true,
          allow_technician_price_override: false,
          maximum_technician_discount_percentage: 10,
        });
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const update = (key, value) => setData(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      if (data.id) {
        await base44.entities.CompanyPricingSettings.update(data.id, data);
      } else {
        await base44.entities.CompanyPricingSettings.create(data);
      }
      toast.success('Pricing settings saved');
    } catch (error) {
      toast.error(`Save failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Pricing Settings</h1>
        <p className="text-muted-foreground">Company-level margin targets, overhead allocation, and approval thresholds.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Margin Targets</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Target Gross Margin (%)</Label>
              <Input type="number" step="any" value={data.target_gross_margin_percentage ?? 0} onChange={e => update('target_gross_margin_percentage', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>Minimum Gross Margin (%)</Label>
              <Input type="number" step="any" value={data.minimum_gross_margin_percentage ?? 0} onChange={e => update('minimum_gross_margin_percentage', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>Target Net Margin (%)</Label>
              <Input type="number" step="any" value={data.target_net_margin_percentage ?? 0} onChange={e => update('target_net_margin_percentage', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Target Revenue / Day ($)</Label>
              <Input type="number" step="any" value={data.target_revenue_per_production_day ?? 0} onChange={e => update('target_revenue_per_production_day', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>Target GP / Day ($)</Label>
              <Input type="number" step="any" value={data.target_gross_profit_per_production_day ?? 0} onChange={e => update('target_gross_profit_per_production_day', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>Target Revenue / Labor Hr ($)</Label>
              <Input type="number" step="any" value={data.target_revenue_per_labor_hour ?? 0} onChange={e => update('target_revenue_per_labor_hour', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Overhead & Commission</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Overhead Allocation Method</Label>
              <Select value={data.default_overhead_allocation_method || 'percentage'} onValueChange={v => update('default_overhead_allocation_method', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage of Revenue</SelectItem>
                  <SelectItem value="flat_rate">Flat Rate</SelectItem>
                  <SelectItem value="per_labor_hour">Per Labor Hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Overhead Percentage (%)</Label>
              <Input type="number" step="any" value={data.overhead_percentage ?? 0} onChange={e => update('overhead_percentage', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Default Commission Method</Label>
            <Select value={data.default_commission_method || 'percentage_of_revenue'} onValueChange={v => update('default_commission_method', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage_of_revenue">% of Revenue</SelectItem>
                <SelectItem value="percentage_of_gross_profit">% of Gross Profit</SelectItem>
                <SelectItem value="flat_service_commission">Flat Service Commission</SelectItem>
                <SelectItem value="tiered_gross_margin">Tiered Gross Margin</SelectItem>
                <SelectItem value="profit_per_day_threshold">Profit/Day Threshold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Approval Controls</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Switch checked={data.require_manager_approval_below_margin !== false} onCheckedChange={v => update('require_manager_approval_below_margin', v)} />
            <Label>Require manager approval when below minimum margin</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={data.allow_technician_price_override || false} onCheckedChange={v => update('allow_technician_price_override', v)} />
            <Label>Allow technician to override price</Label>
          </div>
          <div className="space-y-1.5">
            <Label>Maximum Technician Discount (%)</Label>
            <Input type="number" step="any" value={data.maximum_technician_discount_percentage ?? 0} onChange={e => update('maximum_technician_discount_percentage', parseFloat(e.target.value) || 0)} />
          </div>
        </CardContent>
      </Card>
      <Button onClick={handleSave} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Save Settings
      </Button>
    </div>
  );
}