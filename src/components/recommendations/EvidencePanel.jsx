import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, AlertTriangle, Camera, Ruler, FileWarning, ShieldAlert, Lightbulb } from 'lucide-react';

function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function FindingRow({ finding }) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] capitalize">{finding.severity}</Badge>
          <span className="text-xs font-medium truncate">{finding.finding_location || finding.deficiency_type}</span>
          {finding.safety_concern && (
            <Badge className="text-[10px] bg-red-100 text-red-700"><ShieldAlert className="w-2.5 h-2.5" /> Safety</Badge>
          )}
          {finding.nfpa_code_failure && (
            <Badge className="text-[10px] bg-orange-100 text-orange-700"><FileWarning className="w-2.5 h-2.5" /> NFPA</Badge>
          )}
        </div>
        {finding.customer_facing_explanation && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{finding.customer_facing_explanation}</p>
        )}
      </div>
      {finding.photo_count > 0 && (
        <Badge variant="secondary" className="text-[10px] gap-1 flex-shrink-0">
          <Camera className="w-2.5 h-2.5" /> {finding.photo_count}
        </Badge>
      )}
    </div>
  );
}

export default function EvidencePanel({ repairSystem }) {
  const [expanded, setExpanded] = useState(false);

  const findings = safeParse(repairSystem.related_findings_detail, []);
  const photos = repairSystem.related_photos || [];
  const measurements = safeParse(repairSystem.related_measurements, {});

  return (
    <div className="border-t border-border pt-3 mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        Why This Recommendation Exists
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          {/* Supporting Findings */}
          <div>
            <p className="text-xs font-medium mb-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
              Supporting Findings ({findings.length})
            </p>
            <div className="space-y-1.5">
              {findings.map((f, i) => (
                <FindingRow key={f.id || i} finding={f} />
              ))}
            </div>
          </div>

          {/* Photos */}
          {photos.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1.5 flex items-center gap-1">
                <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                Photos ({photos.length})
              </p>
              <div className="flex gap-2 flex-wrap">
                {photos.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Evidence ${i + 1}`}
                    className="w-16 h-16 rounded-md object-cover border border-border"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Measurements */}
          {Object.keys(measurements).length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1.5 flex items-center gap-1">
                <Ruler className="w-3.5 h-3.5 text-muted-foreground" />
                Measurements
              </p>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(measurements).map(([key, val]) => (
                  <Badge key={key} variant="secondary" className="text-xs gap-1">
                    <span className="text-muted-foreground">{key}:</span> {val}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Code / NFPA References */}
          {repairSystem.code_nfpa_references && (
            <div>
              <p className="text-xs font-medium mb-1 flex items-center gap-1">
                <FileWarning className="w-3.5 h-3.5 text-muted-foreground" />
                Code / NFPA References
              </p>
              <p className="text-xs text-muted-foreground pl-5">{repairSystem.code_nfpa_references}</p>
            </div>
          )}

          {/* Safety Concern */}
          {repairSystem.safety_concern && (
            <div className="flex items-center gap-1.5 p-2 rounded-md bg-red-50 border border-red-200">
              <ShieldAlert className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
              <span className="text-xs text-red-700 font-medium">Safety concern identified in supporting findings</span>
            </div>
          )}

          {/* Customer-Facing Explanation */}
          {repairSystem.customer_facing_explanation && (
            <div>
              <p className="text-xs font-medium mb-1 flex items-center gap-1">
                <Lightbulb className="w-3.5 h-3.5 text-muted-foreground" />
                Customer-Facing Explanation
              </p>
              <p className="text-xs text-muted-foreground pl-5 italic">{repairSystem.customer_facing_explanation}</p>
            </div>
          )}

          {/* Internal Reasoning */}
          {repairSystem.internal_technician_notes && (
            <div>
              <p className="text-xs font-medium mb-1 text-muted-foreground">Internal Reasoning</p>
              <p className="text-xs text-muted-foreground pl-5">{repairSystem.internal_technician_notes}</p>
            </div>
          )}

          {/* Confidence Reason */}
          {repairSystem.confidence_reason && (
            <div>
              <p className="text-xs font-medium mb-1 text-muted-foreground">Confidence Basis</p>
              <p className="text-xs text-muted-foreground pl-5">{repairSystem.confidence_reason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}