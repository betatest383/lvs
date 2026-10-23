import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download, Clock, Users, TrendingUp, Activity } from 'lucide-react';

export default function ImpersonationReport() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.entities.ImpersonationLog.list('-created_date', 200);
      setLogs(res || []);
    } catch (err) {
      console.error('Failed to load impersonation logs', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const stats = {
    total: logs.length,
    active: logs.filter(l => l.status === 'active').length,
    byAdmin: {},
    byEmployee: {},
    byRole: {},
    avgDuration: 0,
  };

  const ended = logs.filter(l => l.status === 'ended' && l.duration_minutes != null);
  logs.forEach(l => {
    stats.byAdmin[l.admin_name] = (stats.byAdmin[l.admin_name] || 0) + 1;
    stats.byEmployee[l.impersonated_employee_name] = (stats.byEmployee[l.impersonated_employee_name] || 0) + 1;
    if (l.impersonated_role) {
      stats.byRole[l.impersonated_role] = (stats.byRole[l.impersonated_role] || 0) + 1;
    }
  });
  if (ended.length > 0) {
    stats.avgDuration = Math.round(ended.reduce((s, l) => s + l.duration_minutes, 0) / ended.length);
  }

  const topAdmins = Object.entries(stats.byAdmin).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topEmployees = Object.entries(stats.byEmployee).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topRoles = Object.entries(stats.byRole).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const handleExport = () => {
    const headers = ['Log ID', 'Admin', 'Employee', 'Role', 'Department', 'Start', 'End', 'Duration (min)', 'Reason', 'Status'];
    const rows = logs.map(l => [
      l.log_id, l.admin_name, l.impersonated_employee_name, l.impersonated_role,
      l.impersonated_department, l.start_time, l.end_time || '', l.duration_minutes || '',
      l.reason, l.status,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c || ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'impersonation-report.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Impersonation Report</h1>
          <p className="text-sm text-muted-foreground">Audit trail of all Act As User sessions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.total}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Now</CardTitle>
            <Activity className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{stats.active}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.avgDuration}m</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Admins</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{Object.keys(stats.byAdmin).length}</p></CardContent>
        </Card>
      </div>

      {/* Top lists */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">By Administrator</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {topAdmins.length === 0 ? <p className="text-sm text-muted-foreground">No data</p> : topAdmins.map(([name, count]) => (
              <div key={name} className="flex justify-between text-sm">
                <span className="truncate">{name}</span><Badge variant="secondary">{count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">By Employee</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {topEmployees.length === 0 ? <p className="text-sm text-muted-foreground">No data</p> : topEmployees.map(([name, count]) => (
              <div key={name} className="flex justify-between text-sm">
                <span className="truncate">{name}</span><Badge variant="secondary">{count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Most Impersonated Roles</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {topRoles.length === 0 ? <p className="text-sm text-muted-foreground">No data</p> : topRoles.map(([role, count]) => (
              <div key={role} className="flex justify-between text-sm">
                <span className="truncate">{role}</span><Badge variant="secondary">{count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent sessions */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Recent Sessions</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Log ID</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.slice(0, 20).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.log_id}</TableCell>
                  <TableCell className="text-sm">{l.admin_name}</TableCell>
                  <TableCell className="text-sm">{l.impersonated_employee_name}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{l.impersonated_role || '—'}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.start_time ? new Date(l.start_time).toLocaleString() : '—'}</TableCell>
                  <TableCell className="text-sm">{l.duration_minutes != null ? `${l.duration_minutes}m` : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={l.status === 'active' ? 'default' : l.status === 'ended' ? 'secondary' : 'destructive'} className="text-xs">
                      {l.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{l.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {logs.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {loading ? 'Loading...' : 'No impersonation sessions recorded'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}