import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import SearchableEntitySelect from '@/components/shared/SearchableEntitySelect';
import ClassificationCombobox from '@/components/admin/ClassificationCombobox';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

export default function CapProductFormDialog({ open, onClose, onSaved, editProduct, currentUserEmail }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [initialForm, setInitialForm] = useState({});

  useEffect(() => {
    if (open) {
      const init = editProduct ? { ...editProduct } : {
        matrix_name: '',
        mount_type: 'slip_in',
        coverage_type: 'single_flue',
        compatible_shape: 'any',
        allows_rotated_match: false,
        is_preferred: false,
        is_active: true,
        flues_supported: 1,
        manufacturer_clearance: 0,
        priority: 0,
        min_tile_projection: 0,
        min_fitting_length: 0,
        min_fitting_width: 0,
        max_fitting_length: 0,
        max_fitting_width: 0,
        nominal_length: 0,
        nominal_width: 0,
        nominal_height: 0,
        nominal_diameter: 0,
        min_fitting_diameter: 0,
        max_fitting_diameter: 0,
      };
      setForm(init);
      setInitialForm(init);
    }
  }, [open, editProduct]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onClose());

  const isRound = form.compatible_shape === 'round';

  const handleSave = async () => {
    if (!form.matrix_name?.trim()) { toast.error('Product name is required'); return; }
    if (!form.mount_type) { toast.error('Mounting method is required'); return; }

    // Round product validation
    if (isRound) {
      const nd = form.nominal_diameter || 0;
      const minD = form.min_fitting_diameter || 0;
      const maxD = form.max_fitting_diameter || 0;
      if (nd <= 0 || minD <= 0 || maxD <= 0) {
        toast.error('Round products require all three diameter fields with values greater than zero');
        return;
      }
      if (minD > nd || nd > maxD) {
        toast.error('Diameter constraint violated: Min Fitting ≤ Nominal ≤ Max Fitting');
        return;
      }
      // Prevent mixing round-diameter sizing with rectangular fitting ranges unless universal
      const hasRectFitting = (form.min_fitting_length > 0 || form.max_fitting_length > 0 || form.min_fitting_width > 0 || form.max_fitting_width > 0);
      const hasRectNominal = (form.nominal_length > 0 || form.nominal_width > 0);
      if (hasRectFitting || hasRectNominal) {
        toast.error('Round products cannot mix diameter sizing with rectangular length/width fields. Set shape to "Any" for universal products.');
        return;
      }
    } else if (form.compatible_shape !== 'any') {
      // Rectangular/square/oval products: clear diameter fields if accidentally set
      const hasDiameter = (form.nominal_diameter > 0 || form.min_fitting_diameter > 0 || form.max_fitting_diameter > 0);
      if (hasDiameter) {
        toast.error('Diameter fields are only valid for round or universal (Any) shape products.');
        return;
      }
    }

    setSaving(true);
    try {
      const data = { ...form };
      // For round products, null out rectangular fields
      if (isRound) {
        data.nominal_length = 0;
        data.nominal_width = 0;
        data.min_fitting_length = 0;
        data.min_fitting_width = 0;
        data.max_fitting_length = 0;
        data.max_fitting_width = 0;
        data.allows_rotated_match = false;
      }
      // For non-round, non-any products, null out diameter fields
      if (!isRound && form.compatible_shape !== 'any') {
        data.nominal_diameter = 0;
        data.min_fitting_diameter = 0;
        data.max_fitting_diameter = 0;
      }
      data.updated_by = currentUserEmail || '';
      if (!editProduct) data.created_by = currentUserEmail || '';

      if (editProduct) {
        await base44.entities.CapSizingMatrix.update(editProduct.id, data);
        toast.success('Cap product updated');
      } else {
        await base44.entities.CapSizingMatrix.create(data);
        toast.success('Cap product created');
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error('Failed to save: ' + e.message);
    }
    setSaving(false);
  };

  const handleMaterialSelect = (item) => {
    set('material_id', item.id);
    set('material_sku', item.sku || '');
    if (!form.matrix_name) set('matrix_name', item.item_name || '');
  };

  const handleServiceSelect = (item) => {
    set('service_id', item.id);
  };

  const handleFinishMaterialSelect = (item) => {
    set('finish_material_id', item.id);
  };

  const handleFinishServiceSelect = (item) => {
    set('finish_service_id', item.id);
  };

  const searchMaterials = async (term) => {
    const res = await base44.functions.invoke('inventoryQuery', { search: term, limit: 50 });
    return res.data.items;
  };

  const searchServices = async (term) => {
    const res = await base44.functions.invoke('searchServiceCatalog', { search: term, limit: 50 });
    return res.data.items;
  };

  const isPowderCoated = form.finish === 'powder_coated';

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" onCloseAttempt={handleCloseAttempt}>
        <DialogHeader>
          <DialogTitle>{editProduct ? 'Edit Cap Product' : 'Add Cap Product'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <Label>Product / Matrix Name *</Label>
            <Input value={form.matrix_name || ''} onChange={e => set('matrix_name', e.target.value)} placeholder="e.g. HY-C Bolt-On 13in Stainless" />
          </div>

          {/* Mounting + Coverage */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mounting Method *</Label>
              <Select value={form.mount_type || 'slip_in'} onValueChange={v => set('mount_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="slip_in">Slip-In (Interior)</SelectItem>
                  <SelectItem value="bolt_on_exterior">Bolt-On (Exterior)</SelectItem>
                  {editProduct?.mount_type === 'bolt_on' && (
                    <SelectItem value="bolt_on">Bolt-On Legacy — Classification Required</SelectItem>
                  )}
                  <SelectItem value="crown_mounted">Crown-Mounted</SelectItem>
                </SelectContent>
              </Select>
              {form.mount_type === 'bolt_on' && (
                <p className="text-xs text-amber-600 mt-1">This product was created before interior/exterior mounting distinctions were introduced. Classify it before automatic sizing.</p>
              )}
            </div>
            <div>
              <Label>Coverage Type</Label>
              <Select value={form.coverage_type || 'single_flue'} onValueChange={v => set('coverage_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single_flue">Single Flue</SelectItem>
                  <SelectItem value="multi_flue">Multi Flue</SelectItem>
                  <SelectItem value="full_crown">Full Crown</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Classification selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cap Style</Label>
              <ClassificationCombobox classificationType="cap_style" value={form.cap_style || ''} onChange={v => set('cap_style', v)} placeholder="Select style" />
            </div>
            <div>
              <Label>Base Material</Label>
              <ClassificationCombobox classificationType="cap_base_material" value={form.base_material || ''} onChange={v => set('base_material', v)} placeholder="Select material" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Finish</Label>
              <ClassificationCombobox classificationType="cap_finish" value={form.finish || ''} onChange={v => set('finish', v)} placeholder="Select finish" />
            </div>
            <div>
              <Label>Finish Color</Label>
              <ClassificationCombobox classificationType="cap_finish_color" value={form.finish_color || ''} onChange={v => set('finish_color', v)} placeholder="Select color" />
            </div>
          </div>

          {/* Powder-Coat Finish Material + Service (shown only when finish is powder_coated) */}
          {isPowderCoated && (
            <div className="border-2 border-dashed border-blue-300 rounded-lg p-3 space-y-3 bg-blue-50/30">
              <p className="text-sm font-semibold text-blue-700">Powder-Coat Configuration</p>
              <p className="text-xs text-muted-foreground">The base cap material/SKU is retained. Add the powder-coat finish material and service below — no separate inventory SKU is needed per color.</p>
              <div>
                <Label>Finish Material (Powder-Coat)</Label>
                {form.finish_material_id && (
                  <div className="mb-1 text-xs text-green-700">Selected</div>
                )}
                <SearchableEntitySelect
                  searchFn={searchMaterials}
                  getItemId={item => item.id}
                  renderItem={item => (
                    <div>
                      <div className="font-medium text-sm">{item.item_name}</div>
                      <div className="text-xs text-muted-foreground">SKU: {item.sku || 'N/A'} · {item.inventory_type}</div>
                    </div>
                  )}
                  onSelect={handleFinishMaterialSelect}
                  placeholder="Search powder-coat material..."
                />
              </div>
              <div>
                <Label>Finish Service (Powder-Coat Application)</Label>
                {form.finish_service_id && (
                  <div className="mb-1 text-xs text-green-700">Service linked</div>
                )}
                <SearchableEntitySelect
                  searchFn={searchServices}
                  getItemId={item => item.id}
                  renderItem={item => (
                    <div>
                      <div className="font-medium text-sm">{item.service_name}</div>
                      <div className="text-xs text-muted-foreground">{item.service_code || 'N/A'} · {item.category || ''}</div>
                    </div>
                  )}
                  onSelect={handleFinishServiceSelect}
                  placeholder="Search finish services..."
                />
              </div>
            </div>
          )}

          {/* Manufacturer / Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Manufacturer</Label>
              <Input value={form.manufacturer || ''} onChange={e => set('manufacturer', e.target.value)} placeholder="e.g. HY-C, Gelco" />
            </div>
            <div>
              <Label>Model</Label>
              <Input value={form.model || ''} onChange={e => set('model', e.target.value)} placeholder="e.g. GUARDIAN-13" />
            </div>
          </div>

          {/* Inventory Material (server-side search) */}
          <div>
            <Label>Linked Inventory Material</Label>
            {form.material_id && (
              <div className="mb-1 text-xs text-green-700">
                Selected: {form.material_sku || form.material_id}
              </div>
            )}
            <SearchableEntitySelect
              searchFn={searchMaterials}
              getItemId={item => item.id}
              renderItem={item => (
                <div>
                  <div className="font-medium text-sm">{item.item_name}</div>
                  <div className="text-xs text-muted-foreground">SKU: {item.sku || 'N/A'} · {item.inventory_type}</div>
                </div>
              )}
              onSelect={handleMaterialSelect}
              placeholder="Search inventory materials..."
            />
          </div>

          {/* Linked Service (server-side search) */}
          <div>
            <Label>Linked Installation Service</Label>
            {form.service_id && (
              <div className="mb-1 text-xs text-green-700">
                Service linked
              </div>
            )}
            <SearchableEntitySelect
              searchFn={searchServices}
              getItemId={item => item.id}
              renderItem={item => (
                <div>
                  <div className="font-medium text-sm">{item.service_name}</div>
                  <div className="text-xs text-muted-foreground">{item.service_code || 'N/A'} · {item.category || ''}</div>
                </div>
              )}
              onSelect={handleServiceSelect}
              placeholder="Search services..."
            />
          </div>

          {/* Nominal dimensions — rectangular (hidden for round) */}
          {!isRound && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Nominal Length (in)</Label>
                <Input type="number" value={form.nominal_length || 0} onChange={e => set('nominal_length', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Nominal Width (in)</Label>
                <Input type="number" value={form.nominal_width || 0} onChange={e => set('nominal_width', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Nominal Height (in)</Label>
                <Input type="number" value={form.nominal_height || 0} onChange={e => set('nominal_height', parseFloat(e.target.value) || 0)} placeholder="8, 10, 12" />
              </div>
            </div>
          )}

          {/* Round Diameter Sizing — shown only for round products */}
          {isRound && (
            <div className="border-2 border-dashed border-blue-300 rounded-lg p-3 space-y-3 bg-blue-50/30">
              <p className="text-sm font-semibold text-blue-700">Round Diameter Sizing (inches)</p>
              <p className="text-xs text-muted-foreground">All three diameter fields are required for round products. Values must be greater than zero.</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Nominal Round Diameter (in)</Label>
                  <Input type="number" value={form.nominal_diameter || 0} onChange={e => set('nominal_diameter', parseFloat(e.target.value) || 0)} placeholder="e.g. 8" />
                </div>
                <div>
                  <Label>Minimum Round Diameter (in)</Label>
                  <Input type="number" value={form.min_fitting_diameter || 0} onChange={e => set('min_fitting_diameter', parseFloat(e.target.value) || 0)} placeholder="e.g. 7.5" />
                </div>
                <div>
                  <Label>Maximum Round Diameter (in)</Label>
                  <Input type="number" value={form.max_fitting_diameter || 0} onChange={e => set('max_fitting_diameter', parseFloat(e.target.value) || 0)} placeholder="e.g. 8.5" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Constraint: Min Fitting ≤ Nominal ≤ Max Fitting.</p>
            </div>
          )}

          {/* Nominal height — always shown (used for flue tile cut-down resolution) */}
          {isRound && (
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label>Nominal Height (in)</Label>
                <Input type="number" value={form.nominal_height || 0} onChange={e => set('nominal_height', parseFloat(e.target.value) || 0)} placeholder="8, 10, 12" />
              </div>
            </div>
          )}

          {/* Fitting range — rectangular (hidden for round) */}
          {!isRound && (
            <div className="border rounded-lg p-3 space-y-2">
              <p className="text-sm font-semibold">Fitting Range (inches)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Min Length</Label>
                  <Input type="number" value={form.min_fitting_length || 0} onChange={e => set('min_fitting_length', parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <Label className="text-xs">Min Width</Label>
                  <Input type="number" value={form.min_fitting_width || 0} onChange={e => set('min_fitting_width', parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <Label className="text-xs">Max Length</Label>
                  <Input type="number" value={form.max_fitting_length || 0} onChange={e => set('max_fitting_length', parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <Label className="text-xs">Max Width</Label>
                  <Input type="number" value={form.max_fitting_width || 0} onChange={e => set('max_fitting_width', parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            </div>
          )}

          {/* Shape + Projection + Flues */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Compatible Shape</Label>
              <Select value={form.compatible_shape || 'any'} onValueChange={v => set('compatible_shape', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="round">Round</SelectItem>
                  <SelectItem value="square">Square</SelectItem>
                  <SelectItem value="rectangular">Rectangular</SelectItem>
                  <SelectItem value="oval">Oval</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Min Tile Projection (in)</Label>
              <Input type="number" value={form.min_tile_projection || 0} onChange={e => set('min_tile_projection', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Flues Supported</Label>
              <Input type="number" value={form.flues_supported || 1} onChange={e => set('flues_supported', parseInt(e.target.value) || 1)} />
            </div>
          </div>

          {/* Clearance + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Manufacturer Clearance (in)</Label>
              <Input type="number" value={form.manufacturer_clearance || 0} onChange={e => set('manufacturer_clearance', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Priority</Label>
              <Input type="number" value={form.priority || 0} onChange={e => set('priority', parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-3 gap-3">
            {!isRound && (
              <div className="flex items-center gap-2">
                <Switch checked={!!form.allows_rotated_match} onCheckedChange={v => set('allows_rotated_match', v)} />
                <Label className="text-xs">Rotated Match</Label>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={!!form.is_preferred} onCheckedChange={v => set('is_preferred', v)} />
              <Label className="text-xs">Preferred</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={!!form.is_active} onCheckedChange={v => set('is_active', v)} />
              <Label className="text-xs">Active</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCloseAttempt}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editProduct ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <DirtyCloseWarning open={showWarning} onContinueEditing={cancelDiscard} onDiscardChanges={confirmDiscard} />
    </>
  );
}