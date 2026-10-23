import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, ImageIcon } from 'lucide-react';

const SEVERITY_STYLES = {
  info: 'bg-blue-100 text-blue-700',
  minor: 'bg-yellow-100 text-yellow-700',
  moderate: 'bg-orange-100 text-orange-700',
  major: 'bg-red-100 text-red-700',
  critical: 'bg-red-900 text-white',
};

export default function PresentationFindings({ findings, legacyFindings, recommendationReviewItems }) {
  const allFindings = [
    ...(findings || []).filter(f => f.is_deficiency !== false && !f.internal_only),
    ...(legacyFindings || []),
  ];

  // Map review items by finding_id for customer summaries
  const reviewItemMap = {};
  for (const ri of (recommendationReviewItems || [])) {
    if (ri.finding_id) reviewItemMap[ri.finding_id] = ri;
  }

  if (allFindings.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground italic">No customer-facing findings to present.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {allFindings.map((f, i) => {
        const reviewItem = reviewItemMap[f.id];
        const title = f.finding_location || f.title || `Finding ${i + 1}`;
        const description = f.customer_facing_explanation || reviewItem?.customer_summary || f.description || '';
        const whyItMatters = reviewItem?.source_description || f.recommended_repair || '';
        const photos = f.photo_urls || [];

        return (
          <Card key={f.id || i}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{title}</p>
                  {f.deficiency_type && (
                    <p className="text-[10px] text-muted-foreground uppercase">{f.deficiency_type.replace(/_/g, ' ')}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Badge className={`text-[10px] ${SEVERITY_STYLES[f.severity] || 'bg-gray-100 text-gray-700'}`}>
                    {f.severity || 'unknown'}
                  </Badge>
                  {f.safety_concern && <ShieldAlert className="w-4 h-4 text-red-500" />}
                </div>
              </div>

              {description && <p className="text-sm text-muted-foreground">{description}</p>}

              {whyItMatters && (
                <div className="rounded bg-amber-50 border border-amber-200 p-2">
                  <p className="text-[10px] font-semibold uppercase text-amber-700 mb-0.5">Why It Matters</p>
                  <p className="text-xs text-amber-900">{whyItMatters}</p>
                </div>
              )}

              {photos.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {photos.slice(0, 5).map((url, pi) => (
                    <a key={pi} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt={`Finding photo ${pi + 1}`} className="w-14 h-14 object-cover rounded border" />
                    </a>
                  ))}
                  {photos.length > 5 && (
                    <div className="w-14 h-14 rounded border flex items-center justify-center text-xs text-muted-foreground">
                      +{photos.length - 5}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}