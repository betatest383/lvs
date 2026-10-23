import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = ['Select Warehouse', 'Select or Add Bins', 'Stock & Count', 'Review Exceptions', 'Review', 'Activate'];

export default function WizardProgress({ currentStep, isCompleted }) {
  return (
    <div className="w-full bg-card border-b px-4 py-4">
      <div className="flex items-center max-w-5xl mx-auto">
        {STEPS.map((name, i) => {
          const stepDone = isCompleted || i < currentStep;
          const stepActive = !isCompleted && i === currentStep;
          return (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center gap-1">
                <div className={cn(
                  'flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold border-2 transition-colors shrink-0',
                  stepDone ? 'bg-primary text-primary-foreground border-primary'
                  : stepActive ? 'bg-accent text-accent-foreground border-accent animate-pulse'
                  : 'bg-card text-muted-foreground border-border'
                )}>
                  {stepDone ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span className={cn('text-[10px] font-medium hidden md:block whitespace-nowrap', (isCompleted || i <= currentStep) ? 'text-foreground' : 'text-muted-foreground')}>
                  {name}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('flex-1 h-0.5 mx-2 mb-4', (isCompleted || i < currentStep) ? 'bg-primary' : 'bg-border')} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}