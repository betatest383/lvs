import { useState } from 'react';
import { Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

// Developer/test-only action: clears ALL answers, photos, and notes from the
// active draft inspection after confirmation. Never deletes the
// InspectionSubmission record or the question template. Only shown when
// developer tools are visible (Owner/Admin + dev mode enabled).
export default function ResetResponsesButton({ onReset, disabled }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="shrink-0 text-amber-700 border-amber-300 hover:bg-amber-50"
      >
        <Eraser className="w-3.5 h-3.5 mr-1" /> Reset Responses (Test)
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all inspection responses?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears ALL answers, photos, and notes from this draft inspection. The inspection
              record and question templates are NOT deleted. For testing only.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onReset?.(); setOpen(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset all responses
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}