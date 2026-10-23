import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Pencil, Copy, Power, Search, Download, Upload, FlaskConical, ChevronLeft, PackageX, Palette, DollarSign, RefreshCw, Layers, Link2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import CapProductFormDialog from '@/components/admin/capsizing/CapProductFormDialog';
import CapFitTester from '@/components/admin/capsizing/CapFitTester';
import CapImportPreviewDialog from '@/components/admin/capsizing/CapImportPreviewDialog';
import CopperVariantPreviewDialog from '@/components/admin/capsizing/CopperVariantPreviewDialog';
import LinkMaterialsBySkuDialog from '@/components/admin/capsizing/LinkMaterialsBySkuDialog';
import RecoverTruncatedLinksDialog from '@/components/admin/capsizing/RecoverTruncatedLinksDialog';
import BulkClassificationDialog from '@/components/admin/capsizing/BulkClassificationDialog';

const NUMERIC_FIELDS = [
  'nominal_length','nominal_width','nominal_height',
  'nominal_diameter','min_fitting_diameter','max_fitting_diameter',
  'min_fitting_length','min_fitting_width','max_fitting_length','max_fitting_width',
  'min_tile_projection','flues_supported','manufacturer_clearance','priority'
];

const parseCSVLine = (line) => {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { values.push(current); current = ''; continue; }
    current += ch;
  }
  values.push(current);
  return values;
};

