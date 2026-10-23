import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarX, PackageX, Undo2, Package, Sparkles, ClipboardCheck } from 'lucide-react';
import { NO_JOB_ACTIONS } from '@/lib/jobHubDailyConfig';
import { useNavigate } from 'react-router-dom';

export default function NoJobActions({ onStartMorningWorkflow }) {
  const navigate = useNavigate();

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <CalendarX className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">No Job Scheduled Today</h3>
            <p className="text-xs text-muted-foreground">Complete warehouse tasks and morning workflow</p>
          </div>
        </div>

        <Button variant="outline" className="w-full gap-1.5" onClick={onStartMorningWorkflow}>
          <Sparkles className="w-4 h-4" /> Open Morning Workflow
        </Button>

        <div className="border-t pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Available Actions</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {NO_JOB_ACTIONS.map(action => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-colors hover:shadow-sm ${action.color}`}
                  onClick={() => navigate(action.link)}
                >
                  <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold">{action.label}</p>
                    <p className="text-[10px] opacity-80 mt-0.5">{action.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}