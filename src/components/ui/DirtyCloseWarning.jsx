import React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

/**
 * DirtyCloseWarning
 *
 * Renders the "You have unsaved changes" warning dialog shown when a user
 * attempts to close a data-entry dialog that has unsaved changes.
 *
 * Non-dismissible via backdrop click or Escape (inherited from AlertDialogContent defaults).
 * Closes only via the two explicit buttons.
 *
 * @param {boolean} open - whether the warning is visible
 * @param {function} onContinueEditing - called when user clicks "Continue Editing"
 * @param {function} onDiscardChanges - called when user clicks "Discard Changes"
 */
export default function DirtyCloseWarning({ open, onContinueEditing, onDiscardChanges }) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Discard them and close this form?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onContinueEditing}>
            Continue Editing
          </Button>
          <Button variant="destructive" onClick={onDiscardChanges}>
            Discard Changes
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}