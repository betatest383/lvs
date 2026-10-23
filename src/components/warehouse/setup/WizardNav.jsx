import React from 'react';
import { ArrowLeft, ArrowRight, Save, X, CheckCircle2, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function WizardNav({ currentStep, canContinue, onContinue, onPrevious, onSaveProgress, onExit, isLastStep, isCompleted, onFinish, onViewInventory }) {
  // ─── Completed session: read-only, no editing, finish action ───
  if (isCompleted) {
    return (
      <div className="flex items-center justify-between border-t bg-card px-4 py-3">
        <button
          disabled
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-input text-sm font-medium opacity-40 cursor-not-allowed"
        >
          <ArrowLeft className="w-4 h-4" /> Previous
        </button>

        <button
          onClick={onExit}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <X className="w-3.5 h-3.5" /> Exit
        </button>

        <div className="flex items-center gap-2">
          {onViewInventory && (
            <button
              onClick={onViewInventory}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-input text-sm font-medium hover:bg-accent/10"
            >
              <Package className="w-4 h-4" /> View Posted Inventory
            </button>
          )}
          <button
            onClick={onFinish}
            className="inline-flex items-center gap-1.5 h-9 px-6 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <CheckCircle2 className="w-4 h-4" /> Finish & Return to Warehouse
          </button>
        </div>
      </div>
    );
  }

  // ─── Active session: full navigation ───
  return (
    <div className="flex items-center justify-between border-t bg-card px-4 py-3">
      <button
        onClick={onPrevious}
        disabled={currentStep === 0}
        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-input text-sm font-medium hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ArrowLeft className="w-4 h-4" /> Previous
      </button>

      <div className="flex items-center gap-2">
        <button
          onClick={onSaveProgress}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <Save className="w-3.5 h-3.5" /> Save Progress
        </button>
        <button
          onClick={onExit}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <X className="w-3.5 h-3.5" /> Exit
        </button>
      </div>

      <button
        onClick={onContinue}
        disabled={!canContinue}
        className={cn(
          'inline-flex items-center gap-1.5 h-9 px-6 rounded-md text-sm font-medium transition-colors',
          isLastStep
            ? 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40'
            : 'bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-40'
        )}
      >
        {isLastStep ? 'Activate Inventory' : 'Continue'}
        {!isLastStep && <ArrowRight className="w-4 h-4" />}
      </button>
    </div>
  );
}