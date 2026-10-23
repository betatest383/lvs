import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { base44 } from '@/api/base44Client';
import { Search, Link2, UserPlus, Loader2 } from 'lucide-react';

export default function LinkUserDialog({ open, onClose, user, employees, onLinked }) {
  const [mode, setMode] = useState('link'); // 'link' | 'create'
  const [search, setSearch] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [loading, setLoading] = useState(false);
  const [createForm, setCreateForm] = useState({
    first_name: '',
    last_name: '',
    primary_role: '',
    department: '',
    default_dashboard: '',
    default_landing_page: '',
  });

  useEffect(() => {
    if (open) {
      setMode('link');
      setSearch('');
      setSelectedEmpId('');
      setCreateForm({ first_name: '', last_name: '', primary_role: '', department: '', default_dashboard: '', default_landing_page: '' });
    }
  }, [open]);

  const filteredEmployees = (employees || []).filter(e => {
    if (!search) return !e.user_linked;
    const q = search.toLowerCase();
    return (
      (e.employee_id || '').toLowerCase().includes(q) ||
      (e.first_name || '').toLowerCase().includes(q) ||
      (e.last_name || '').toLowerCase().includes(q) ||
      (e.email || '').toLowerCase().includes(q) ||
      (e.primary_role || '').toLowerCase().includes(q)
    ) && !e.user_linked;
  });

  const handleLink = async () => {
    if (!selectedEmpId) return;
    setLoading(true);
    try {
      await base44.functions.invoke('linkUserToEmployee', {
        action: 'link',
        employee_id: selectedEmpId,
        user_id: user.id,
        user_email: user.email,
      });
      onLinked?.();
      onClose();
    } catch (err) {
      console.error('Link failed', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.first_name || !createForm.last_name) return;
    setLoading(true);
    try {
      await base44.functions.invoke('linkUserToEmployee', {
        action: 'create',
        user_id: user.id,
        user_email: user.email,
        ...createForm,
      });
      onLinked?.();
      onClose();
    } catch (err) {
      console.error('Create failed', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link User to Employee</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Link <span className="font-medium">{user?.email}</span> to an Employee Registry record.
          </p>
        </DialogHeader>

        <Tabs value={mode} onValueChange={setMode}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="link"><Link2 className="w-4 h-4 mr-2" />Link Existing</TabsTrigger>
            <TabsTrigger value="create"><UserPlus className="w-4 h-4 mr-2" />Create New</TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="space-y-3 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search unlinked employees..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md">
              {filteredEmployees.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No unlinked employees found</p>
              ) : (
                filteredEmployees.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => setSelectedEmpId(emp.employee_id)}
                    className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                      selectedEmpId === emp.employee_id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs opacity-70">{emp.employee_id} · {emp.primary_role || 'No role'} · {emp.email || 'No email'}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleLink} disabled={!selectedEmpId || loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                Link Employee
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="create" className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name *</Label>
                <Input value={createForm.first_name} onChange={(e) => setCreateForm({...createForm, first_name: e.target.value})} />
              </div>
              <div>
                <Label>Last Name *</Label>
                <Input value={createForm.last_name} onChange={(e) => setCreateForm({...createForm, last_name: e.target.value})} />
              </div>
              <div>
                <Label>Primary Role</Label>
                <Input value={createForm.primary_role} onChange={(e) => setCreateForm({...createForm, primary_role: e.target.value})} placeholder="e.g. Lead Technician" />
              </div>
              <div>
                <Label>Department</Label>
                <Input value={createForm.department} onChange={(e) => setCreateForm({...createForm, department: e.target.value})} placeholder="e.g. Field Operations" />
              </div>
              <div>
                <Label>Default Dashboard</Label>
                <Input value={createForm.default_dashboard} onChange={(e) => setCreateForm({...createForm, default_dashboard: e.target.value})} placeholder="e.g. Tech Dashboard" />
              </div>
              <div>
                <Label>Default Landing Page</Label>
                <Input value={createForm.default_landing_page} onChange={(e) => setCreateForm({...createForm, default_landing_page: e.target.value})} placeholder="e.g. /tech/dashboard" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!createForm.first_name || !createForm.last_name || loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Create & Link
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}