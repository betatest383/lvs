import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Download, Loader2, AlertCircle } from 'lucide-react';

export default function UserIdentityReport() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | linked | unlinked | disabled

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const emps = await base44.entities.EmployeeRegistry.list('-created_date', 200);
      setEmployees(emps || []);
    } catch (err) {
      console.error('Failed to load employees', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = employees.filter(e => {
    if (filter === 'linked' && !e.user_linked) return false;
    if (filter === 'unlinked' && e.user_linked) return false;
    if (filter === 'disabled' && e.account_status !== 'Disabled') return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (e.employee_id || '').toLowerCase().includes(q) ||
      (e.first_name || '').toLowerCase().includes(q) ||
      (e.last_name || '').toLowerCase().includes(q) ||
      (e.email || '').toLowerCase().includes(q) ||
      (e.primary_role || '').toLowerCase().includes(q)
    );
  });

  const stats = {
    total: employees.length,
    linked: employees.filter(e => e.user_linked).length,
    unlinked: employees.filter(e => !e.user_linked).length,
    disabled: employees.filter(e => e.account_status === 'Disabled').length,
  };

  const handleExport = () => {
    const headers = ['Employee ID', 'Name', 'Email', 'Role', 'Department', 'Linked', 'Login Email', 'Last Login', 'Last Activity', 'Account Status'];
    const rows = filtered.map(e => [
      e.employee_id || '',
      `${e.first_name || ''} ${e.last_name || ''}`,
      e.email || '',
      e.primary_role || '',
      e.department || '',
      e.user_linked ? 'Yes' : 'No',
      e.login_email || '',
      e.last_login ? new Date(e.last_login).toLocaleString() : '',
      e.last_activity ? new Date(e.last_activity).toLocaleString() : '',
      e.account_status || 'Pending',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'user-identity-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const filterButtons = [
    { key: 'all', label: 'All' },
    { key: 'linked', label: 'Linked' },
    { key: 'unlinked', label: 'Unlinked' },
    { key: 'disabled', label: 'Disabled' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Identity Report</h1>
          <p className="text-sm text-muted-foreground">All employees and their authentication link status</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4" />Export CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Employees', value: stats.total, color: '' },
          { label: 'Linked', value: stats.linked, color: 'text-green-600' },
          { label: 'Unlinked', value: stats.unlinked, color: 'text-amber-600' },
          { label: 'Disabled', value: stats.disabled, color: 'text-red-600' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1">
          {filterButtons.map(f => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? 'default' : 'outline'}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Linked</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead>Account Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp) => (
                <TableRow
                  key={emp.id}
                  className={!emp.user_linked ? 'bg-amber-50 dark:bg-amber-950/20' : ''}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {!emp.user_linked && <AlertCircle className="w-4 h-4 text-amber-500" />}
                      <div>
                        <p className="font-medium">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs text-muted-foreground">{emp.employee_id} · {emp.email || 'No email'}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{emp.primary_role || '—'}</Badge>
                  </TableCell>
                  <TableCell>{emp.department || '—'}</TableCell>
                  <TableCell>
                    {emp.user_linked ? (
                      <Badge variant="default" className="bg-green-600">Yes</Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-300">No</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {emp.last_login ? new Date(emp.last_login).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {emp.last_activity ? new Date(emp.last_activity).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        emp.account_status === 'Active' ? 'default' :
                        emp.account_status === 'Disabled' ? 'destructive' :
                        emp.account_status === 'Suspended' ? 'destructive' : 'outline'
                      }
                    >
                      {emp.account_status || 'Pending'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {loading ? 'Loading...' : 'No employees found'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}