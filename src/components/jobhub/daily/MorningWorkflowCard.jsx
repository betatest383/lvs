import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sunrise, ExternalLink, CheckCircle2, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getStepStatus } from '@/lib/jobHubDailyConfig';

const STATUS_CONFIG = {
  not_started: { badge: 'bg-gray-100 text-gray-600', label: 'Not Started', color: 'text-gray-500' },
  in_progress: { badge: 'bg-amber-100 text-amber-700', label: 'In Progress', color: 'text-amber-600' },
  complete: { badge: 'bg-green-100 text-green-700', label: 'Complete', color: 'text-green-600' },
  manager_override: { badge: 'bg-purple-100 text-purple-700', label: 'Manager Override', color: 'text-purple-600' },
};

export default function MorningWorkflowCard({ morningRun, checklist, onStart, onComplete, hasJob }) {
  const navigate = useNavigate();
  const status = getStepStatus('morning_workflow', checklist);
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.not_started;
  const isComplete = status === 'complete' || status === 'manager_override';

  const handleOpen = async () => {
    await onStart();
    navigate('/tech/readiness');
  };

  return (
    <Card className={`border-0 shadow-sm ${isComplete ? 'bg-green-50/40' : status === 'in_progress' ? 'bg-amber-50/40' : ''}`}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isComplete ? 'bg-green-100' : 'bg-accent/10'}`}>
              <Sunrise className={`w-5 h-5 ${isComplete ? 'text-green-600' : 'text-accent'}`} />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Morning Workflow WH-105</h3>
              <p className="text-xs text-muted-foreground">First task of the day</p>
            </div>
          </div>
          <Badge className={config.badge}>{config.label}</Badge>
        </div>

        <div className="flex gap-2">
          {!isComplete && (
            <>
              <Button size="sm" variant="outline" className="gap-1 flex-1" onClick={handleOpen}>
                <ExternalLink className="w-3.5 h-3.5" /> Open Morning Workflow
              </Button>
              {status === 'in_progress' && (
                <Button size="sm" className="gap-1 flex-1" onClick={onComplete}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Mark Complete
                </Button>
              )}
            </>
          )}
          {isComplete && (
            <Button size="sm" variant="ghost" className="gap-1 w-full" onClick={handleOpen}>
              <ExternalLink className="w-3.5 h-3.5" /> Re-open Morning Workflow
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}