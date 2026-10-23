import { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2, Stethoscope, AlertTriangle, CheckCircle2, XCircle,
  FileText, ClipboardList, Layers, Package, ArrowDown,
} from 'lucide-react';
import { toast } from 'sonner';

export default function InspectionPipelineDiagnostic({ jobId, autoRun = false }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const runDiagnostic = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const response = await base44.functions.invoke('traceInspectionPipeline', { job_id: jobId });
      setData(response.data);
    } catch (e) {
      toast.error('Diagnostic failed: ' + (e?.response?.data?.error || e?.message));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  // Auto-run on mount if requested
  useState(() => {
    if (autoRun && jobId) runDiagnostic();
  });

  if (loading) {
    return (
      <Card className="border-slate-200">
        <CardContent className="py-6 flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Tracing inspection pipeline...</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="border-slate-200">
        <CardContent className="py-4">
          <Button onClick={runDiagnostic} variant="outline" size="sm">
            <Stethoscope className="w-4 h-4 mr-1" /> Run Pipeline Diagnostic
          </Button>
        </CardContent>
      </Card>
    );
  }

  const s = data.diagnostic_summary;

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Stethoscope className="w-4 h-4" />
          Inspection Pipeline Diagnostic
          <Badge variant="outline" className="text-xs">Job {data.job_number || data.job_id.substring(0, 8)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatBox icon={FileText} label="Submissions" value={s.total_submissions} />
          <StatBox icon={AlertTriangle} label="Interior Failed" value={s.interior_failed_responses} color="orange" />
          <StatBox icon={AlertTriangle} label="Exterior Failed" value={s.exterior_failed_responses} color={s.exterior_failed_responses > 0 && s.exterior_findings === 0 ? "red" : "orange"} />
          <StatBox icon={CheckCircle2} label="Total Findings" value={s.total_findings} />
          <StatBox icon={CheckCircle2} label="Interior Findings" value={s.interior_findings} color="green" />
          <StatBox icon={CheckCircle2} label="Exterior Findings" value={s.exterior_findings} color={s.exterior_findings === 0 && s.exterior_failed_responses > 0 ? "red" : "green"} />
          <StatBox icon={ClipboardList} label="Recommendations" value={s.total_recommendations} />
          <StatBox icon={Layers} label="Groups" value={s.total_groups} />
          <StatBox icon={Package} label="Packages" value={s.total_packages} />
          <StatBox icon={Package} label="Package Items" value={s.total_package_items} />
        </div>

        {/* Exterior Exclusion Alert */}
        {s.exterior_records_excluded > 0 && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="text-sm font-semibold text-red-900">
                {s.exterior_records_excluded} Exterior Record(s) Excluded
              </span>
            </div>
            <div className="space-y-1">
              {data.exterior_excluded_records.map((ex, i) => (
                <div key={i} className="text-xs text-red-800 bg-white/50 rounded p-2">
                  <p className="font-medium">{ex.question_text}</p>
                  <p className="text-red-600">Answer: {ex.answer_value}</p>
                  <p className="text-red-700 mt-0.5">⚠ {ex.exclusion_reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submission Traces */}
        {data.submission_traces.length > 0 && (
          <TraceSection title="Submissions → Failed Answers → Findings" icon={FileText}>
            {data.submission_traces.map((sub, i) => (
              <div key={i} className="border-b pb-2 mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className={sub.inspection_type === 'exterior' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}>
                    {sub.inspection_type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {sub.failed_answer_count} failed / {sub.total_answers} total
                  </span>
                </div>
                {sub.failed_answers.map((fa, j) => (
                  <div key={j} className="ml-3 text-xs mb-1 flex items-start gap-1">
                    {fa.finding_generated
                      ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
                      : <XCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />}
                    <div>
                      <span className="font-medium">{fa.question_text}</span>
                      <span className="text-muted-foreground"> → {fa.answer_value}</span>
                      {fa.finding_generated ? (
                        <span className="text-green-600 ml-1">✓ Finding: {fa.finding_deficiency_type} ({fa.finding_interior_exterior})</span>
                      ) : (
                        <span className="text-red-600 ml-1">✗ {fa.exclusion_reason}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </TraceSection>
        )}

        {/* Finding Traces */}
        {data.finding_traces.length > 0 && (
          <TraceSection title="Findings → Recommendations → Groups" icon={CheckCircle2}>
            {data.finding_traces.map((f, i) => (
              <div key={i} className="text-xs border-b pb-1 mb-1 flex items-start gap-1">
                {f.recommendation_id
                  ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
                  : <XCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />}
                <div>
                  <Badge variant="outline" className="text-[10px] mr-1">{f.interior_exterior}</Badge>
                  <span className="font-medium">{f.deficiency_type}</span>
                  <span className="text-muted-foreground"> — {f.finding_location?.substring(0, 60)}</span>
                  {f.recommendation_id ? (
                    <span className="text-green-600 ml-1">→ Rec: {f.recommendation_title}</span>
                  ) : (
                    <span className="text-red-600 ml-1">✗ {f.exclusion_reason}</span>
                  )}
                </div>
              </div>
            ))}
          </TraceSection>
        )}

        {/* Group Traces */}
        {data.group_traces.length > 0 && (
          <TraceSection title="Estimate Groups → Items" icon={Layers}>
            {data.group_traces.map((g, i) => (
              <div key={i} className="text-xs border-b pb-1 mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{g.group_name}</span>
                  <Badge variant="outline" className="text-[10px]">{g.group_type}</Badge>
                  <Badge variant="outline" className="text-[10px]">{g.item_count} items</Badge>
                  {g.confirmed && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                </div>
                {g.items.map((item, j) => (
                  <div key={j} className="ml-3 text-muted-foreground">
                    → rec: {item.recommendation_id?.substring(0, 12) || '(none)'}
                    {item.finding_id && ` ← finding: ${item.finding_id.substring(0, 12)}`}
                  </div>
                ))}
              </div>
            ))}
          </TraceSection>
        )}

        {/* Package Traces */}
        {data.package_traces.length > 0 && (
          <TraceSection title="Packages → Contents" icon={Package}>
            {data.package_traces.map((p, i) => (
              <div key={i} className="text-xs border-b pb-1 mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.package_name}</span>
                  <Badge variant="outline" className="text-[10px]">{p.option_type}</Badge>
                  <Badge variant="outline" className="text-[10px]">{p.estimate_item_count} items</Badge>
                </div>
                {p.estimate_items.map((ei, j) => (
                  <div key={j} className="ml-3 flex items-center gap-1">
                    <ArrowDown className="w-2.5 h-2.5 text-muted-foreground" />
                    <span>{ei.service_name}</span>
                    {ei.is_exterior && <Badge className="text-[10px] bg-blue-100 text-blue-700">Exterior</Badge>}
                  </div>
                ))}
              </div>
            ))}
          </TraceSection>
        )}

        <Button onClick={runDiagnostic} variant="ghost" size="sm" className="text-xs">
          <Stethoscope className="w-3 h-3 mr-1" /> Re-run Diagnostic
        </Button>
      </CardContent>
    </Card>
  );
}

function StatBox({ icon: Icon, label, value, color = 'slate' }) {
  const colorClasses = {
    green: 'text-green-600',
    red: 'text-red-600',
    orange: 'text-orange-600',
    slate: 'text-slate-700',
  };
  return (
    <div className="rounded-lg border p-2 text-center">
      <Icon className={`w-4 h-4 mx-auto mb-1 ${colorClasses[color] || colorClasses.slate}`} />
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function TraceSection({ title, icon: Icon, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1 mb-1">
        <Icon className="w-3 h-3" /> {title}
      </p>
      {children}
    </div>
  );
}