export default function CapSizingMatrixPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMount, setFilterMount] = useState('all');
  const [filterActive, setFilterActive] = useState('all');
  const [filterPreferred, setFilterPreferred] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [showFitTester, setShowFitTester] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [copperDialogOpen, setCopperDialogOpen] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [linkSkuDialogOpen, setLinkSkuDialogOpen] = useState(false);
  const [recoverDialogOpen, setRecoverDialogOpen] = useState(false);
  const [bulkClassifyOpen, setBulkClassifyOpen] = useState(false);
  const [filterLinkStatus, setFilterLinkStatus] = useState('all');
  const [linkResolutionMap, setLinkResolutionMap] = useState({});
  const fileInputRef = useRef(null);

  const isAdmin = user?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await base44.entities.CapSizingMatrix.list('-priority', 500);
      setProducts(data);
    } catch (e) {
      toast.error('Failed to load cap products: ' + e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter(p => {
    if (filterMount !== 'all' && p.mount_type !== filterMount) return false;
    if (filterActive !== 'all') {
      const isActive = p.is_active !== false;
      if (filterActive === 'active' && !isActive) return false;
      if (filterActive === 'inactive' && isActive) return false;
    }
    if (filterPreferred === 'preferred' && !p.is_preferred) return false;
    if (filterPreferred === 'standard' && p.is_preferred) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.matrix_name?.toLowerCase().includes(q) ||
      p.manufacturer?.toLowerCase().includes(q) ||
      p.model?.toLowerCase().includes(q) ||
      p.material_sku?.toLowerCase().includes(q) ||
      p.cap_style?.toLowerCase().includes(q) ||
      p.base_material?.toLowerCase().includes(q) ||
      p.finish?.toLowerCase().includes(q)
    );
  }).filter(p => {
    if (filterLinkStatus === 'all') return true;
    let status;
    if (p.material_id) status = 'linked';
    else if (!p.material_sku) status = 'missing_sku';
    else status = linkResolutionMap[p.id] || 'unlinked';
    return status === filterLinkStatus;
  });

  const handleEdit = (p) => { setEditProduct(p); setDialogOpen(true); };
  const handleNew = () => { setEditProduct(null); setDialogOpen(true); };

  const handleDuplicate = async (p) => {
    try {
      const { id, created_date, updated_date, created_by_id, ...rest } = p;
      await base44.entities.CapSizingMatrix.create({
        ...rest,
        matrix_name: (p.matrix_name || 'Copy') + ' (Copy)',
        is_preferred: false,
        created_by: user?.email || '',
        updated_by: user?.email || '',
      });
      toast.success('Product duplicated');
      load();
    } catch (e) {
      toast.error('Failed to duplicate: ' + e.message);
    }
  };

  const handleToggleActive = async (p) => {
    try {
      await base44.entities.CapSizingMatrix.update(p.id, {
        is_active: !(p.is_active !== false),
        updated_by: user?.email || '',
      });
      toast.success('Status updated');
      load();
    } catch (e) {
      toast.error('Failed to update: ' + e.message);
    }
  };

  const handleExport = () => {
    const headers = [
      'matrix_name','mount_type','cap_style','base_material','finish','finish_color',
      'coverage_type','manufacturer','model','material_sku','service_id',
      'finish_material_id','finish_service_id',
      'nominal_length','nominal_width','nominal_height',
      'nominal_diameter','min_fitting_diameter','max_fitting_diameter',
      'min_fitting_length','min_fitting_width','max_fitting_length','max_fitting_width',
      'compatible_shape','allows_rotated_match',
      'min_tile_projection','flues_supported','manufacturer_clearance','priority',
      'is_preferred','is_active','notes'
    ];
    const rows = filtered.map(p => headers.map(h => {
      const v = p[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      return `"${String(v).replace(/"/g, '""')}"`;
    }));
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cap_sizing_matrix.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const allLines = text.split('\n');
      if (allLines.length < 2) { toast.error('CSV must have a header and at least one row'); return; }

      const headers = parseCSVLine(allLines[0]).map(h => h.trim());
      const validRecords = [];
      const validationErrors = [];
      let skippedEmpty = 0;

      for (let i = 1; i < allLines.length; i++) {
        const line = allLines[i];
        if (!line.trim()) { skippedEmpty++; continue; }

        const values = parseCSVLine(line);
        const obj = {};
        headers.forEach((h, idx) => {
          if (idx < values.length) {
            let v = values[idx].trim();
            if (v === 'true') v = true;
            else if (v === 'false') v = false;
            obj[h] = v;
          }
        });

        const rowNum = i + 1;
        const matrixName = obj.matrix_name || '(unnamed)';
        const rowErrors = [];

        if (!obj.matrix_name?.trim()) {
          rowErrors.push({ row: rowNum, matrix_name: matrixName, field: 'matrix_name', value: obj.matrix_name || '', error: 'Required field is missing' });
        }
        if (!obj.mount_type?.trim()) {
          rowErrors.push({ row: rowNum, matrix_name: matrixName, field: 'mount_type', value: obj.mount_type || '', error: 'Required field is missing' });
        } else if (!['slip_in', 'bolt_on_exterior', 'bolt_on', 'crown_mounted'].includes(obj.mount_type)) {
          rowErrors.push({ row: rowNum, matrix_name: matrixName, field: 'mount_type', value: obj.mount_type, error: 'Must be slip_in, bolt_on_exterior, or crown_mounted' });
        }

        for (const field of NUMERIC_FIELDS) {
          if (field in obj) {
            const trimmed = String(obj[field]).trim();
            if (trimmed === '') {
              delete obj[field];
            } else {
              const num = Number(trimmed);
              if (isNaN(num)) {
                rowErrors.push({ row: rowNum, matrix_name: matrixName, field, value: obj[field], error: 'Not a valid number' });
              } else {
                obj[field] = num;
              }
            }
          }
        }

        const isCrownMultiFlue = obj.mount_type === 'crown_mounted' && obj.coverage_type === 'multi_flue';
        if (isCrownMultiFlue && obj.nominal_height === undefined) {
          rowErrors.push({ row: rowNum, matrix_name: matrixName, field: 'nominal_height', value: '', error: 'Required for crown-mounted multi-flue products' });
        }

        // Round product diameter validation
        if (obj.compatible_shape === 'round') {
          const nd = obj.nominal_diameter;
          const minD = obj.min_fitting_diameter;
          const maxD = obj.max_fitting_diameter;
          if (nd === undefined || minD === undefined || maxD === undefined) {
            rowErrors.push({ row: rowNum, matrix_name: matrixName, field: 'diameter_fields', value: '', error: 'Round products require all three diameter fields (nominal_diameter, min_fitting_diameter, max_fitting_diameter)' });
          } else if (nd <= 0 || minD <= 0 || maxD <= 0) {
            rowErrors.push({ row: rowNum, matrix_name: matrixName, field: 'diameter_fields', value: '', error: 'All diameter values must be greater than zero' });
          } else if (minD > nd || nd > maxD) {
            rowErrors.push({ row: rowNum, matrix_name: matrixName, field: 'diameter_fields', value: `${minD}/${nd}/${maxD}`, error: 'Diameter constraint violated: min_fitting_diameter must be ≤ nominal_diameter ≤ max_fitting_diameter' });
          }
        }

        if (rowErrors.length > 0) {
          validationErrors.push(...rowErrors);
        } else {
          obj.created_by = user?.email || '';
          obj.updated_by = user?.email || '';
          validRecords.push(obj);
        }
      }

      // Resolve material_sku → material_id via the SKU resolver backend function
      const uniqueSkus = [...new Set(validRecords.map(r => r.material_sku).filter(Boolean))];
      let skuResolution = [];
      if (uniqueSkus.length > 0) {
        try {
          const res = await base44.functions.invoke('resolveMaterialSkus', { skus: uniqueSkus });
          skuResolution = res.data?.results || [];
          const resMap = {};
          for (const r of skuResolution) resMap[r.sku] = r;
          for (const rec of validRecords) {
            if (rec.material_sku) {
              const r = resMap[rec.material_sku];
              if (r?.status === 'matched' && r.material_id) {
                rec.material_id = r.material_id;
              }
            }
          }
        } catch (e) {
          toast.warning('SKU resolution skipped: ' + e.message);
        }
      }

      setImportPreview({
        records: validRecords,
        errors: validationErrors,
        skippedEmpty,
        totalRows: allLines.length - 1,
        skuResolution,
      });
    } catch (err) {
      toast.error('Import failed: ' + err.message);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview?.records.length) return;
    setImporting(true);
    try {
      await base44.entities.CapSizingMatrix.bulkCreate(importPreview.records);
      toast.success(`Imported ${importPreview.records.length} product(s)`);
      setImportPreview(null);
      load();
    } catch (err) {
      toast.error('Import failed: ' + err.message);
    }
    setImporting(false);
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const stainlessFiltered = filtered.filter(p => (p.base_material || '').toLowerCase().includes('stainless') && p.is_active !== false);
    if (stainlessFiltered.every(p => selectedIds.has(p.id))) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        stainlessFiltered.forEach(p => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        stainlessFiltered.forEach(p => next.add(p.id));
        return next;
      });
    }
  };

  const selectedProducts = products.filter(p => selectedIds.has(p.id));
  const selectedStainlessCount = selectedProducts.filter(p => (p.base_material || '').toLowerCase().includes('stainless')).length;

  const handleSyncFromSource = async (p) => {
    setSyncingId(p.id);
    try {
      const res = await base44.functions.invoke('syncCopperFromStainless', { copper_variant_id: p.id });
      toast.success(`Synced sizing data from stainless source. Suggested price updated to $${res.data.updated_suggested_price.toFixed(2)}.`);
      load();
    } catch (e) {
      toast.error('Sync failed: ' + (e.response?.data?.error || e.message));
    }
    setSyncingId(null);
  };

  const activeCount = products.filter(p => p.is_active !== false).length;
  const legacyCount = products.filter(p => p.mount_type === 'bolt_on').length;
  const crownCount = products.filter(p => p.mount_type === 'crown_mounted').length;
  const preferredCount = products.filter(p => p.is_preferred).length;

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card><CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Cap Sizing Matrix editing is restricted to Owner/Admin roles.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/admin/repair-recommendation-config')}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/repair-recommendation-config')}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Cap Sizing Matrix</h1>
            <p className="text-sm text-muted-foreground">Manage chimney cap products with mounting eligibility and fitting ranges.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setShowFitTester(s => !s)}>
            <FlaskConical className="w-4 h-4" /> Test Product Fit
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => navigate('/admin/cap-finish-colors')}>
            <Palette className="w-4 h-4" /> Finish Colors
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => navigate('/admin/cap-finish-pricing')}>
            <DollarSign className="w-4 h-4" /> Finish Pricing
          </Button>
          <Button
            variant="outline"
            className="gap-1.5 border-blue-400 text-blue-700 hover:bg-blue-50"
            onClick={() => setLinkSkuDialogOpen(true)}
          >
            <Link2 className="w-4 h-4" /> Link Materials by SKU
          </Button>
          <Button
            variant="outline"
            className="gap-1.5 border-purple-400 text-purple-700 hover:bg-purple-50"
            onClick={() => setRecoverDialogOpen(true)}
          >
            <ShieldCheck className="w-4 h-4" /> Recover Truncated Links
          </Button>
          <Button
            variant="outline"
            className="gap-1.5 border-red-400 text-red-700 hover:bg-red-50"
            disabled={legacyCount === 0}
            onClick={() => setBulkClassifyOpen(true)}
          >
            <AlertTriangle className="w-4 h-4" /> Classify Legacy{legacyCount > 0 ? ` (${legacyCount})` : ''}
          </Button>
          <Button
            variant="outline"
            className="gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-50"
            disabled={selectedStainlessCount === 0}
            onClick={() => setCopperDialogOpen(true)}
          >
            <Layers className="w-4 h-4" /> Create Copper Variants{selectedStainlessCount > 0 ? ` (${selectedStainlessCount})` : ''}
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={handleExport} disabled={products.length === 0}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4" /> Import CSV
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <Button className="gap-1.5" onClick={handleNew}>
            <Plus className="w-4 h-4" /> Add Cap Product
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold">{products.length}</p>
          <p className="text-xs text-muted-foreground">Total Products</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-red-600">{legacyCount}</p>
          <p className="text-xs text-muted-foreground">Legacy (Needs Classification)</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-purple-600">{crownCount}</p>
          <p className="text-xs text-muted-foreground">Crown-Mounted</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-green-600">{activeCount}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-amber-600">{preferredCount}</p>
          <p className="text-xs text-muted-foreground">Preferred</p>
        </CardContent></Card>
      </div>

      {/* Fit Tester (collapsible) */}
      {showFitTester && <CapFitTester products={products} />}

      {/* Search + Filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by name, manufacturer, SKU, material..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterMount} onValueChange={setFilterMount}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Mount Types</SelectItem>
            <SelectItem value="slip_in">Slip-In</SelectItem>
            <SelectItem value="bolt_on_exterior">Bolt-On (Exterior)</SelectItem>
            <SelectItem value="crown_mounted">Crown-Mounted</SelectItem>
            <SelectItem value="bolt_on">Legacy (Needs Classification)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPreferred} onValueChange={setFilterPreferred}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="preferred">Preferred</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterActive} onValueChange={setFilterActive}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterLinkStatus} onValueChange={setFilterLinkStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Link Status</SelectItem>
            <SelectItem value="linked">Linked</SelectItem>
            <SelectItem value="missing_sku">Missing SKU</SelectItem>
            <SelectItem value="unlinked">Unlinked (Has SKU)</SelectItem>
            <SelectItem value="not_found">SKU Not Found</SelectItem>
            <SelectItem value="ambiguous">Ambiguous SKU</SelectItem>
            <SelectItem value="link_conflict">Link Conflict</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : products.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <PackageX className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No cap products configured yet.</p>
          <p className="text-sm text-muted-foreground mt-1">Add real manufacturer products with fitting ranges to enable cap mounting resolution. Do not create fake product records.</p>
          <Button className="mt-4 gap-1.5" onClick={handleNew}>
            <Plus className="w-4 h-4" /> Add First Product
          </Button>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="py-2 px-2 w-8">
                      <Checkbox
                        checked={filtered.filter(p => (p.base_material || '').toLowerCase().includes('stainless') && p.is_active !== false).length > 0 &&
                          filtered.filter(p => (p.base_material || '').toLowerCase().includes('stainless') && p.is_active !== false).every(p => selectedIds.has(p.id))}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Product / Material</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">SKU</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Mfr / Model</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Height</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Diameter</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Mount</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Style</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Base Material</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Finish / Color</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Coverage</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Min L×W</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Max L×W</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Rotate</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Min Proj</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Flues</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Service</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Priority</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-right py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const isActive = p.is_active !== false;
                    return (
                      <tr key={p.id} className={`border-b last:border-0 hover:bg-muted/20 ${!isActive ? 'opacity-60' : ''}`}>
                        <td className="py-2 px-2">
                          {(p.base_material || '').toLowerCase().includes('stainless') && isActive && (
                            <Checkbox
                              checked={selectedIds.has(p.id)}
                              onCheckedChange={() => toggleSelect(p.id)}
                            />
                          )}
                          {p.variant_source === 'copied_from_stainless' && (
                            <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-300 ml-0.5">Cu</Badge>
                          )}
                        </td>
                        <td className="py-2 px-3 font-medium max-w-[180px] truncate" title={p.matrix_name}>{p.matrix_name}</td>
                        <td className="py-2 px-3 text-muted-foreground font-mono text-[10px] max-w-[140px] truncate" title={p.material_sku}>{p.material_sku || '—'}</td>
                        <td className="py-2 px-3 text-muted-foreground">{[p.manufacturer, p.model].filter(Boolean).join(' ') || '—'}</td>
                        <td className="py-2 px-3">{p.nominal_height ? `${p.nominal_height}"` : '—'}</td>
                        <td className="py-2 px-3">
                          {p.compatible_shape === 'round' || p.nominal_diameter ? (
                            <span className="text-blue-700">{p.nominal_diameter ? `${p.nominal_diameter}"` : '—'}</span>
                          ) : '—'}
                        </td>
                        <td className="py-2 px-3"><Badge variant="outline" className={`text-[10px] ${p.mount_type === 'bolt_on' ? 'border-red-300 text-red-700 bg-red-50' : ''}`}>{p.mount_type === 'slip_in' ? 'Slip-In' : p.mount_type === 'bolt_on_exterior' ? 'Bolt-On Ext' : p.mount_type === 'bolt_on' ? 'Legacy' : 'Crown'}</Badge></td>
                        <td className="py-2 px-3">{p.cap_style || '—'}</td>
                        <td className="py-2 px-3">{p.base_material || '—'}</td>
                        <td className="py-2 px-3">{[p.finish, p.finish_color].filter(Boolean).join(' / ') || '—'}</td>
                        <td className="py-2 px-3">{p.coverage_type ? p.coverage_type.replace(/_/g, ' ') : '—'}</td>
                        <td className="py-2 px-3">{p.min_fitting_length || 0} × {p.min_fitting_width || 0}</td>
                        <td className="py-2 px-3">{p.max_fitting_length || '∞'} × {p.max_fitting_width || '∞'}</td>
                        <td className="py-2 px-3">{p.allows_rotated_match ? '✓' : '—'}</td>
                        <td className="py-2 px-3">{p.min_tile_projection || '—'}</td>
                        <td className="py-2 px-3">{p.flues_supported || 1}</td>
                        <td className="py-2 px-3">{p.service_id ? <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">Linked</Badge> : <span className="text-amber-600 text-[10px]">Missing</span>}</td>
                        <td className="py-2 px-3">{p.is_preferred ? <Badge variant="outline" className="text-[10px] text-blue-700 border-blue-300">★ {p.priority || 0}</Badge> : <span className="text-muted-foreground">{p.priority || 0}</span>}</td>
                        <td className="py-2 px-3"><Badge variant={isActive ? 'secondary' : 'outline'} className={`text-[10px] ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{isActive ? 'Active' : 'Inactive'}</Badge></td>
                        <td className="py-2 px-3">
                          <div className="flex justify-end gap-0.5">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(p)} title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                            {p.variant_source === 'copied_from_stainless' && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSyncFromSource(p)} title="Sync sizing data from stainless source" disabled={syncingId === p.id}>
                                {syncingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-blue-600" />}
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDuplicate(p)} title="Duplicate"><Copy className="w-3.5 h-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleToggleActive(p)} title={isActive ? 'Deactivate' : 'Activate'}><Power className={`w-3.5 h-3.5 ${isActive ? 'text-green-600' : 'text-muted-foreground'}`} /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit note */}
      {products.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          All changes are tracked via the <code className="text-[10px]">updated_by</code> and <code className="text-[10px]">updated_date</code> audit fields on each record.
        </p>
      )}

      <CapProductFormDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditProduct(null); }}
        onSaved={load}
        editProduct={editProduct}
        currentUserEmail={user?.email}
      />

      <CapImportPreviewDialog
        open={!!importPreview}
        preview={importPreview}
        onConfirm={handleConfirmImport}
        onClose={() => setImportPreview(null)}
        importing={importing}
      />

      <CopperVariantPreviewDialog
        open={copperDialogOpen}
        onClose={() => setCopperDialogOpen(false)}
        onCompleted={() => { setCopperDialogOpen(false); setSelectedIds(new Set()); load(); }}
        sourceProducts={selectedProducts}
      />

      <LinkMaterialsBySkuDialog
        open={linkSkuDialogOpen}
        onClose={() => setLinkSkuDialogOpen(false)}
        onCompleted={() => load()}
        onResolution={(map) => setLinkResolutionMap(map)}
      />

      <RecoverTruncatedLinksDialog
        open={recoverDialogOpen}
        onClose={() => setRecoverDialogOpen(false)}
        onCompleted={() => load()}
      />

      <BulkClassificationDialog
        open={bulkClassifyOpen}
        onClose={() => setBulkClassifyOpen(false)}
        onCompleted={() => { setBulkClassifyOpen(false); load(); }}
        legacyProducts={products.filter(p => p.mount_type === 'bolt_on')}
      />
    </div>
  );
}