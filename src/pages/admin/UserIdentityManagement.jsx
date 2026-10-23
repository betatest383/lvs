import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import LinkUserDialog from '@/components/admin/LinkUserDialog';
import ActAsUserDialog from '@/components/admin/ActAsUserDialog';
import QuickSwitchPanel from '@/components/admin/QuickSwitchPanel';
import { Search, Link2, UserPlus, Unlink, Ban, CheckCircle2, Activity, ShieldCheck, AlertCircle, Users, Loader2, UserCog, Zap } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function UserIdentityManagement() {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [linkDialogUser, setLinkDialogUser] = useState(null);
  const [actAsOpen, setActAsOpen] = useState(false);
  const [quickSwitchOpen, setQuickSwitchOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, empsRes] = await Promise.all([
        base44.entities.User.list('-created_date', 100),
        base44.entities.EmployeeRegistry.list('-created_date', 100),
      ]);
      setUsers(usersRes || []);
      setEmployees(empsRes || []);
    } catch (err) {
      console.error('Failed to load data', err);
      toast({ title: 'Error', description: 'Failed to load user identity data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const findLinkedEmployee = (userId) => {
    return employees.find(e => e.linked_user_id === userId);
  };

  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.email || '').toLowerCase().includes(q) || (u.full_name || '').toLowerCase().includes(q);
  });

  const handleAction = async (action, employeeId, userId) => {
    setActionLoading(prev => ({ ...prev, [`${action}-${userId}`]: true }));
    try {
      await base44.functions.invoke('linkUserToEmployee', { action, employee_id: employeeId });
      toast({ title: 'Success', description: `${action} completed successfully` });
      await loadData();
    } catch (err) {
      toast({ title: 'Error', description: err.response?.data?.error || err.message, variant: 'destructive' });
    } finally {
      setActionLoading(prev => ({ ...prev, [`${action}-${userId}`]: false }));
    }
  };

  const stats = {
    total: users.length,
    linked: users.filter(u => findLinkedEmployee(u.id)).length,
    unlinked: users.filter(u => !findLinkedEmployee(u.id)).length,
    disabled: employees.filter(e => e.account_status === 'Disabled').length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Identity Management</h1>
          <p className="text-sm text-muted-foreground">Link authenticated users to Employee Registry records</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setQuickSwitchOpen(true)}>
            <Zap className="w-4 h-4" /> Quick Switch
          </Button>
          <Button onClick={() => setActAsOpen(true)}>
            <UserCog className="w-4 h-4" /> Act As User
          </Button>
          <Button variant="outline" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.total}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Linked</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.linked}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unlinked</CardTitle>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.unlinked}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disabled</CardTitle>
            <Ban className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.disabled}</p></CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Authenticated User</TableHead>
                <TableHead>Employee Registry</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Link Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((u) => {
                const emp = findLinkedEmployee(u.id);
                const isDisabled = emp?.account_status === 'Disabled';
                return (
                  <TableRow key={u.id} className={isDisabled ? 'opacity-50' : ''}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{u.full_name || '—'}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {emp ? (
                        <div>
                          <p className="text-sm font-medium">{emp.first_name} {emp.last_name}</p>
                          <p className="text-xs text-muted-foreground">{emp.employee_id}</p>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not linked</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {emp ? (
                        <Badge variant="secondary">{emp.primary_role || '—'}</Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      {emp ? (
                        <Badge variant={isDisabled ? 'destructive' : 'default'}>
                          {isDisabled ? 'Disabled' : 'Linked'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">Unlinked</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {emp?.last_login ? new Date(emp.last_login).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!emp && (
                          <Button size="sm" variant="default" onClick={() => setLinkDialogUser(u)}>
                            <Link2 className="w-3.5 h-3.5" />Link
                          </Button>
                        )}
                        {emp && !isDisabled && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setLinkDialogUser(u)}>
                              <Link2 className="w-3.5 h-3.5" />Change
                            </Button>
                            <Button size="sm" variant="ghost"
                              disabled={actionLoading[`unlink-${u.id}`]}
                              onClick={() => handleAction('unlink', emp.employee_id, u.id)}>
                              <Unlink className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-600"
                              disabled={actionLoading[`disable-${u.id}`]}
                              onClick={() => handleAction('disable', emp.employee_id, u.id)}>
                              <Ban className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                        {emp && isDisabled && (
                          <Button size="sm" variant="outline" className="text-green-600"
                            disabled={actionLoading[`enable-${u.id}`]}
                            onClick={() => handleAction('enable', emp.employee_id, u.id)}>
                            <CheckCircle2 className="w-3.5 h-3.5" />Enable
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filteredUsers.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {loading ? 'Loading...' : 'No users found'}
            </div>
          )}
        </CardContent>
      </Card>

      {linkDialogUser && (
        <LinkUserDialog
          open={!!linkDialogUser}
          onClose={() => setLinkDialogUser(null)}
          user={linkDialogUser}
          employees={employees}
          onLinked={loadData}
        />
      )}

      <ActAsUserDialog open={actAsOpen} onClose={() => setActAsOpen(false)} />
      <QuickSwitchPanel open={quickSwitchOpen} onClose={() => setQuickSwitchOpen(false)} />
    </div>
  );
}