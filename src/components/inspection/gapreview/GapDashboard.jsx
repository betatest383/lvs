import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';

function StatCard({ label, value, color, tooltip }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-3">
        <div className="flex items-center gap-1 mb-0.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-3 h-3 text-muted-foreground/50 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px] text-xs">{tooltip}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <p className={`text-2xl font-bold ${color || ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export default function GapDashboard({ gaps }) {
  const totalGaps = gaps.length;
  const uniqueQuestions = new Set(gaps.map(g => g.question_id)).size;
  const fixed = gaps.filter(g => g.status === 'fixed').length;
  const reviewed = gaps.filter(g => g.status === 'reviewed' || g.status === 'accepted').length;
  const deferred = gaps.filter(g => g.status === 'deferred').length;
  const notApplicable = gaps.filter(g => g.status === 'not_applicable').length;
  const remaining = totalGaps - fixed - notApplicable;
  const resolved = fixed + notApplicable;
  const completionPct = totalGaps > 0 ? Math.round((resolved / totalGaps) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Primary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <StatCard
          label="Questions Requiring Review"
          value={uniqueQuestions}
          color="text-red-600"
          tooltip="Number of unique inspection questions that have at least one detected gap."
        />
        <StatCard
          label="Total Gap Instances"
          value={totalGaps}
          color="text-orange-600"
          tooltip="Total count of individual gap instances across all questions. A single question may have multiple gaps."
        />
        <StatCard label="Fixed" value={fixed} color="text-green-600" />
        <StatCard label="Reviewed" value={reviewed} color="text-cyan-600" />
        <StatCard label="Deferred" value={deferred} color="text-orange-600" />
        <StatCard label="Remaining" value={remaining} color="text-amber-600" />
        <StatCard label="N/A" value={notApplicable} color="text-gray-500" />
      </div>

      {/* Completion progress bar */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold">Inspection Improvement Progress</p>
            <p className="text-lg font-bold text-green-600">{completionPct}%</p>
          </div>
          <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-500"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {resolved} of {totalGaps} gaps resolved · {remaining} remaining
          </p>
        </CardContent>
      </Card>
    </div>
  );
}