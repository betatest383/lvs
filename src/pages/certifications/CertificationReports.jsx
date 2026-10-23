import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, BarChart3, Building2, RefreshCw, AlertTriangle, Network, FileText } from 'lucide-react';
import {
  CERTIFICATION_STATUS_COLORS, CERTIFICATION_TYPE_COLORS, CERTIFICATION_TYPES,
  CERTIFICATION_REGISTRY_LINK_CONFIG
} from '@/lib/certificationRegistryConstants';

export default function CertificationReports() {
  const [certifications, setCertifications] = useState([]);
  const [employeeCerts, setEmployeeCerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.CertificationRegistry.list('-created_date', 500),
      base44.entities.EmployeeCertification.list('-created_date', 500),
    ]).then(([certs, emps]) => {
      setCertifications(certs);
      setEmployeeCerts(emps);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const byStatus = {};
  certifications.forEach(c => { const s = c.status || 'Unknown'; byStatus[s] = (byStatus[s] || 0) + 1; });

  const byType = {};
  certifications.forEach(c => { const tp = c.certification_type || 'Unassigned'; byType[tp] = (byType[tp] || 0) + 1; });

  const requiresRenewal = certifications.filter(c => c.renewal_required && c.status === 'Active');
  const byRenewalFreq = {};
  requiresRenewal.forEach(c => {
    const f = c.renewal_frequency || 'Unspecified';
    byRenewalFreq[f] = (byRenewalFreq[f] || 0) + 1;
  });

  const missingTrainual = certifications.filter(c => c.status === 'Active' && !c.trainual_link);
  const unassigned = certifications.filter(c => (c.required_roles?.length || 0) === 0 && c.status === 'Active');
  const maxType = Math.max(...Object.values(byType), 1);

  const today = new Date();
  const empByStatus = {};
  employeeCerts.forEach(e => {
    const s = e.status || 'Unknown';
    empByStatus[s] = (empByStatus[s] || 0) + 1;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Certification Reports</h1>
        <p className="text-muted-foreground text-sm">Analytics across all company certifications</p>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Certification Status Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-sm font-medium ${CERTIFICATION_STATUS_COLORS[status] || 'bg-muted'}`}>{status}</span>
                <span className="text-lg font-bold">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Certifications by Type</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <div key={type}>
                <div className="flex justify-between text-sm mb-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CERTIFICATION_TYPE_COLORS[type] || 'bg-muted'}`}>{type}</span>
                  <span className="font-bold">{count}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-accent h-full rounded-full" style={{ width: `${(count / maxType) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Renewal Distribution</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(byRenewalFreq).length === 0 ? (
              <p className="text-sm text-muted-foreground">No certifications require renewal.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(byRenewalFreq).map(([freq, count]) => (
                  <div key={freq} className="flex justify-between items-center text-sm">
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">{freq}</span>
                    <span className="font-bold">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Employee Certification Status</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(empByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-sm font-medium ${CERTIFICATION_STATUS_COLORS[status] || 'bg-muted'}`}>{status}</span>
                <span className="text-lg font-bold">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-amber-100 text-amber-600"><RefreshCw className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{requiresRenewal.length}</p><p className="text-xs text-muted-foreground">Require Renewal</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-orange-100 text-orange-600"><AlertTriangle className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{missingTrainual.length}</p><p className="text-xs text-muted-foreground">Missing Trainual</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-red-100 text-red-600"><Building2 className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{unassigned.length}</p><p className="text-xs text-muted-foreground">No Roles Assigned</p>
        </CardContent></Card>
      </div>

      {missingTrainual.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Missing Trainual Links ({missingTrainual.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {missingTrainual.map(c => (
                <Link key={c.id} to={`/lvcos/certifications/detail/${c.id}`} className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                  <span className="truncate">{c.certification_name}</span>
                  <span className="text-xs text-orange-600">No Trainual link</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {unassigned.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4" /> Active Certs Without Role Assignment ({unassigned.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {unassigned.map(c => (
                <Link key={c.id} to={`/lvcos/certifications/detail/${c.id}`} className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                  <span className="truncate">{c.certification_name}</span>
                  <span className="text-xs text-amber-600">No roles assigned</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Summary by Type</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 font-medium">Type</th>
                  <th className="py-2 font-medium text-center">Total</th>
                  <th className="py-2 font-medium text-center hidden md:table-cell">Active</th>
                  <th className="py-2 font-medium text-center hidden md:table-cell">Renewal</th>
                  <th className="py-2 font-medium text-center hidden lg:table-cell">Missing Trainual</th>
                </tr>
              </thead>
              <tbody>
                {CERTIFICATION_TYPES.map(type => {
                  const typeCerts = certifications.filter(c => c.certification_type === type);
                  if (typeCerts.length === 0) return null;
                  const active = typeCerts.filter(c => c.status === 'Active').length;
                  const renewal = typeCerts.filter(c => c.renewal_required).length;
                  const missingT = typeCerts.filter(c => c.status === 'Active' && !c.trainual_link).length;
                  return (
                    <tr key={type} className="border-b hover:bg-muted/30">
                      <td className="py-2 font-medium">{type}</td>
                      <td className="py-2 text-center">{typeCerts.length}</td>
                      <td className="py-2 text-center hidden md:table-cell">{active}</td>
                      <td className="py-2 text-center hidden md:table-cell">{renewal || '—'}</td>
                      <td className="py-2 text-center hidden lg:table-cell">{missingT || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}