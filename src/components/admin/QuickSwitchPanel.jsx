import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useImpersonation } from '@/lib/ImpersonationContext';
import { base44 } from '@/api/base44Client';
import { Loader2, Zap, Crown, Wrench, Users, Gauge, Truck, Headphones, Calculator } from 'lucide-react';

const QUICK_ROLES = [
  { role: 'Owner', icon: Crown, color: 'text-amber-600', dashboard: '/operations' },
  { role: 'Operations Manager', icon: Gauge, color: 'text-blue-600', dashboard: '/operations' },
  { role: 'Warehouse Manager', icon: Users, color: 'text-green-600', dashboard: '/warehouse' },
  { role: 'Lead Technician', icon: Wrench, color: 'text-purple-600', dashboard: '/tech/dashboard' },
  { role: 'Apprentice', icon: Truck, color: 'text-indigo-600', dashboard: '/tech/dashboard' },
  { role: 'CSR', icon: Headphones, color: 'text-pink-600', dashboard: '/admin/dashboard' },
  { role: 'Dispatcher', icon: Truck, color: 'text-cyan-600', dashboard: '/admin/jobs' },
  { role: 'Bookkeeper', icon: Calculator, color: 'text-teal-600', dashboard: '/admin/invoices' },
];

export default function QuickSwitchPanel({ open, onClose }) {
  const { startImpersonation } = useImpersonation();
  const [reason, setReason] = useState('');
  const [writeActions, setWriteActions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState(null);

  const handleQuickSwitch = async (roleName) => {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      // Load employees if not loaded yet
      let emps = employees;
      if (!emps) {
        emps = await base44.entities.EmployeeRegistry.list('-created_date', 200);
        setEmployees(emps || []);
      }

      // Find an employee with this role
      let emp = emps.find(e =>
        (e.primary_role || '').toLowerCase() === roleName.toLowerCase() &&
        e.employment_status === 'Active' &&
        e.account_status !== 'Disabled'
      );

      // Fall back to test users
      if (!emp) {
        emp = emps.find(e =>
          (e.first_name || '').toLowerCase().includes(roleName.toLowerCase().split(' ')[0]) &&
          e.employment_status === 'Active'
        );
      }

      if (!emp) {
        alert(`No active employee found with role: ${roleName}`);
        setLoading(false);
        return;
      }

      await startImpersonation(emp, `Quick Switch: ${reason.trim()}`, writeActions);
      onClose();
    } catch (err) {
      console.error('Quick switch failed', err);
      alert(err.message || 'Failed to switch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-accent" />
            Quick Switch (Dev Mode)
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            One-click impersonation for development and testing.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Reason *</Label>
            <Textarea
              placeholder="e.g. Testing dashboard rendering..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label className="cursor-pointer">Allow Write Actions</Label>
            <Switch checked={writeActions} onCheckedChange={setWriteActions} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {QUICK_ROLES.map((item) => {
              const Icon = item.icon;
              return (
              <Button
                key={item.role}
                variant="outline"
                className="justify-start h-auto py-3"
                disabled={loading || !reason.trim()}
                onClick={() => handleQuickSwitch(item.role)}
              >
                <Icon className={`w-4 h-4 mr-2 ${item.color}`} />
                <span className="text-xs">{item.role}</span>
              </Button>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}