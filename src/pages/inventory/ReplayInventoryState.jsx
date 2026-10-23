import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Loader2, Clock, FileDown, FileSpreadsheet, AlertTriangle, Paperclip,
  RotateCcw, Code,
} from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import { useEmployeeAuditMap } from '@/hooks/useEmployeeAuditMap';
import {
  sortTransactionsChronological, getIndexForTimestamp, getStateAtIndex,
  getTxnAtIndex, buildReplaySummary, exportReplayCSV, buildCorrectiveActionContext,
} from '@/lib/inventoryReplay';
import { QUANTITY_BUCKETS, INVENTORY_TYPES } from '@/lib/inventoryMasterConstants';
import ReplaySummaryCard from '@/components/inventory/replay/ReplaySummaryCard';
import ReplayTransactionTable from '@/components/inventory/replay/ReplayTransactionTable';
import ReplayScrubber from '@/components/inventory/replay/ReplayScrubber';
import StateComparison from '@/components/inventory/replay/StateComparison';

export default function ReplayInventoryState() {
  const [searchParams] = useSearchParams();
  const presetItemId = searchParams.get('itemId');
  const { employee } = useEmployeeContext();
  const employeeMap = useEmployeeAuditMap();

  const [allItems, setAllItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [locationFilter, setLocationFilter] = useState('');

  const [transactions, setTransactions] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [transferSheets, setTransferSheets] = useState([]);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [scrubberIndex, setScrubberIndex] = useState(0);
  const [developerMode, setDeveloperMode] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await base44.functions.invoke('inventoryQuery', { type: 'all', exportAll: true });
        setAllItems(res.data?.items || []);
        if (presetItemId) setSelectedItemId(presetItemId);
      } catch {
        toast.error('Failed to load inventory items');
      } finally {
        setLoadingItems(false);
      }
    };
    load();
  }, [presetItemId]);

  useEffect(() => {
    if (!selectedItemId) {
      setTransactions([]);
      setScrubberIndex(0);
      return;
    }
    setLoadingTxns(true);
    Promise.all([
      base44.entities.InventoryTransaction.filter({ inventory_master_id: selectedItemId }, '-created_date', 200),
      base44.entities.Job.list('-created_date', 500),
      base44.entities.MaterialTransferSheet.list('-created_date', 200),
    ]).then(([txns, jobList, transfers]) => {
      setTransactions(txns || []);
      setJobs(jobList || []);
      setTransferSheets(transfers || []);
      setScrubberIndex((txns || []).length);
    }).catch(() => toast.error('Failed to load transactions'))
      .finally(() => setLoadingTxns(false));
  }, [selectedItemId]);

  const sortedTxns = useMemo(() => sortTransactionsChronological(transactions), [transactions]);

  const filteredItems = useMemo(() => {
    let items = allItems;
    if (typeFilter) items = items.filter(i => i.inventory_type === typeFilter);
    if (locationFilter) {
      const q = locationFilter.toLowerCase();
      items = items.filter(i => (i.warehouse_location || '').toLowerCase().includes(q));
    }
    return items;
  }, [allItems, typeFilter, locationFilter]);

  const selectedItem = useMemo(() => allItems.find(i => i.id === selectedItemId), [allItems, selectedItemId]);

  const replayState = useMemo(() => getStateAtIndex(sortedTxns, scrubberIndex), [sortedTxns, scrubberIndex]);
  const beforeState = useMemo(() => getStateAtIndex(sortedTxns, scrubberIndex - 1), [sortedTxns, scrubberIndex]);
  const currentTxn = useMemo(() => getTxnAtIndex(sortedTxns, scrubberIndex), [sortedTxns, scrubberIndex]);
  const lastTxnBefore = currentTxn;
  const nextTxnAfter = useMemo(() => getTxnAtIndex(sortedTxns, scrubberIndex + 1), [sortedTxns, scrubberIndex]);

  const asOfTimestamp = currentTxn
    ? (currentTxn.transaction_date || currentTxn.created_date)
    : (date ? (time ? `${date}T${time}` : `${date}T23:59:59`) : null);

  const handleReconstruct = () => {
    if (!selectedItemId) { toast.error('Please select an inventory item'); return; }
    if (!date) { toast.error('Please select a date'); return; }
    const datetime = time ? `${date}T${time}` : `${date}T23:59:59`;
    const idx = getIndexForTimestamp(sortedTxns, datetime);
    setScrubberIndex(idx);
    toast.success(`Reconstructed state as of ${new Date(datetime).toLocaleString()}`);
  };

  const handleExportPDF = () => {
    if (!selectedItem) return;
    const doc = new jsPDF();
    const summary = buildReplaySummary(selectedItem, replayState, asOfTimestamp || new Date(), lastTxnBefore, employeeMap, nextTxnAfter, sortedTxns);
    let y = 20;
    doc.setFontSize(16);
    doc.text('Inventory Replay Report', 20, y);
    y += 4;
    doc.setLineWidth(0.5);
    doc.line(20, y, 190, y);
    y += 8;
    doc.setFontSize(9);
    for (const line of summary.split('\n')) {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(line, 20, y);
      y += 5;
    }
    doc.save(`inventory-replay-${selectedItem.sku || selectedItem.id}.pdf`);
    toast.success('PDF exported');
  };

  const handleExportCSV = () => {
    if (!selectedItem) return;
    exportReplayCSV(selectedItem, replayState, asOfTimestamp || new Date(), sortedTxns, employeeMap);
    toast.success('CSV exported');
  };

  const handleAttachCorrectiveAction = async () => {
    if (!selectedItem) return;
    try {
      const ctx = buildCorrectiveActionContext(selectedItem, replayState, asOfTimestamp || new Date(), sortedTxns, employeeMap);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
      await base44.entities.CorrectiveAction.create({
        description: `Inventory Replay Report — ${ctx.relatedInventory}\n\nReplay Timestamp: ${ctx.replayTimestamp}\nRelated Job: ${ctx.relatedJob}\nRelated Transfer: ${ctx.relatedTransfer}\n\n${ctx.description}`,
        assigned_employee: employee?.first_name ? `${employee.first_name} ${employee.last_name}` : 'Unassigned',
        assigned_employee_registry_id: employee?.id || '',
        assigned_employee_email: employee?.email || '',
        due_date: dueDate.toISOString().split('T')[0],
        status: 'Open',
        priority: 'Medium',
        department: employee?.department || '',
        notes: `Replay as of ${asOfTimestamp ? new Date(asOfTimestamp).toLocaleString() : '—'} | Related Inventory: ${ctx.relatedInventory} | Related Job: ${ctx.relatedJob} | Related Transfer: ${ctx.relatedTransfer}`,
      });
      toast.success('Replay report attached to corrective action');
    } catch {
      toast.error('Failed to create corrective action');
    }
  };

  const canShowResults = selectedItemId && !loadingTxns;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <RotateCcw className="w-5 h-5" /> Replay Inventory State
          </h2>
          <p className="text-sm text-muted-foreground">Reconstruct inventory quantities as of any point in time</p>
        </div>
        <Button
          variant={developerMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => setDeveloperMode(!developerMode)}
          className={developerMode ? 'bg-purple-600 text-white hover:bg-purple-700' : ''}
        >
          <Code className="w-4 h-4 mr-1" /> Dev Mode
        </Button>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Inventory &amp; Timestamp</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingItems ? (
            <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Inventory Type (optional)</Label>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm">
                  <option value="">All Types</option>
                  {INVENTORY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Inventory Item</Label>
                <select value={selectedItemId} onChange={e => setSelectedItemId(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm">
                  <option value="">Select an item...</option>
                  {filteredItems.map(i => (
                    <option key={i.id} value={i.id}>{i.item_name} ({i.sku || i.inventory_id || '—'})</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Time (optional)</Label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Location (optional)</Label>
                <input type="text" value={locationFilter} onChange={e => setLocationFilter(e.target.value)} placeholder="Filter by location" className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm" />
              </div>
              <div className="flex items-end">
                <Button onClick={handleReconstruct} disabled={!selectedItemId || !date} className="w-full">
                  <Clock className="w-4 h-4 mr-1" /> Reconstruct
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {canShowResults && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-700 font-medium">
            Historical view only — current inventory is not affected.
          </p>
        </div>
      )}

      {loadingTxns && (
        <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      )}

      {canShowResults && !loadingTxns && selectedItem && (
        <>
          {/* Export buttons */}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <FileDown className="w-4 h-4 mr-1" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <FileSpreadsheet className="w-4 h-4 mr-1" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleAttachCorrectiveAction}>
              <Paperclip className="w-4 h-4 mr-1" /> Attach to Corrective Action
            </Button>
          </div>

          {/* Historical Summary */}
          <ReplaySummaryCard
            item={selectedItem}
            state={replayState}
            asOfTimestamp={asOfTimestamp}
            lastTxnBefore={lastTxnBefore}
            nextTxnAfter={nextTxnAfter}
            employeeMap={employeeMap}
          />

          {/* Quantity Buckets */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Reconstructed Quantities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {QUANTITY_BUCKETS.map(bucket => {
                  const val = replayState[bucket.key] || 0;
                  return (
                    <div key={bucket.key} className="rounded-lg border p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`w-2.5 h-2.5 rounded-full ${bucket.dot}`} />
                        <span className="text-xs text-muted-foreground">{bucket.label}</span>
                      </div>
                      <p className={`text-xl font-bold tabular-nums ${bucket.color}`}>{val}</p>
                      <p className="text-xs text-muted-foreground">{selectedItem.unit || 'ea'}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* State Comparison */}
          {scrubberIndex > 0 && (
            <StateComparison beforeState={beforeState} afterState={replayState} item={selectedItem} />
          )}

          {/* Timeline Scrubber */}
          {sortedTxns.length > 0 && (
            <ReplayScrubber
              sortedTxns={sortedTxns}
              scrubberIndex={scrubberIndex}
              onIndexChange={setScrubberIndex}
            />
          )}

          {/* Transaction Table */}
          {sortedTxns.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Transaction History ({sortedTxns.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ReplayTransactionTable
                  transactions={sortedTxns}
                  item={selectedItem}
                  employeeMap={employeeMap}
                  jobs={jobs}
                  transferSheets={transferSheets}
                  developerMode={developerMode}
                />
              </CardContent>
            </Card>
          )}

          {sortedTxns.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                No transactions found for this inventory item.
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!canShowResults && !loadingTxns && !loadingItems && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Select an inventory item and date to reconstruct its historical state.
          </CardContent>
        </Card>
      )}
    </div>
  );
}