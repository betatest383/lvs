import React from 'react';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2 } from 'lucide-react';

/**
 * Read-only display for Inspection Engine–resolved classification values.
 * Replaces the manual Chimney Type / Appliance Type selection buttons.
 * Shows "Determining..." until the inspection logic establishes a value.
 */
export default function ResolvedTypeField({ label, value }) {
  const resolved = value && value !== '';
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-muted/40 text-sm">
        {resolved ? (
          <>
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
            <span className="font-medium capitalize">{value.replace(/_/g, ' ')}</span>
            <span className="text-xs text-muted-foreground ml-auto">Resolved by Inspection Engine</span>
          </>
        ) : (
          <>
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
            <span className="text-muted-foreground italic">Determining...</span>
            <span className="text-xs text-muted-foreground ml-auto">Awaiting inspection answers</span>
          </>
        )}
      </div>
    </div>
  );
}