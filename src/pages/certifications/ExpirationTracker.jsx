import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CalendarClock, XCircle, AlertTriangle, CheckCircle2, FileCheck } from 'lucide-react';
import { EMPLOYEE_CERT_STATUS_COLORS } from '@/lib/certificationRegistryConstants';
import EmployeeCertificationFormDialog from '@/components/lvcos/EmployeeCertificationFormDialog';
import { toast } from 'sonner';

export default function ExpirationTracker() {
  const [employeeCerts, setEmployeeCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    base44.entities.EmployeeCertification.list('-created_date', 500)
      .then(setEmployeeCerts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const today = new Date();
  const thirtyDays = new Date(); thirtyDays.setDate(today.getDate() + 30);
  const sixtyDays = new Date(); sixtyDays.setDate(today.getDate() + 60);

  const isExpired = (e) => e.status === 'Expired' || (e.expiration_date && new Date(e.expiration_date) < today);
  const isExpiringSoon = (e) => {
    if (isExpired(e) || !e.expiration_date) return false;
    const exp = new Date(e.expiration_date);
    return exp > today && exp <= thirtyDays;
  };
  const isExpiringLater = (e) => {
    if (isExpired(e) || !e.expiration_date) return false;
    const exp = new Date(e.expiration_date);
    return exp > thirtyDays && exp <= sixtyDays;
  };
  const isActive = (e) => e.status === 'Active' && !isExpired(e) && !isExpiringSoon(e) && !isExpiringLater(e);

  const expired = employeeCerts.filter(isExpired);
  const expiringSoon = employeeCerts.filter(isExpiringSoon);
  const expiringLater = employeeCerts.filter(isExpiringLater);
  const active = employeeCerts.filter(isActive);
  const noExpiration = employeeCerts.filter(e => !e.expiration_date && e.status !== 'Expired');

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.EmployeeCertification.update(editing.id, data);
      toast.success('Updated');
    } else {
      await base44.entities.EmployeeCertification.create(data);
      toast.success('Created');
    }
    setEditing(null);
    const recs = await base44.entities.EmployeeCertification.list('-created_date', 500);
    setEmployeeCerts(recs);
  };

  const renderRow = (e) => (
    <tr
      key={e.id}
      className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={() => { setEditing(e); setDialogOpen(true); }}
    >
      <td className="px-3 py-2">
        <p className="font-medium">{e.employee_name}</p>
        {e.role && <p className="text-xs text-muted-foreground">{e.role}</p>}
      </td>
      <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{e.certification_name}</td>
      <td className="px-3 py-2">
        <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${EMPLOYEE_CERT_STATUS_COLORS[e.status] || 'bg-muted'}`}>{e.status}</span>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{e.expiration_date || '—'}</td>
      <td className="px-3 py-2 text-muted-foreground hidden lg:table-cell">{e.renewal_due_date || '—'}</td>
      <td className="px-3 py-2 hidden lg:table-cell">
        {e.document_url ? <FileCheck className="w-4 h-4 text-green-600" /> : <span className="text-muted-foreground/30">—</span>}
      </td>
    </tr>
  );

  const renderTable = (rows) => (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">Employee</th>
            <th className="px-3 py-2 font-medium hidden md:table-cell">Certification</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Expiration</th>
            <th className="px-3 py-2 font-medium hidden lg:table-cell">Renewal Due</th>
            <th className="px-3 py-2 font-medium hidden lg:table-cell">Doc</th>
          </tr>
        </thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expiration Tracker</h1>
          <p className="text-muted-foreground text-sm">Monitor expired, expiring, and active certifications</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          Assign Certification
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-red-100 text-red-600"><XCircle className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{expired.length}</p><p className="text-xs text-muted-foreground">Expired</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-amber-100 text-amber-600"><AlertTriangle className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{expiringSoon.length}</p><p className="text-xs text-muted-foreground">≤ 30 Days</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-orange-100 text-orange-600"><CalendarClock className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{expiringLater.length}</p><p className="text-xs text-muted-foreground">31–60 Days</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-green-100 text-green-600"><CheckCircle2 className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{active.length}</p><p className="text-xs text-muted-foreground">Active</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-gray-100 text-gray-600"><CalendarClock className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{noExpiration.length}</p><p className="text-xs text-muted-foreground">No Expiry</p>
        </CardContent></Card>
      </div>

      {expired.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><XCircle className="w-4 h-4 text-red-600" /> Expired ({expired.length})</CardTitle></CardHeader>
          <CardContent>{renderTable(expired)}</CardContent>
        </Card>
      )}

      {expiringSoon.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600" /> Expiring Within 30 Days ({expiringSoon.length})</CardTitle></CardHeader>
          <CardContent>{renderTable(expiringSoon)}</CardContent>
        </Card>
      )}

      {expiringLater.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CalendarClock className="w-4 h-4 text-orange-600" /> Expiring 31–60 Days ({expiringLater.length})</CardTitle></CardHeader>
          <CardContent>{renderTable(expiringLater)}</CardContent>
        </Card>
      )}

      {active.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> Active ({active.length})</CardTitle></CardHeader>
          <CardContent>{renderTable(active)}</CardContent>
        </Card>
      )}

      <EmployeeCertificationFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialData={editing || {}}
        onSave={handleSave}
      />
    </div>
  );
}