import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ChevronLeft, Pencil, ExternalLink, Award, RefreshCw, Building2, FileText
} from 'lucide-react';
import CertificationFormDialog from '@/components/lvcos/CertificationFormDialog';
import {
  CERTIFICATION_STATUS_COLORS, CERTIFICATION_TYPE_COLORS, CERTIFICATION_REGISTRY_LINK_CONFIG,
  EMPLOYEE_CERT_STATUS_COLORS
} from '@/lib/certificationRegistryConstants';
import { toast } from 'sonner';

const ArrayList = ({ items }) => {
  if (!items || items.length === 0) return <p className="text-sm text-muted-foreground">None linked</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className="px-2 py-0.5 rounded-full bg-muted text-xs font-medium">{item}</span>
      ))}
    </div>
  );
};

const InfoRow = ({ label, value }) => (
  <div className="flex justify-between items-start gap-2 py-1.5 border-b last:border-0">
    <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
    <span className="text-sm font-medium text-right">{value || '—'}</span>
  </div>
);

export default function CertificationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cert, setCert] = useState(null);
  const [employeeCerts, setEmployeeCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    base44.entities.CertificationRegistry.get(id)
      .then(async (c) => {
        setCert(c);
        try {
          const emps = await base44.entities.EmployeeCertification.filter({ certification_id: c.certification_id }, '-created_date', 200);
          setEmployeeCerts(emps || []);
        } catch {}
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  if (!cert) return <div className="text-center py-12 text-muted-foreground">Certification not found.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/lvcos/certifications/registry')}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
        <Button size="sm" onClick={() => setEditOpen(true)}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{cert.certification_name}</h1>
                <span className="font-mono text-xs text-muted-foreground">{cert.certification_id}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {cert.certification_type && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CERTIFICATION_TYPE_COLORS[cert.certification_type]}`}>{cert.certification_type}</span>}
                {cert.department && <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 font-medium">{cert.department}</span>}
                {cert.status && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CERTIFICATION_STATUS_COLORS[cert.status]}`}>{cert.status}</span>}
              </div>
            </div>
            {cert.trainual_link && (
              <a href={cert.trainual_link} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm"><ExternalLink className="w-3.5 h-3.5 mr-1" /> Trainual</Button>
              </a>
            )}
          </div>
          {cert.description && <p className="text-sm text-muted-foreground mt-3">{cert.description}</p>}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
          <TabsTrigger value="employees">Employee Certs ({employeeCerts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4" /> Details</CardTitle></CardHeader>
              <CardContent>
                <InfoRow label="Issuing Organization" value={cert.issuing_organization} />
                <InfoRow label="Department" value={cert.department} />
                <InfoRow label="Certification Type" value={cert.certification_type} />
                <InfoRow label="Status" value={cert.status} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Renewal & Expiration</CardTitle></CardHeader>
              <CardContent>
                <InfoRow label="Renewal Required" value={cert.renewal_required ? 'Yes' : 'No'} />
                <InfoRow label="Renewal Frequency" value={cert.renewal_frequency} />
                <InfoRow label="Expiration Tracking" value={cert.expiration_tracking_required ? 'Yes' : 'No'} />
                <InfoRow label="Default Validity" value={cert.default_validity_period ? `${cert.default_validity_period} months` : '—'} />
              </CardContent>
            </Card>
          </div>
          {cert.notes && (
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Notes</p><p className="text-sm">{cert.notes}</p></CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="relationships" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {CERTIFICATION_REGISTRY_LINK_CONFIG.map(cfg => (
              <Card key={cfg.field}>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> {cfg.label}</CardTitle></CardHeader>
                <CardContent><ArrayList items={cert[cfg.field]} /></CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="employees" className="space-y-4">
          {employeeCerts.length === 0 ? (
            <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">No employee certifications linked to this certification yet.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Employee</th>
                      <th className="px-3 py-2 font-medium hidden md:table-cell">Status</th>
                      <th className="px-3 py-2 font-medium hidden md:table-cell">Issue Date</th>
                      <th className="px-3 py-2 font-medium">Expiration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeCerts.map(e => (
                      <tr key={e.id} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">{e.employee_name}</td>
                        <td className="px-3 py-2 hidden md:table-cell">
                          <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${EMPLOYEE_CERT_STATUS_COLORS[e.status] || 'bg-muted'}`}>{e.status}</span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{e.issue_date || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{e.expiration_date || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <CertificationFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialData={cert}
        onSave={async (data) => {
          await base44.entities.CertificationRegistry.update(cert.id, data);
          toast.success('Certification updated');
          setCert({ ...cert, ...data });
          setEditOpen(false);
        }}
      />
    </div>
  );
}