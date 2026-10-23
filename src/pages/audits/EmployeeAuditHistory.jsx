import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { Users, Search } from 'lucide-react';
import StatCard from '@/components/ci/StatCard';
import AuditResultView from '@/components/audits/AuditResultView';
import { getScoreColor, calcCompliance, getEmployeeStats } from '@/lib/auditConstants';

export default function EmployeeAuditHistory() {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedAudit, setSelectedAudit] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setAudits(await base44.entities.ManagementAudit.list('-created_date', 500)); } catch (e) { console.error(e); }
    setLoading(false);
  };

  // Get unique employees
  const employees = [...new Set(audits.map((a) => a.employee).filter(Boolean))].sort();
  const filteredEmployees = employees.filter((e) => !search || e.toLowerCase().includes(search.toLowerCase()));

  if (selectedAudit) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{selectedAudit.audit_number}</h1>
          <button onClick={() => setSelectedAudit(null)} className="text-sm text-accent">← Back</button>
        </div>
        <AuditResultView audit={selectedAudit} />
      </div>
    );
  }

  if (selectedEmployee) {
    const empAudits = audits.filter((a) => a.employee === selectedEmployee);
    const stats = getEmployeeStats(audits, selectedEmployee);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{selectedEmployee}</h1>
            <p className="text-sm text-muted-foreground">Audit History & Scorecard</p>
          </div>
          <button onClick={() => setSelectedEmployee(null)} className="text-sm text-accent">← Back to List</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Audits" value={stats.audits} icon={Users} color="text-blue-500" />
          <StatCard label="Completed" value={stats.completed} icon={Users} color="text-green-500" />
          <StatCard label="Avg Score" value={`${stats.avgScore}%`} icon={Users} color={getScoreColor(stats.avgScore).text} />
          <StatCard label="Compliance" value={`${stats.compliance}%`} icon={Users} color="text-green-500" />
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Audit History</CardTitle></CardHeader>
          <CardContent className="p-0">
            {empAudits.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No audits found.</p>
            ) : (
              <div className="divide-y divide-border/50">
                {empAudits.map((a) => {
                  const scoreC = getScoreColor(a.pass_percentage || 0);
                  return (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelectedAudit(a)}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{a.audit_number}</p>
                        <p className="text-xs text-muted-foreground">{a.audit_template_name} · {a.date}</p>
                      </div>
                      <span className={`text-sm font-bold ${scoreC.text}`}>{a.pass_percentage || 0}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="w-6 h-6 text-accent" /> Employee Audit History
        </h1>
        <p className="text-muted-foreground text-sm">View audit history and scorecards by employee</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : filteredEmployees.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No employees found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredEmployees.map((name) => {
            const stats = getEmployeeStats(audits, name);
            const scoreC = getScoreColor(stats.avgScore);
            return (
              <Card key={name} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedEmployee(name)}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold shrink-0">
                      {name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{name}</p>
                      <p className="text-xs text-muted-foreground">{stats.audits} audit{stats.audits !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Avg Score</span>
                    <span className={`font-bold ${scoreC.text}`}>{stats.avgScore}%</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-muted-foreground">Compliance</span>
                    <span className="font-medium">{stats.compliance}%</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}