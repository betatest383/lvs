import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Undo2, MapPin, ArrowRight, Building2 } from 'lucide-react';

/** Confirmation dialog when moving already-assigned items — requires destination bin selection */
export function MoveConfirmationDialog({ open, items, sessionWarehouseName, availableBins, initialBinId, onConfirm, onCancel }) {
  const [selectedBinId, setSelectedBinId] = useState(initialBinId || '');
  const canMove = !!selectedBinId;

  const handleConfirm = () => {
    if (!canMove) return;
    onConfirm(selectedBinId);
    setSelectedBinId('');
  };

  const handleCancel = () => {
    setSelectedBinId('');
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Move to {sessionWarehouseName || 'This Warehouse'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            {items.length} item{items.length !== 1 ? 's' : ''} {items.length !== 1 ? 'are' : 'is'} currently assigned to another warehouse and must be moved to <strong>{sessionWarehouseName}</strong> before it can be included in this setup session.
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto rounded-md border p-2">
            {items.map(item => (
              <div key={item.id} className="text-xs flex items-center gap-2 py-1">
                <span className="flex-1 truncate font-medium">{item.item_name}</span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {item.warehouse_location || 'No warehouse'} · {item.bin_location || 'No bin'}
                </span>
                <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="text-blue-600 whitespace-nowrap font-medium">{sessionWarehouseName}</span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              Select destination bin in {sessionWarehouseName}:
            </label>
            <select
              value={selectedBinId}
              onChange={(e) => setSelectedBinId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">— Choose a bin —</option>
              {availableBins.map(b => (
                <option key={b.id} value={b.id}>{b.bin_code}{b.name ? ` · ${b.name}` : ''}</option>
              ))}
            </select>
            {!canMove && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> A destination bin is required before the move can be completed.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!canMove}>
            Move {items.length} Item{items.length !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Warning when continuing with unassigned stocked materials */
export function UnassignedWarningDialog({ open, unassignedCount, onContinue, onGoBack }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onGoBack()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Unassigned Stocked Materials
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-2">
          <p className="text-sm">
            <strong className="text-amber-600">{unassignedCount}</strong> stocked material{unassignedCount !== 1 ? 's' : ''} {unassignedCount !== 1 ? 'have' : 'has'} not been assigned to a bin.
          </p>
          <p className="text-sm text-muted-foreground">
            These items will NOT appear during inventory count. You can assign them later through Warehouse Setup.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onGoBack}>Go Back</Button>
          <Button onClick={onContinue}>Continue Anyway</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Completion card when session-scoped assignments are done */
export function AssignmentCompleteCard({ assignedCount, onContinue }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center max-w-md mx-auto">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle2 className="w-10 h-10 text-green-600" />
      </div>
      <h2 className="text-xl font-bold">Warehouse Assignment Complete</h2>
      <p className="text-sm text-muted-foreground">
        {assignedCount.toLocaleString()} material{assignedCount !== 1 ? 's' : ''} assigned in this setup session. Ready for Inventory Count.
      </p>
      <Button onClick={onContinue} size="lg" className="mt-2">
        Continue to Inventory Count
      </Button>
    </div>
  );
}

/** Confirmation dialog when user chooses to continue with zero materials */
export function NoMaterialsConfirmDialog({ open, onConfirm, onCancel }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Continue Without Materials?
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            No materials have been assigned for this warehouse setup.
          </p>
          <p className="text-sm text-muted-foreground">
            <strong>Inventory Count will contain zero items.</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            You can assign materials later through the Inventory Master page.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Go Back</Button>
          <Button onClick={onConfirm}>Continue Without Materials</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Warehouse summary showing material count per warehouse */
export function WarehouseSummaryCard({ warehouses }) {
  if (!warehouses || warehouses.length === 0) return null;
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <Building2 className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">Warehouse Summary (current page)</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {warehouses.map(([name, count]) => (
          <div key={name} className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1.5">
            <span className="text-xs font-medium truncate">{name}</span>
            <span className="text-xs font-bold ml-2">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Undo banner shown after assignment (30 second window) */
export function UndoBanner({ count, binCode, onUndo }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-green-50 border border-green-200 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
        <span>{count} item{count !== 1 ? 's' : ''} assigned to {binCode}</span>
      </div>
      <button onClick={onUndo} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 shrink-0">
        <Undo2 className="w-3.5 h-3.5" /> Undo
      </button>
    </div>
  );
}