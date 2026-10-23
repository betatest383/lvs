import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { AlertTriangle, RotateCcw, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

export default function DeveloperResetDialog({ open, onOpenChange }) {
  const [technicians, setTechnicians] = useState([]);
  const [selectedTech, setSelectedTech] = useState('all');
  const [clearTasks, setClearTasks] = useState(false);
  const [clearNotifications, setClearNotifications] = useState(false);
  const [clearEvents, setClearEvents] = useState(false);
  const [reason, setReason] = useState('Development Testing');
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (open) {
      setResult(null);
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      base44.entities.Wh105DepartureCheck.filter({ date: today }, '-updated_date', 200)
        .then(recs => setTechnicians(recs || []))
        .catch(() => setTechnicians([]));
    }
  }, [open]);

  const handleReset = async () => {
    setResetting(true);
    setResult(null);
    try {
      const payload = {
        technician_email: selectedTech === 'all' ? null : selectedTech,
        clear_test_tasks: clearTasks,
        clear_test_notifications: clearNotifications,
        clear_test_events: clearEvents,
        reason: reason.trim() || 'Development Testing',
      };
      const response = await base44.functions.invoke('resetMorningReadiness', payload);
      setResult(response.data);
      toast.success(`Reset complete — ${response.data.reset_count} record(s) reset.`);
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || 'Reset failed';
      toast.error(msg);
    } finally {
      setResetting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setResult(null);
    setSelectedTech('all');
    setClearTasks(false);
    setClearNotifications(false);
    setClearEvents(false);
    setReason('Development Testing');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <ShieldAlert className="w-5 h-5" />
            Developer Reset — WH-105 Morning Readiness
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800">Reset Complete</p>
                <p className="text-xs text-green-700">Performed by {result.performed_by} at {new Date(result.performed_at).toLocaleString()}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="border rounded p-2"><p className="text-xs text-muted-foreground">Departure Checks Reset</p><p className="text-lg font-bold">{result.reset_count}</p></div>
              <div className="border rounded p-2"><p className="text-xs text-muted-foreground">Trucks Reset</p><p className="text-lg font-bold">{result.trucks_reset}</p></div>
              <div className="border rounded p-2"><p className="text-xs text-muted-foreground">Tasks Cleared</p><p className="text-lg font-bold">{result.tasks_cleared}</p></div>
              <div className="border rounded p-2"><p className="text-xs text-muted-foreground">Notifications Cleared</p><p className="text-lg font-bold">{result.notifications_cleared}</p></div>
              <div className="border rounded p-2"><p className="text-xs text-muted-foreground">Events Cleared</p><p className="text-lg font-bold">{result.events_cleared}</p></div>
              <div className="border rounded p-2"><p className="text-xs text-muted-foreground">Reason</p><p className="text-sm font-medium truncate">{result.reason}</p></div>
            </div>
            {result.reset_records?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Reset Technicians:</p>
                {result.reset_records.map((r, i) => (
                  <div key={i} className="text-xs border rounded p-2 flex justify-between">
                    <span>{r.technician_name}</span>
                    <span className="text-muted-foreground">Truck {r.truck_number || '—'}</span>
                  </div>
                ))}
              </div>
            )}
            <Button onClick={handleClose} className="w-full">Close</Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                This will reset today's morning readiness for the selected technician(s), clear all checklist statuses, remove manager overrides, clear departure timestamps, and reset truck status to Available. Use only for testing.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Technician</Label>
              <Select value={selectedTech} onValueChange={setSelectedTech}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Technicians (Today)</SelectItem>
                  {technicians.map(t => (
                    <SelectItem key={t.id} value={t.technician_email}>{t.technician_name} — Truck {t.truck_number || '—'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{technicians.length} departure check(s) found for today.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Reason</Label>
              <Textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>

            <div className="space-y-2 border rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground">Optional: Clear Test Automation Data</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={clearTasks} onCheckedChange={setClearTasks} />
                <span className="text-sm">Clear test Enterprise Tasks (WH-105 source)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={clearNotifications} onCheckedChange={setClearNotifications} />
                <span className="text-sm">Clear test Notifications (WH-105 source)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={clearEvents} onCheckedChange={setClearEvents} />
                <span className="text-sm">Clear test Automation Events (WH-105 source)</span>
              </label>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={resetting}>Cancel</Button>
              <Button onClick={handleReset} disabled={resetting} className="bg-red-600 hover:bg-red-700 text-white gap-1.5">
                {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {resetting ? 'Resetting...' : 'Execute Reset'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}