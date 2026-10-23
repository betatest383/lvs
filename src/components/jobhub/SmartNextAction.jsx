import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronRight, Lock, CheckCircle2, Eye, Play, ArrowRight } from 'lucide-react';

export default function SmartNextAction({ nextAction, onStart, isLead }) {
  if (!nextAction) {
    return (
      <Card className="border-0 shadow-md bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-l-green-500">
        <CardContent className="p-5 flex items-center gap-4">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
          <div>
            <p className="text-lg font-bold text-green-900">Appointment Complete</p>
            <p className="text-sm text-green-700">All workflow stages have been finished.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { stage, state, action, label, description } = nextAction;
  const Icon = stage?.icon || Play;
  const isLocked = action === 'locked';
  const isReview = action === 'review';

  const getActionIcon = () => {
    if (isLocked) return Lock;
    if (isReview) return Eye;
    if (action === 'continue') return Play;
    if (action === 'done') return CheckCircle2;
    return ArrowRight;
  };
  const ActionIcon = getActionIcon();

  const gradient = isLocked
    ? 'from-gray-50 to-gray-100 border-l-gray-400'
    : isReview
    ? 'from-purple-50 to-violet-50 border-l-purple-500'
    : 'from-accent/5 to-amber-50 border-l-accent';

  return (
    <Card className={`border-0 shadow-md bg-gradient-to-r ${gradient} border-l-4`}>
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isLocked ? 'bg-gray-200' : isReview ? 'bg-purple-100' : 'bg-accent/10'
          }`}>
            <Icon className={`w-7 h-7 ${isLocked ? 'text-gray-400' : isReview ? 'text-purple-600' : 'text-accent'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isReview ? 'Review Required' : 'Next Required Action'}
            </p>
            <p className="text-lg font-bold truncate">{label}</p>
            <p className="text-sm text-muted-foreground truncate">{description}</p>
          </div>
          {!isLocked && action !== 'done' && (
            <Button
              size="lg"
              className="gap-2 flex-shrink-0"
              onClick={() => onStart(nextAction)}
            >
              <ActionIcon className="w-4 h-4" />
              {isReview ? 'Review Now' : action === 'continue' ? 'Continue' : 'Start'}
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}