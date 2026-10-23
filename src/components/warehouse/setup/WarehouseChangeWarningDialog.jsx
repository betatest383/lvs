import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function WarehouseChangeWarningDialog({ warning, onCancel, onConfirm }) {
  if (!warning) return null;

  const items = [];
  if (warning.hasItems) items.push('stocked items');
  if (warning.hasCounts) items.push('recorded counts');
  const itemsText = items.join(' and ');

  return (
    <Dialog open={!!warning} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md" onCloseAttempt={onCancel}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Change Warehouse?
          </DialogTitle>
          <DialogDescription>
            You have {itemsText} in{' '}
            <span className="font-medium">{warning.currentWarehouse}</span>. Changing to{' '}
            <span className="font-medium">{warning.warehouseName}</span> will clear all
            bin assignments and counts.
          </DialogDescription>
        </DialogHeader>
        <div className="p-3 rounded-md border border-amber-200 bg-amber-50 text-sm text-amber-800">
          This action cannot be undone. All stocked items will be unassigned and counts will be lost.
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button variant="outline" className="w-full" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" className="w-full" onClick={onConfirm}>
            Change &amp; Clear All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}