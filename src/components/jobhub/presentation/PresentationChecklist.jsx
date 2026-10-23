import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle } from 'lucide-react';

const CHECKLIST_ITEMS = [
  { key: 'reviewed_inspection_report', label: 'Reviewed inspection report' },
  { key: 'reviewed_photos', label: 'Reviewed photos' },
  { key: 'explained_findings', label: 'Explained findings' },
  { key: 'explained_recommended_repairs', label: 'Explained recommended repairs' },
  { key: 'presented_proposal_options', label: 'Presented proposal options' },
  { key: 'reviewed_selected_option_price', label: 'Reviewed selected option price' },
  { key: 'discussed_scheduling_options', label: 'Discussed scheduling options' },
  { key: 'answered_customer_questions', label: 'Answered customer questions' },
];

export default function PresentationChecklist({ checklist, onToggle }) {
  const completedCount = CHECKLIST_ITEMS.filter(item => checklist[item.key]?.checked).length;
  const allComplete = completedCount === CHECKLIST_ITEMS.length;

  return (
    <Card className={allComplete ? 'border-green-400' : ''}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Presentation Checklist</p>
          <span className={`text-xs font-medium ${allComplete ? 'text-green-600' : 'text-muted-foreground'}`}>
            {completedCount}/{CHECKLIST_ITEMS.length}
          </span>
        </div>
        {CHECKLIST_ITEMS.map(item => {
          const checked = checklist[item.key]?.checked || false;
          return (
            <Button
              key={item.key}
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 h-auto py-2"
              onClick={() => onToggle(item.key)}
            >
              {checked
                ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                : <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              }
              <span className={`text-sm text-left ${checked ? 'text-green-700' : 'text-foreground'}`}>
                {item.label}
              </span>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}