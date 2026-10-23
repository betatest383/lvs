import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Lightbulb, ArrowRight } from 'lucide-react';

// Rule-based insights — will be replaced by AI-powered recommendations in future
const INSIGHTS = [
  'Warehouse departures averaged 18 minutes longer today.',
  'Inventory count accuracy dropped 2% this week.',
  'Three technicians are behind on training.',
  'Customer callbacks increased 14% vs. last week.',
  'SOP review cycle time has improved by 3 days.',
];

export default function AiInsights() {
  return (
    <Card className="border-accent/30 bg-accent/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" /> AI Insights
          <span className="text-xs font-normal text-muted-foreground ml-auto">Rule-based</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {INSIGHTS.map((insight, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-lg bg-background/50 p-2.5">
              <Lightbulb className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <p className="text-sm flex-1">{insight}</p>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1 opacity-50" />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3 italic">
          Future enhancement: AI-powered recommendations with predictive forecasting.
        </p>
      </CardContent>
    </Card>
  );
}