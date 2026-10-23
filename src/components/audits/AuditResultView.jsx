import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, XCircle, MinusCircle, AlertTriangle } from 'lucide-react';
import { parseSections, getScoreColor } from '@/lib/auditConstants';

const RESULT_CONFIG = {
  pass: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Pass' },
  fail: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Fail' },
  na: { icon: MinusCircle, color: 'text-gray-500', bg: 'bg-gray-50', label: 'N/A' },
};

export default function AuditResultView({ audit }) {
  const results = JSON.parse(audit.checklist_results || '[]');
  const scoreColor = getScoreColor(audit.pass_percentage || 0);

  // Group by section
  const grouped = {};
  results.forEach((r) => {
    if (!grouped[r.section]) grouped[r.section] = [];
    grouped[r.section].push(r);
  });

  return (
    <div className="space-y-4">
      {/* Score Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className={`text-3xl font-bold ${scoreColor.text}`}>{audit.pass_percentage || 0}%</p>
            <p className="text-xs text-muted-foreground mt-1">Pass Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-3xl font-bold">{audit.overall_score || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Overall Score</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-3xl font-bold text-red-600">{audit.failed_items || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Failed Items</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-3xl font-bold text-red-700">{audit.critical_failures || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Critical Failures</p>
          </CardContent>
        </Card>
      </div>

      {/* Results by Section */}
      {Object.entries(grouped).map(([sectionName, items]) => (
        <Card key={sectionName}>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">{sectionName}</h3>
            <div className="space-y-2">
              {items.map((item, i) => {
                const cfg = RESULT_CONFIG[item.result] || RESULT_CONFIG.na;
                const isCritical = item.result === 'fail' && item.required;
                return (
                  <div key={i} className={`flex items-start gap-3 rounded-lg p-2 ${cfg.bg} ${isCritical ? 'ring-2 ring-red-300' : ''}`}>
                    <cfg.icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{item.description}</p>
                        {isCritical && (
                          <span className="flex items-center gap-0.5 text-xs text-red-700 font-semibold">
                            <AlertTriangle className="w-3 h-3" /> CRITICAL
                          </span>
                        )}
                      </div>
                      {item.comments && <p className="text-xs text-muted-foreground mt-0.5">{item.comments}</p>}
                      {item.photos?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {item.photos.map((url, pi) => (
                            <img key={pi} src={url} alt="Audit photo" className="w-16 h-16 rounded-md object-cover" />
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span>Weight: {item.weight}</span>
                        {item.required && <span className="text-red-600">Required</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Comments */}
      {audit.comments && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-2">General Comments</h3>
            <p className="text-sm text-muted-foreground">{audit.comments}</p>
          </CardContent>
        </Card>
      )}

      {/* Signature */}
      {audit.digital_signature && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-2">Digital Signature</h3>
            <img src={audit.digital_signature} alt="Signature" className="max-h-24" />
            {audit.signed_by && <p className="text-xs text-muted-foreground mt-1">Signed by: {audit.signed_by}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}