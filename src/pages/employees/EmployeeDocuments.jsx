import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileText, Upload, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { EMPLOYMENT_STATUS_COLORS } from '@/lib/employeeRegistryConstants';

const DOC_CATEGORIES = ["Driver's License", 'Certifications', 'Signed Policies', 'Employment Forms', 'Performance Reviews', 'Coaching Records', 'Other'];

export default function EmployeeDocuments() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.EmployeeRegistry.list('-created_date', 500)
      .then(setEmployees)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Employee Documents</h1>
        <p className="text-muted-foreground text-sm">Document management across all employees</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {DOC_CATEGORIES.map(cat => (
          <Card key={cat}><CardContent className="p-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-blue-100 text-blue-600"><FileText className="w-4 h-4" /></div>
            <p className="text-sm font-medium">{cat}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Employees</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1">
            {employees.filter(e => e.employment_status === 'Active').map(e => (
              <Link key={e.id} to={`/lvcos/employees/detail/${e.id}`} className="flex items-center justify-between text-sm hover:bg-muted/50 rounded px-2 py-1.5 transition-colors">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{e.first_name} {e.last_name}</span>
                </div>
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${EMPLOYMENT_STATUS_COLORS[e.employment_status]}`}>{e.employment_status}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}