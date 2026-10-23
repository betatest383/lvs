import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Search, Package, AlertTriangle, DollarSign, Pencil, ArrowRightLeft, AlertCircle, Eye, Upload, Download, FileDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import InventoryMasterFormDialog from '@/components/inventory/InventoryMasterFormDialog';
import InventoryTransactionDialog from '@/components/inventory/InventoryTransactionDialog';
import QuantitiesCell from '@/components/inventory/QuantitiesCell';
import MaterialImportDialog from '@/components/inventory/MaterialImportDialog';
import { generateExportCSV, generateTemplateCSV, downloadCSV } from '@/lib/materialImportExport';
import {
  INVENTORY_TYPES,
  getInventoryTypeMeta,
  getInventoryStatusColor,
  isLowStock,
  isOutOfStock,
  checkBalance,
} from '@/lib/inventoryMasterConstants';

const PAGE_SIZE = 100;

export default function InventoryMasterList({ type }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [showUnbalancedOnly, setShowUnbalancedOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [txnItem, setTxnItem] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const toggleRow = (rowId) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  // Load summary (stats + categories) — full dataset, backend-paginated
  const loadSummary = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('inventorySummary', { type: type || 'all' });
      setSummary(res.data);
    } catch { /* silent */ }
  }, [type]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Load paginated table data — server-side search + filters
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('inventoryQuery', {
        type: type || 'all',
        search: debouncedSearch,
        category: categoryFilter,
        status: statusFilter,
        lowStockOnly: showLowOnly,
        unbalancedOnly: showUnbalancedOnly,
        page,
        limit: PAGE_SIZE,
      });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.totalPages || 1);
    } catch {
      toast.error('Failed to load inventory');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [type, debouncedSearch, categoryFilter, statusFilter, showLowOnly, showUnbalancedOnly, page]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadItems(); }, [loadItems]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [categoryFilter, statusFilter, showLowOnly, showUnbalancedOnly, type]);

  const categories = useMemo(() => {
    const cats = summary?.categories || [];
    return ['all', ...cats];
  }, [summary]);

  const stats = useMemo(() => {
    if (!summary) return { totalItems: 0, lowStock: 0, outOfStock: 0, unbalanced: 0, totalValue: 0 };
    if (type && type !== 'all') {
      const t = summary.byType?.[type] || {};
      return {
        totalItems: t.total || 0,
        lowStock: t.lowStock || 0,
        outOfStock: t.outOfStock || 0,
        unbalanced: t.unbalanced || 0,
        totalValue: t.totalValue || 0,
      };
    }
    const t = summary.totals || {};
    return {
      totalItems: t.total || 0,
      lowStock: t.lowStock || 0,
      outOfStock: t.outOfStock || 0,
      unbalanced: t.unbalanced || 0,
      totalValue: t.totalValue || 0,
    };
  }, [summary, type]);

  const typeMeta = type && type !== 'all' ? getInventoryTypeMeta(type) : null;
  const pageTitle = typeMeta ? `${typeMeta.label}s` : 'All Inventory';
  const pageDesc = typeMeta ? `Manage ${typeMeta.label.toLowerCase()} stock, assignments, and transactions` : 'Unified inventory across all types';

  const handleEdit = (item) => { setEditingItem(item); setFormOpen(true); };
  const handleAdd = () => { setEditingItem(null); setFormOpen(true); };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await base44.functions.invoke('inventoryQuery', {
        type: type || 'all',
        search: debouncedSearch,
        category: categoryFilter,
        status: statusFilter,
        lowStockOnly: showLowOnly,
        unbalancedOnly: showUnbalancedOnly,
        exportAll: true,
      });
      const allItems = res.data.items || [];
      const csv = generateExportCSV(allItems);
      downloadCSV(csv, `materials-export-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`Exported ${allItems.length} materials`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    downloadCSV(generateTemplateCSV(), 'material-import-template.csv');
  };

  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{pageTitle}</h2>
          <p className="text-xs text-muted-foreground">{pageDesc}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
            <FileDown className="w-4 h-4" /> Template
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" /> Import
          </Button>
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4" /> Add Item
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">Total Items</span>
            </div>
            <p className="text-2xl font-bold">{stats.totalItems}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-xs text-muted-foreground">Low Stock</span>
            </div>
            <p className="text-2xl font-bold">{stats.lowStock}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span className="text-xs text-muted-foreground">Out of Stock</span>
            </div>
            <p className="text-2xl font-bold">{stats.outOfStock}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-orange-600" />
              <span className="text-xs text-muted-foreground">Unbalanced</span>
            </div>
            <p className="text-2xl font-bold">{stats.unbalanced}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-purple-600" />
              <span className="text-xs text-muted-foreground">Total Value</span>
            </div>
            <p className="text-2xl font-bold">${stats.totalValue.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, SKU, vendor, INV-ID..." className="pl-9" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="all">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Discontinued">Discontinued</option>
        </select>
        <Button variant={showLowOnly ? 'default' : 'outline'} size="sm" onClick={() => setShowLowOnly(!showLowOnly)}>
          <AlertTriangle className="w-4 h-4" /> Low Stock
        </Button>
        <Button variant={showUnbalancedOnly ? 'default' : 'outline'} size="sm" onClick={() => setShowUnbalancedOnly(!showUnbalancedOnly)}>
          <AlertCircle className="w-4 h-4" /> Unbalanced
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No items found. Click "Add Item" to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left">
                  <th className="p-3 font-medium">INV ID / SKU</th>
                  <th className="p-3 font-medium">Item Name</th>
                  {!typeMeta && <th className="p-3 font-medium">Type</th>}
                  <th className="p-3 font-medium">Category</th>
                  <th className="p-3 font-medium min-w-[200px]">Quantities</th>
                  <th className="p-3 font-medium">Location</th>
                  <th className="p-3 font-medium text-right">Value</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map(item => {
                  const low = isLowStock(item);
                  const out = isOutOfStock(item);
                  const balanced = checkBalance(item);
                  const isOpen = expandedRows.has(item.id);
                  return (
                    <tr key={item.id} className="hover:bg-muted/30 align-top">
                      <td className="p-3 font-mono text-xs">
                        {item.inventory_id || '—'}
                        <div className="text-muted-foreground">{item.sku || ''}</div>
                      </td>
                      <td className="p-3 font-medium">{item.item_name}</td>
                      {!typeMeta && (
                        <td className="p-3">
                          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${getInventoryTypeMeta(item.inventory_type).color}`}>
                            {item.inventory_type}
                          </span>
                        </td>
                      )}
                      <td className="p-3 text-muted-foreground">{item.category || '—'}</td>
                      <td className="p-3">
                        <QuantitiesCell item={item} isOpen={isOpen} onToggle={() => toggleRow(item.id)} />
                      </td>
                      <td className="p-3 text-xs">
                        {item.warehouse_location || '—'}
                        {item.bin_location && <span className="text-muted-foreground"> · {item.bin_location}</span>}
                      </td>
                      <td className="p-3 text-right tabular-nums">${(item.inventory_value || 0).toFixed(2)}</td>
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold w-fit ${getInventoryStatusColor(item.status || 'Active')}`}>
                            {item.status || 'Active'}
                          </span>
                          {!balanced && <span className="text-xs text-red-600 font-medium">UNBALANCED</span>}
                          {low && !out && <span className="text-xs text-amber-600 font-medium">LOW</span>}
                          {out && <span className="text-xs text-red-600 font-medium">OUT</span>}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/inventory/master/detail/${item.id}`)} title="View Details">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setTxnItem(item)} title="Transaction">
                            <ArrowRightLeft className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(item)} title="Edit">
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-xs text-muted-foreground">
              Showing {showingFrom}–{showingTo} of {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                <ChevronLeft className="w-4 h-4" /> Prev
              </Button>
              <span className="text-sm font-medium tabular-nums">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      <InventoryMasterFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => { loadSummary(); loadItems(); }}
        editingItem={editingItem}
        defaultType={type && type !== 'all' ? type : undefined}
      />
      <InventoryTransactionDialog
        open={!!txnItem}
        onOpenChange={(v) => !v && setTxnItem(null)}
        onSaved={() => { loadSummary(); loadItems(); }}
        item={txnItem}
      />
      <MaterialImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => { loadSummary(); loadItems(); }}
      />
    </div>
  );
}