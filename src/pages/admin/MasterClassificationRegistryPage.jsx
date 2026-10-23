import { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Search, Download, Upload, Database, Archive, RotateCcw, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import ClassificationGroup from '@/components/admin/ClassificationGroup';
import ClassificationFormDialog from '@/components/admin/ClassificationFormDialog';
import ArchiveClassificationDialog from '@/components/admin/ArchiveClassificationDialog';
import ClassificationImportDialog from '@/components/admin/ClassificationImportDialog';

const TYPE_LABELS = [
  { value: 'inspection_category', label: 'Inspection Categories' },
  { value: 'inspection_section', label: 'Inspection Sections' },
  { value: 'inspection_form', label: 'Inspection Forms' },
  { value: 'deficiency_type', label: 'Deficiency Types' },
  { value: 'appliance_system_type', label: 'Appliance / System Types' },
  { value: 'chimney_system_type', label: 'Chimney System Types' },
  { value: 'severity_level', label: 'Severity Levels' },
  { value: 'homeowner_risk', label: 'Homeowner Risk' },
  { value: 'finding_category', label: 'Finding Categories' },
  { value: 'repair_category', label: 'Repair Categories' },
];

export default function MasterClassificationRegistryPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [formDialog, setFormDialog] = useState(null);
  const [archiveDialog, setArchiveDialog] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [usageMap, setUsageMap] = useState({});

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const all = await base44.entities.MasterClassification.filter({}, 'sort_order', 500);
      setRecords(all);
    } catch (e) {
      toast.error('Failed to load classifications: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Compute usage counts in parallel
  const loadUsageCounts = useCallback(async (allRecords) => {
    const usageFields = [
      { entity: 'InspectionQuestion', fields: ['category', 'question_category', 'finding_type_config'] },
      { entity: 'LogicRule', fields: ['category', 'output_finding_type'] },
      { entity: 'RepairRecommendationTemplate', fields: ['deficiency_type', 'inspection_category', 'inspection_section', 'appliance_type', 'chimney_system_type'] },
      { entity: 'ServiceCatalog', fields: ['category'] },
    ];
    try {
      const results = await Promise.all(
        usageFields.map(async q => {
          try {
            const recs = await base44.entities[q.entity].filter({}, null, 500);
            return { entity: q.entity, fields: q.fields, recs };
          } catch {
            return { entity: q.entity, fields: q.fields, recs: [] };
          }
        })
      );
      const counts = {};
      for (const rec of allRecords) {
        let total = 0;
        for (const result of results) {
          total += result.recs.filter(r =>
            result.fields.some(f => r[f] && r[f] === rec.value)
          ).length;
        }
        if (total > 0) counts[rec.id] = total;
      }
      setUsageMap(counts);
    } catch {
      // Non-critical — usage counts are optional
    }
  }, []);

  useEffect(() => {
    loadRecords().then(() => {
      // Usage counts loaded after records are available
    });
  }, [loadRecords]);

  useEffect(() => {
    if (records.length > 0) {
      loadUsageCounts(records);
    }
  }, [records, loadUsageCounts]);

  const handleReorder = async (typeKey, groupRecords, fromIdx, toIdx) => {
    const reordered = [...groupRecords];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    // Optimistic update
    const newSortOrders = reordered.map((r, i) => ({ id: r.id, sort_order: i + 1 }));
    setRecords(prev => prev.map(r => {
      const update = newSortOrders.find(n => n.id === r.id);
      return update ? { ...r, sort_order: update.sort_order } : r;
    }));

    // Persist
    try {
      await base44.entities.MasterClassification.bulkUpdate(newSortOrders);
      toast.success('Order updated');
    } catch (e) {
      toast.error('Failed to save order: ' + e.message);
      loadRecords(); // Revert on failure
    }
  };

  const handleArchive = (rec) => setArchiveDialog(rec);
  const handleRestore = async (rec) => {
    try {
      await base44.entities.MasterClassification.update(rec.id, { is_active: true });
      toast.success(`${rec.label || rec.value} restored`);
      loadRecords();
    } catch (e) {
      toast.error('Failed to restore: ' + e.message);
    }
  };

  const handleExport = () => {
    const data = records.map(r => ({
      classification_type: r.classification_type,
      value: r.value,
      label: r.label,
      parent_value: r.parent_value || '',
      description: r.description || '',
      sort_order: r.sort_order || 0,
      is_active: r.is_active !== false,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'master-classifications.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data.length} records`);
  };

  // Filter and group records
  const filtered = useMemo(() => {
    let result = records;
    if (filterType !== 'all') {
      result = result.filter(r => r.classification_type === filterType);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.value?.toLowerCase().includes(q) ||
        r.label?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [records, search, filterType]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const r of filtered) {
      if (!groups[r.classification_type]) groups[r.classification_type] = [];
      groups[r.classification_type].push(r);
    }
    // Sort within group by sort_order
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }
    return groups;
  }, [filtered]);

  const stats = useMemo(() => ({
    total: records.length,
    active: records.filter(r => r.is_active !== false).length,
    archived: records.filter(r => r.is_active === false).length,
    types: new Set(records.map(r => r.classification_type)).size,
  }), [records]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Database className="w-5 h-5" /> Master Classification Registry
          </h1>
          <p className="text-sm text-muted-foreground">Centralized taxonomy for all dropdowns — no module maintains its own list.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={loadRecords} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={loading} className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Import
          </Button>
          <Button size="sm" onClick={() => setFormDialog({})} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total Records</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xl font-bold text-green-600">{stats.active}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xl font-bold text-amber-600">{stats.archived}</p>
          <p className="text-xs text-muted-foreground">Archived</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xl font-bold text-blue-600">{stats.types}</p>
          <p className="text-xs text-muted-foreground">Classification Types</p>
        </CardContent></Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by value, label, or description..."
            className="pl-8"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {TYPE_LABELS.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Groups */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No classifications found. Click "Add" to create one, or "Import" to bulk load.
        </div>
      ) : (
        <div className="space-y-2">
          {TYPE_LABELS
            .filter(t => grouped[t.value])
            .map(type => (
              <ClassificationGroup
                key={type.value}
                typeKey={type.value}
                typeLabel={type.label}
                records={grouped[type.value]}
                usageMap={usageMap}
                onEdit={rec => setFormDialog(rec)}
                onArchive={handleArchive}
                onRestore={handleRestore}
                onReorder={handleReorder}
              />
            ))}
        </div>
      )}

      {/* Dialogs */}
      <ClassificationFormDialog
        open={!!formDialog}
        onClose={() => setFormDialog(null)}
        onSaved={loadRecords}
        record={formDialog && formDialog.id ? formDialog : null}
        allRecords={records}
      />
      <ArchiveClassificationDialog
        open={!!archiveDialog}
        onClose={() => setArchiveDialog(null)}
        onConfirm={loadRecords}
        record={archiveDialog}
      />
      <ClassificationImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={loadRecords}
      />
    </div>
  );
}