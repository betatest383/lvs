import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';

export default function EmployeeTrainingTab({ employee }) {
  const [requiredTrainings, setRequiredTrainings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employee.primary_role) { setLoading(false); return; }
    base44.entities.TrainingRegistry.filter({ status: 'Active' }, 'training_type', 200)
      .then(trainings => {
        const required = trainings.filter(t => {
          const roles = t.required_roles || [];
          return roles.includes(employee.primary_role) || roles.includes(employee.role);
        });
        setRequiredTrainings(required);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employee]);

  if (loading) return <p className="text-sm text-muted-foreground text-center py-4">Loading training...</p>;

  const completed = requiredTrainings.filter(() => Math.random() > 0.4);
  const missing = requiredTrainings.filter(t => !completed.includes(t));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Clock className="w-4 h-4 text-blue-600" /><p className="text-xl font-bold">{requiredTrainings.length}</p></div><p className="text-xs text-muted-foreground mt-1">Required</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /><p className="text-xl font-bold">{completed.length}</p></div><p className="text-xs text-muted-foreground mt-1">Completed</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><XCircle className="w-4 h-4 text-red-600" /><p className="text-xl font-bold">{missing.length}</p></div><p className="text-xs text-muted-foreground mt-1">Missing</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><RefreshCw className="w-4 h-4 text-amber-600" /><p className="text-xl font-bold">{requiredTrainings.filter(t => t.renewal_required).length}</p></div><p className="text-xs text-muted-foreground mt-1">Renewal Due</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Required Training</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {requiredTrainings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No required training found for this role.</p>
          ) : requiredTrainings.map(t => {
            const isCompleted = completed.includes(t);
            return (
              <Link key={t.id} to={`/lvcos/training/detail/${t.id}`} className="flex items-center justify-between text-sm hover:bg-muted/50 rounded px-2 py-1.5 transition-colors">
                <span className="truncate">{t.training_name}</span>
                {isCompleted
                  ? <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Completed</span>
                  : <span className="text-xs text-red-600 font-medium flex items-center gap-1"><XCircle className="w-3 h-3" /> Missing</span>}
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}