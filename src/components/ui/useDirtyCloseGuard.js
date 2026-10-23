import { useState, useCallback } from 'react';

/**
 * useDirtyCloseGuard
 *
 * Provides dirty-state protection for data-entry dialogs.
 *
 * When the user attempts to close (via X, Cancel, or Close button):
 * - If the form has unsaved changes (isDirty === true), shows a warning dialog.
 * - If the form is clean (isDirty === false), closes immediately.
 *
 * The warning dialog offers "Continue Editing" (cancel) and "Discard Changes" (confirm close).
 *
 * @param {boolean} isDirty - whether any field has changed from its initial value
 * @param {function} onClose - called when the dialog should actually close
 * @returns {{ handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard }}
 */
export function useDirtyCloseGuard(isDirty, onClose) {
  const [showWarning, setShowWarning] = useState(false);

  const handleCloseAttempt = useCallback(() => {
    if (isDirty) {
      setShowWarning(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const confirmDiscard = useCallback(() => {
    setShowWarning(false);
    onClose();
  }, [onClose]);

  const cancelDiscard = useCallback(() => {
    setShowWarning(false);
  }, []);

  return { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard };
}