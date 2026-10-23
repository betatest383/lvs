import React from 'react';
import { Label } from '@/components/ui/label';
import StandardLinkPicker from '@/components/standards/StandardLinkPicker';

export default function TabStandards({ form, set }) {
  const linkedIds = form.linked_standard_ids || [];

  return (
    <div className="space-y-3">
      <div>
        <Label>Linked Inspection Standards</Label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-3">
          Link one or more approved standards to inherit pass/fail criteria, authority references, customer explanations, and repair guidance — without duplicating information.
        </p>
      </div>
      <StandardLinkPicker
        selectedIds={linkedIds}
        onChange={ids => set('linked_standard_ids', ids)}
      />
    </div>
  );
}