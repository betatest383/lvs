import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wrench, Shield, DollarSign } from 'lucide-react';

export default function PresentationRecommendations({ repairRecs, draftEstimateItems }) {
  if (!repairRecs || repairRecs.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground italic">No recommendations to present.</p>
        </CardContent>
      </Card>
    );
  }

  // Build a map of service_name → price from draft estimate items
  const priceMap = {};
  for (const item of (draftEstimateItems || [])) {
    if (item.service_name) {
      priceMap[item.service_name.toLowerCase()] = item.total_item_price || item.service_price || 0;
    }
  }

  return (
    <div className="space-y-2">
      {repairRecs.map((rec, i) => {
        const customerSummary = rec.customer_facing_explanation || rec.recommendation_summary || '';
        const solution = rec.recommendation_title || '';
        const relatedService = rec.recommendation_title || '';
        const price = priceMap[(relatedService || '').toLowerCase()] || null;

        // Try to get warranty messaging from good_better_best_options
        let warranty = '';
        try {
          const options = typeof rec.good_better_best_options === 'string'
            ? JSON.parse(rec.good_better_best_options || '[]')
            : (rec.good_better_best_options || []);
          if (Array.isArray(options) && options.length > 0) {
            const selected = options.find(o => o.selected) || options[0];
            warranty = selected?.customer_description || '';
          }
        } catch { /* ignore */ }

        return (
          <Card key={rec.id || i}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start gap-2">
                <Wrench className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{rec.recommendation_title}</p>
                  {rec.repair_system_type && (
                    <p className="text-[10px] text-muted-foreground uppercase">{rec.repair_system_type.replace(/_/g, ' ')}</p>
                  )}
                </div>
                {rec.severity && (
                  <Badge variant="outline" className="text-[10px] capitalize">{rec.severity}</Badge>
                )}
              </div>

              {customerSummary && <p className="text-sm text-muted-foreground">{customerSummary}</p>}

              {solution && (
                <div>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Recommended Solution</p>
                  <p className="text-sm">{solution}</p>
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                {price !== null && price > 0 && (
                  <div className="flex items-center gap-1 text-sm">
                    <DollarSign className="w-3.5 h-3.5 text-green-600" />
                    <span className="font-semibold">${price.toFixed(2)}</span>
                  </div>
                )}
                {warranty && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Shield className="w-3.5 h-3.5" />
                    <span>{warranty}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}