import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GraduationCap, Award, Clock, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import moment from 'moment';

function TrainingCard({ item }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
          <GraduationCap className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{item.training_name}</p>
          {item.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs">{item.training_type || 'Training'}</Badge>
            {item.estimated_completion_time && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> {item.estimated_completion_time}
              </span>
            )}
          </div>
        </div>
        {item.trainual_link && (
          <a href={item.trainual_link} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-muted">
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}

function CertificationCard({ item }) {
  const isExpired = item.status === 'Expired';
  const isExpiring = item.status === 'Expiring Soon';
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isExpired ? 'bg-red-100' : isExpiring ? 'bg-amber-100' : 'bg-green-100'
        }`}>
          <Award className={`w-5 h-5 ${isExpired ? 'text-red-600' : isExpiring ? 'text-amber-600' : 'text-green-600'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{item.certification_name}</p>
          {item.certification_id && <p className="text-xs text-muted-foreground font-mono">{item.certification_id}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {item.status && (
              <Badge className={`text-xs ${
                isExpired ? 'bg-red-100 text-red-700' :
                isExpiring ? 'bg-amber-100 text-amber-700' :
                'bg-green-100 text-green-700'
              }`}>{item.status}</Badge>
            )}
            {item.expiration_date && (
              <span className="text-xs text-muted-foreground">
                Expires: {moment(item.expiration_date).format('MMM D, YYYY')}
              </span>
            )}
          </div>
        </div>
        {item.document_url && (
          <a href={item.document_url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-muted">
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}

export default function TrainingAndCertifications() {
  const { employee, effectiveName, effectiveEmail, isImpersonating } = useEmployeeContext();
  const [trainings, setTrainings] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employee && !effectiveName && !effectiveEmail) return;
    let cancelled = false;

    const load = async () => {
      try {
        const name = effectiveName || `${employee?.first_name} ${employee?.last_name}`.trim();
        const email = effectiveEmail || employee?.email || employee?.login_email || '';
        const role = employee?.primary_role || '';

        const [allTrainings, allCerts] = await Promise.all([
          base44.entities.TrainingRegistry.list('-updated_date', 200).catch(() => []),
          base44.entities.EmployeeCertification.filter({ employee_name: name }).catch(() => []),
        ]);

        if (cancelled) return;

        // Filter trainings that apply to this employee's role
        const myTrainings = allTrainings.filter(t => {
          if (!t || t.status !== 'Active') return false;
          if (!t.required_roles || t.required_roles.length === 0) return false;
          return t.required_roles.some(r =>
            r === role ||
            r === role.toLowerCase() ||
            r === role.replace(/\s+/g, '_').toLowerCase() ||
            r.toLowerCase() === role.toLowerCase()
          );
        });

        setTrainings(myTrainings);

        // Also try by email if name didn't match
        let myCerts = allCerts;
        if (myCerts.length === 0 && email) {
          myCerts = await base44.entities.EmployeeCertification.filter({ employee_email: email }).catch(() => []);
        }
        setCertifications(myCerts || []);
      } catch (e) {
        console.error('Training/Cert load error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [employee, effectiveName, effectiveEmail]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Training & Certifications</h1>
        <p className="text-sm text-muted-foreground">Your assigned training and certification records</p>
      </div>

      {/* Training Section */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-blue-600" />
          Required Training
          {trainings.length > 0 && <Badge variant="secondary">{trainings.length}</Badge>}
        </h2>
        {trainings.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-12 text-center text-muted-foreground">
              <GraduationCap className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p>No required training assigned</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {trainings.map(t => <TrainingCard key={t.id} item={t} />)}
          </div>
        )}
      </div>

      {/* Certifications Section */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Award className="w-5 h-5 text-green-600" />
          My Certifications
          {certifications.length > 0 && <Badge variant="secondary">{certifications.length}</Badge>}
        </h2>
        {certifications.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Award className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p>No certifications assigned</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {certifications.map(c => <CertificationCard key={c.id} item={c} />)}
          </div>
        )}
      </div>

      {isImpersonating && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-3 text-xs text-amber-800">
            <strong>Dev:</strong> Data source — EmployeeRegistry (role: {employee?.primary_role || '—'})
            → TrainingRegistry.required_roles match → EmployeeCertification by name/email.
          </CardContent>
        </Card>
      )}
    </div>
  );
}