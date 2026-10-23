import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

// Small trash-can control shown at the right of an answered, editable question.
// Requires confirmation before clearing the answer (and dependent follow-ups).
// Renders nothing when `disabled` (completed/locked/submitted inspections or
// unanswered questions).
export default function ClearAnswerButton({ dependentsCount = 0, onConfirm, disabled }) {
  const [open, setOpen] = useState(false);
  if (disabled) return null;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Clear answer"
            onClick={() => setOpen(true)}
            className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1 -mr-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Clear answer</TooltipContent>
      </Tooltip>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this answer?</AlertDialogTitle>
            <AlertDialogDescription>
              Clear this answer and any dependent answers, photos, and notes?
              {dependentsCount > 0 && (
                <> {dependentsCount} dependent follow-up response(s) will also be cleared.</>
              )}
              <> This only affects this inspection — the question template is not changed.</>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onConfirm?.(); setOpen(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear answer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}