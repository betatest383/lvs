import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, FileSearch, CheckCircle2, AlertTriangle, XCircle, Play } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function EmployeeAssignmentMigration() {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [report, setReport] = useState(null);

  const runPreview = async () => {
    setLoading(true);
    setReport(null);
    try {
      const res = await base44.functions.invoke('migrateEmployeeAssignments', { dry_run: true });
      setReport(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const runMigration = async () => {
    setApplying(true);
    try {
      const res = await base44.functions.invoke('migrateEmployeeAssignments', { dry_run: false });
      setReport(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setApplying(false);
    }
  };

  const entityEntries = report ? Object.entries(report.entities || {}) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin/dashboard">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Employee Assignment Migration</h1>
            <p className="text-muted-foreground text-sm">Convert typed employee names to EmployeeRegistry relationships</p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground mb-3">
            This tool scans all LVC OS records with manually typed employee names — tasks, notifications,
            certifications, corrective actions, onboarding records, equipment assignments, and truck profiles —
            matches them against EmployeeRegistry, and converts them to relationship-based assignments.
            Run a preview first to review matches before applying changes.
          </p>
          <div className="flex gap-2">
            <Button onClick={runPreview} disabled={loading || applying} variant="outline">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSearch className="w-4 h-4 mr-2" />}
              Preview Migration
            </Button>
            <Button onClick={runMigration} disabled={loading || applying} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {applying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Run Migration
            </Button>
          </div>
        </CardContent>
      </Card>

      {report && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="Employees in Registry" value={report.total_employees} icon={CheckCircle2} color="text-blue-600 bg-blue-50" />
            <StatCard label="Records Updated" value={report.applied} icon={CheckCircle2} color="text-green-600 bg-green-50" />
            <StatCard label="Mode" value={report.dry_run ? 'Preview' : 'Applied'} icon={FileSearch} color={report.dry_run ? 'text-blue-600 bg-blue-50' : 'text-green-600 bg-green-50'} />
          </div>

          {report.dry_run && (
            <Badge className="bg-blue-100 text-blue-700">Preview Mode — no changes applied</Badge>
          )}
          {!report.dry_run && (
            <Badge className="bg-green-100 text-green-700">Migration Applied — {report.applied} records updated</Badge>
          )}

          {entityEntries.map(([entityName, data]) => (
            <MigrationSection key={entityName} title={data.label} data={data} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function MigrationSection({ title, data }) {
  const { converted, unmatched, duplicates, records, scanned } = data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          {title}
          <span className="text-xs text-muted-font">({scanned} scanned)</span>
          <Badge className="bg-green-100 text-green-700">{converted} converted</Badge>
          {unmatched > 0 && <Badge className="bg-red-100 text-red-700">{unmatched} unmatched</Badge>}
          {duplicates > 0 && <Badge className="bg-amber-100 text-amber-700">{duplicates} duplicates</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {records.converted.length > 0 && (
          <ResultGroup
            title="Converted Assignments"
            icon={CheckCircle2}
            color="text-green-600"
            items={records.converted}
            renderItem={(item) => (
              <div className="flex items-center justify-between gap-2 text-sm py-1.5 border-b last:border-b-0">
                <div className="min-w-0">
                  <span className="font-medium truncate">{item.identifier}</span>
                  <span className="text-muted-foreground ml-2">
                    "{item.original_name || item.original_email}" → {item.matched_employee_name}
                  </span>
                </div>
                <Badge className="bg-green-50 text-green-600 text-xs">{item.match_method}</Badge>
              </div>
            )}
          />
        )}
        {records.unmatched.length > 0 && (
          <ResultGroup
            title="Unmatched Names"
            icon={XCircle}
            color="text-red-600"
            items={records.unmatched}
            renderItem={(item) => (
              <div className="text-sm py-1.5 border-b last:border-b-0">
                <span className="font-medium">{item.identifier}</span>
                <span className="text-muted-foreground ml-2">
                  Could not match: "{item.original_name}" {item.original_email ? `(${item.original_email})` : ''}
                </span>
              </div>
            )}
          />
        )}
        {records.duplicates.length > 0 && (
          <ResultGroup
            title="Duplicate Names — Manual Review Required"
            icon={AlertTriangle}
            color="text-amber-600"
            items={records.duplicates}
            renderItem={(item) => (
              <div className="text-sm py-2 border-b last:border-b-0">
                <span className="font-medium">{item.identifier}</span>
                <span className="text-muted-foreground ml-2">"{item.original_name}" matches multiple employees:</span>
                <div className="ml-4 mt-1 space-y-1">
                  {item.duplicate_matches.map((dup, i) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      • {dup.employee_name} ({dup.email})
                    </div>
                  ))}
                </div>
              </div>
            )}
          />
        )}
        {converted === 0 && unmatched === 0 && duplicates === 0 && (
          <p className="text-sm text-muted-foreground py-2">No assignments found requiring migration.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ResultGroup({ title, icon: Icon, color, items, renderItem }) {
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${color}`}>
        <Icon className="w-3.5 h-3.5" /> {title} ({items.length})
      </p>
      <div className="max-h-64 overflow-y-auto">
        {items.map((item, i) => (
          <div key={i}>{renderItem(item)}</div>
        ))}
      </div>
    </div>
  );
}