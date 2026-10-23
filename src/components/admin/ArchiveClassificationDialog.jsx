import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Archive, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

/**
 * Checks how many records across the system reference a given classification value.
 * Shows usage counts before allowing archive.
 */
export default function ArchiveClassificationDialog({ open, onClose, onConfirm, record }) {
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (!open || !record) return;
    setLoading(true);
    setUsage(null);

    const val = record.value;
    const queries = [
      { label: 'Inspection Questions', entity: 'InspectionQuestion', fields: ['category', 'question_category', 'finding_type_config'] },
      { label: 'Logic Rules', entity: 'LogicRule', fields: ['category', 'output_finding_type'] },
      { label: 'Repair Templates', entity: 'RepairRecommendationTemplate', fields: ['deficiency_type', 'inspection_category', 'inspection_section', 'appliance_type', 'chimney_system_type'] },
      { label: 'Service Catalog', entity: 'ServiceCatalog', fields: ['category'] },
      { label: 'Inspection Findings', entity: 'InspectionFinding', fields: ['deficiency_type', 'appliance_system_type'] },
    ];

    Promise.all(
      queries.map(async q => {
        try {
          const records = await base44.entities[q.entity].filter({}, null, 500);
          const count = records.filter(r =>
            q.fields.some(f => r[f] && r[f] === val)
          ).length;
          return { ...q, count };
        } catch {
          return { ...q, count: 0, error: true };
        }
      })
    ).then(results => {
      setUsage(results);
      setLoading(false);
    });
  }, [open, record]);

  const totalUsed = usage ? usage.reduce((sum, u) => sum + u.count, 0) : 0;
  const isReferenced = totalUsed > 0;

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await base44.entities.MasterClassification.update(record.id, { is_active: false });
      onConfirm();
      onClose();
    } catch (e) {
      // error handled by parent toast
    } finally {
      setArchiving(false);
    }
  };

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !archiving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="w-4 h-4" /> Archive Classification
          </DialogTitle>
          <DialogDescription>
            You are about to archive <strong>{record.label || record.value}</strong> ({record.classification_type}).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Checking usage...</span>
          </div>
        ) : usage ? (
          <div className="space-y-3">
            {isReferenced ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-900">This value is currently used by:</p>
                    <ul className="mt-1.5 space-y-1">
                      {usage.filter(u => u.count > 0).map(u => (
                        <li key={u.label} className="flex items-center justify-between">
                          <span className="text-amber-800">{u.label}</span>
                          <Badge variant="outline" className="text-amber-700 border-amber-300">{u.count}</Badge>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-amber-700">
                      Archiving will hide this value from dropdowns. Existing records that reference it will keep their value, but new selections won't be possible.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-green-300 bg-green-50 p-3 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                <div className="text-sm text-green-800">
                  This value is not referenced by any records. Safe to archive.
                </div>
              </div>
            )}

            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground mb-2">Full usage breakdown:</p>
              <div className="space-y-1">
                {usage.map(u => (
                  <div key={u.label} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{u.label}</span>
                    <span className={u.count > 0 ? 'font-medium text-amber-700' : 'text-muted-foreground'}>
                      {u.error ? '—' : u.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={archiving}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleArchive}
            disabled={loading || archiving}
            className="gap-1.5"
          >
            {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
            Archive Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}