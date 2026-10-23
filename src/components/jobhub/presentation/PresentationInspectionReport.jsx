import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileText, AlertTriangle, ShieldAlert, ImageIcon, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react';

const SEVERITY_STYLES = {
  info: 'bg-blue-100 text-blue-700',
  minor: 'bg-yellow-100 text-yellow-700',
  moderate: 'bg-orange-100 text-orange-700',
  major: 'bg-red-100 text-red-700',
  critical: 'bg-red-900 text-white',
};

function ReportDiagnostics({ diagnostics }) {
  const [expanded, setExpanded] = useState(false);
  if (!diagnostics) return null;
  return (
    <Card className="border-red-200 bg-red-50/50">
      <CardContent className="p-3">
        <button
          className="flex items-center gap-1 text-xs font-semibold text-red-700 w-full"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Admin Diagnostics: Report Generation Error
        </button>
        {expanded && (
          <div className="mt-2 space-y-1 text-xs font-mono">
            {Object.entries(diagnostics).map(([key, val]) => (
              <div key={key} className="flex gap-2">
                <span className="text-muted-foreground font-semibold whitespace-nowrap">{key}:</span>
                <span className="break-all">{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PresentationInspectionReport({
  inspectionReport, findings, legacyFindings, submissions, onViewFullReport, diagnostics,
}) {
  const allFindings = [
    ...(findings || []).filter(f => f.is_deficiency !== false && !f.internal_only),
    ...(legacyFindings || []),
  ];

  const deficiencies = allFindings.filter(f => f.is_deficiency !== false);
  const failedItems = allFindings.filter(f => f.nfpa_code_failure || f.safety_concern);

  const allPhotos = [];
  if (inspectionReport?.photos) allPhotos.push(...inspectionReport.photos);
  for (const sub of (submissions || [])) {
    try {
      const photos = typeof sub.photos === 'string' ? JSON.parse(sub.photos) : (sub.photos || []);
      if (Array.isArray(photos)) allPhotos.push(...photos);
    } catch { /* ignore */ }
  }
  for (const f of allFindings) {
    if (f.photo_urls) allPhotos.push(...f.photo_urls);
  }

  const summary = inspectionReport?.ai_summary_final || inspectionReport?.ai_summary_draft || inspectionReport?.summary || '';
  const techNotes = inspectionReport?.ai_summary_notes || '';

  return (
    <div className="space-y-3">
      <ReportDiagnostics diagnostics={diagnostics} />
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-accent" />
              <h3 className="font-semibold">Inspection Report</h3>
            </div>
            {inspectionReport && (
              <Button size="sm" variant="outline" className="gap-1" onClick={onViewFullReport}>
                <ExternalLink className="w-3.5 h-3.5" /> View Full Inspection Report
              </Button>
            )}
          </div>

          {summary ? (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Summary</p>
              <p className="text-sm whitespace-pre-wrap">{summary}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No inspection summary available.</p>
          )}

          {techNotes && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Technician Notes</p>
              <p className="text-sm whitespace-pre-wrap">{techNotes}</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border p-2">
              <p className="text-lg font-bold">{deficiencies.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Deficiencies</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-lg font-bold text-red-600">{failedItems.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Failed / Safety</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-lg font-bold">{allPhotos.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Photos</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {allPhotos.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1">
              <ImageIcon className="w-3.5 h-3.5" /> Inspection Photos
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {allPhotos.slice(0, 12).map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt={`Photo ${i + 1}`} className="w-full aspect-square object-cover rounded border hover:ring-2 hover:ring-accent" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {deficiencies.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Deficiencies Found
            </p>
            {deficiencies.map((f, i) => (
              <div key={f.id || i} className="flex items-start gap-2 rounded border p-2">
                <Badge className={`text-[10px] ${SEVERITY_STYLES[f.severity] || 'bg-gray-100 text-gray-700'}`}>
                  {f.severity || 'unknown'}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{f.finding_location || f.title || `Finding ${i + 1}`}</p>
                  {f.customer_facing_explanation && (
                    <p className="text-xs text-muted-foreground">{f.customer_facing_explanation}</p>
                  )}
                </div>
                {f.safety_concern && <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0" />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}