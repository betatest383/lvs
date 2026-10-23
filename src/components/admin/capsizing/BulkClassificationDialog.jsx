import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Suggest a mount type based on the product name.
 * This is NOT auto-applied — it is shown as a non-binding suggestion
 * that the admin must explicitly confirm by selecting from the dropdown.
 */
function suggestMountType(product) {
  const name = (product.matrix_name || '').toLowerCase();
  if (name.includes('slip')) return 'slip_in';
  if (name.includes('bolt') || name.includes('exterior')) return 'bolt_on_exterior';
  return null;
}

function getMeasurementBasis(mountType, shape) {
  if (mountType === 'slip_in') {
    return shape === 'round' ? 'Interior Diameter' : 'Interior Length × Width';
  }
  if (mountType === 'bolt_on_exterior') {
    return shape === 'round' ? 'Exterior Diameter' : 'Exterior Length × Width';
  }
  return '';
}

function validateFittingFields(product, mountType) {
  const errors = [];
  const shape = product.compatible_shape;
  const isRound = shape === 'round' || (shape === 'any' && (product.nominal_diameter || product.min_fitting_diameter));

  if (isRound) {
    if (!product.min_fitting_diameter || product.min_fitting_diameter <= 0) {
      errors.push('Missing min_fitting_diameter');
    }
    if (!product.max_fitting_diameter || product.max_fitting_diameter <= 0) {
      errors.push('Missing max_fitting_diameter');
    }
  } else {
    if (!product.min_fitting_length || product.min_fitting_length <= 0) {
      errors.push('Missing min_fitting_length');
    }
    if (!product.min_fitting_width || product.min_fitting_width <= 0) {
      errors.push('Missing min_fitting_width');
    }
    if (!product.max_fitting_length || product.max_fitting_length <= 0) {
      errors.push('Missing max_fitting_length');
    }
    if (!product.max_fitting_width || product.max_fitting_width <= 0) {
      errors.push('Missing max_fitting_width');
    }
  }

  return errors;
}

/**
 * Bulk Classification Dialog for legacy cap products.
 *
 * Legacy products (mount_type = 'bolt_on') were created before interior/exterior
 * mounting distinctions were introduced. This tool requires an administrator to
 * explicitly classify each record as slip_in or bolt_on_exterior.
 *
 * Name-based suggestions are shown but never auto-applied — the admin must confirm.
 * After conversion, the correct measurement basis is set and fitting fields are validated.
 */
export default function BulkClassificationDialog({ open, onClose, onCompleted, legacyProducts }) {
  const [classifications, setClassifications] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && legacyProducts) {
      const init = {};
      for (const p of legacyProducts) {
        init[p.id] = { selected: '', suggestion: suggestMountType(p) };
      }
      setClassifications(init);
    }
  }, [open, legacyProducts]);

  const preview = useMemo(() => {
    if (!legacyProducts) return [];
    return legacyProducts.map(p => {
      const selected = classifications[p.id]?.selected || '';
      const suggestion = classifications[p.id]?.suggestion;
      const shape = p.compatible_shape;
      const basis = selected ? getMeasurementBasis(selected, shape) : '';
      const validationErrors = selected ? validateFittingFields(p, selected) : [];
      return {
        product: p,
        selected,
        suggestion,
        basis,
        validationErrors,
        ready: !!selected && validationErrors.length === 0,
      };
    });
  }, [legacyProducts, classifications]);

  const readyCount = preview.filter(p => p.ready).length;
  const unclassifiedCount = preview.filter(p => !p.selected).length;
  const invalidCount = preview.filter(p => p.selected && p.validationErrors.length > 0).length;

  const handleSelect = (productId, value) => {
    setClassifications(prev => ({
      ...prev,
      [productId]: { ...prev[productId], selected: value },
    }));
  };

  const handleConfirm = async () => {
    const toUpdate = preview.filter(p => p.ready);
    if (toUpdate.length === 0) {
      toast.error('No records are ready for conversion. Select a mount type and resolve validation errors first.');
      return;
    }
    setSaving(true);
    try {
      const updates = toUpdate.map(p => ({
        id: p.product.id,
        mount_type: p.selected,
        updated_by: 'bulk-classification',
      }));
      await base44.entities.CapSizingMatrix.bulkUpdate(updates);
      toast.success(`Converted ${updates.length} legacy record(s)`);
      onCompleted();
    } catch (e) {
      toast.error('Conversion failed: ' + e.message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Bulk Classify Legacy Cap Products
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              These products were created before interior/exterior mounting distinctions were introduced.
              Each record must be classified as <strong>Slip-In</strong> (interior measurements) or
              <strong> Bolt-On Exterior</strong> (exterior measurements) before automatic sizing.
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Name-based suggestions are shown for convenience only — you must explicitly select the correct classification.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline">Total: {preview.length}</Badge>
            <Badge variant="outline" className="text-green-700 border-green-300">Ready: {readyCount}</Badge>
            <Badge variant="outline" className="text-amber-700 border-amber-300">Unclassified: {unclassifiedCount}</Badge>
            <Badge variant="outline" className="text-red-700 border-red-300">Validation Errors: {invalidCount}</Badge>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Product</th>
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Shape</th>
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Suggested</th>
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Classify As *</th>
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Basis</th>
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Validation</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(({ product, selected, suggestion, basis, validationErrors, ready }) => (
                  <tr key={product.id} className="border-b last:border-0">
                    <td className="py-2 px-3 font-medium max-w-[200px] truncate" title={product.matrix_name}>{product.matrix_name}</td>
                    <td className="py-2 px-3">{product.compatible_shape || 'any'}</td>
                    <td className="py-2 px-3">
                      {suggestion ? (
                        <span className="text-xs text-blue-600">{suggestion === 'slip_in' ? 'Slip-In' : 'Bolt-On Ext'} (name-based)</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 px-3">
                      <Select value={selected} onValueChange={v => handleSelect(product.id, v)}>
                        <SelectTrigger className="h-8 w-[170px]"><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="slip_in">Slip-In (Interior)</SelectItem>
                          <SelectItem value="bolt_on_exterior">Bolt-On (Exterior)</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">{basis || '—'}</td>
                    <td className="py-2 px-3">
                      {selected && validationErrors.length > 0 ? (
                        <div className="space-y-0.5">
                          {validationErrors.map((err, i) => (
                            <div key={i} className="text-red-600 text-[10px]">⚠ {err}</div>
                          ))}
                        </div>
                      ) : ready ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">No legacy products to classify.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={saving || readyCount === 0}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Convert {readyCount > 0 ? `${readyCount} Record(s)` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}