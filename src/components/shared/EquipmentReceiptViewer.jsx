import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, FileSignature, Printer, Archive, ChevronDown, ChevronUp } from 'lucide-react';

const printReceipt = (r) => {
  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Equipment Receipt — ${r.item_name}</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; color: #111; }
        h1 { font-size: 20px; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 16px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
        .label { font-size: 12px; color: #666; }
        .value { font-size: 14px; font-weight: 600; }
        .statement { background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; padding: 12px; font-size: 12px; line-height: 1.6; margin-bottom: 16px; }
        .sig-box { border: 1px solid #ccc; border-radius: 6px; padding: 8px; text-align: center; }
        .sig-box img { max-height: 120px; max-width: 100%; }
        .sig-label { font-size: 11px; color: #666; margin-bottom: 6px; }
        .archived-badge { display: inline-block; background: #f3f4f6; color: #6b7280; border: 1px solid #d1d5db; border-radius: 4px; padding: 2px 8px; font-size: 11px; margin-bottom: 12px; }
        @media print { body { margin: 20px; } }
      </style>
    </head>
    <body>
      <h1>Equipment Receipt${r.is_archived ? ' (Archived)' : ''}</h1>
      ${r.is_archived ? `<div class="archived-badge">Archived — ${r.archive_reason || 'Item removed'}</div>` : ''}
      <div class="grid">
        <div><div class="label">Technician</div><div class="value">${r.technician_name || '—'}</div></div>
        <div><div class="label">Type</div><div class="value">${r.receipt_type === 'new_tool' ? 'New Tool' : 'Replacement'}</div></div>
        <div><div class="label">Item</div><div class="value">${r.item_name}</div></div>
        <div><div class="label">Quantity</div><div class="value">${r.quantity || 1}</div></div>
        <div class="grid" style="grid-column:span 2;padding:0;gap:0"><div class="label">Date Signed</div><div class="value">${r.signed_date ? new Date(r.signed_date).toLocaleString() : '—'}</div></div>
      </div>
      ${r.statement ? `<div class="statement">${r.statement}</div>` : ''}
      <div class="sig-box">
        <div class="sig-label">Technician Signature</div>
        <img src="${r.signature_data_url}" alt="Signature" />
      </div>
    </body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
};

const archiveReceipt = async (r, setReceipts) => {
  await base44.entities.EquipmentReceipt.update(r.id, { is_archived: true, archive_reason: 'Manually archived by admin' });
  setReceipts(prev => prev.map(receipt => receipt.id === r.id ? { ...receipt, is_archived: true, archive_reason: 'Manually archived by admin' } : receipt));
};

export default function EquipmentReceiptViewer({ technicianEmail, adminView = false }) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewReceipt, setViewReceipt] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (!technicianEmail) return;
    base44.entities.EquipmentReceipt.filter({ technician_email: technicianEmail }, '-signed_date')
      .then(setReceipts)
      .finally(() => setLoading(false));
  }, [technicianEmail]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  const active = receipts.filter(r => !r.is_archived);
  const archived = receipts.filter(r => r.is_archived);

  if (receipts.length === 0) return (
    <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-xl">
      <FileSignature className="w-7 h-7 mx-auto mb-2 opacity-40" />
      <p>No signed receipts on file yet.</p>
    </div>
  );

  const ReceiptRow = ({ r }) => (
    <div key={r.id} className="px-4 py-3 bg-card hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setViewReceipt(r)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{r.item_name}</p>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-0.5">
            {adminView && <span className="font-medium text-foreground">{r.technician_name}</span>}
            <span className="capitalize">{r.receipt_type === 'new_tool' ? 'New Tool' : 'Replacement'}</span>
            {r.quantity > 1 && <span>Qty: {r.quantity}</span>}
            {r.signed_date && <span>Signed: {new Date(r.signed_date).toLocaleDateString()}</span>}
            {r.is_archived && r.archive_reason && <span className="text-muted-foreground italic">{r.archive_reason}</span>}
          </div>
        </div>
        {r.is_archived ? (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            <Archive className="w-3 h-3" /> Archived
          </span>
        ) : (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <FileSignature className="w-3 h-3" /> Signed
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {active.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-xl">
          <FileSignature className="w-7 h-7 mx-auto mb-2 opacity-40" />
          <p>No active signed receipts.</p>
        </div>
      ) : (
        <div className="divide-y border rounded-xl overflow-hidden">
          {active.map(r => <ReceiptRow key={r.id} r={r} />)}
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived(v => !v)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            {showArchived ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <Archive className="w-3.5 h-3.5" />
            {archived.length} archived receipt{archived.length !== 1 ? 's' : ''} (returned / replaced / lost)
          </button>
          {showArchived && (
            <div className="divide-y border rounded-xl overflow-hidden opacity-70">
              {archived.map(r => <ReceiptRow key={r.id} r={r} />)}
            </div>
          )}
        </div>
      )}

      {/* Receipt detail dialog */}
      <Dialog open={!!viewReceipt} onOpenChange={open => !open && setViewReceipt(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="w-4 h-4" /> Equipment Receipt
              {viewReceipt?.is_archived && (
                <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500 font-normal flex items-center gap-1">
                  <Archive className="w-3 h-3" /> Archived
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewReceipt && (
            <div className="space-y-4 py-2">
              {viewReceipt.is_archived && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
                  <strong>Archived:</strong> {viewReceipt.archive_reason || 'Item removed from technician'}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Technician:</span> <span className="font-medium">{viewReceipt.technician_name}</span></div>
                <div><span className="text-muted-foreground">Type:</span> <span className="capitalize">{viewReceipt.receipt_type === 'new_tool' ? 'New Tool' : 'Replacement'}</span></div>
                <div><span className="text-muted-foreground">Item:</span> <span className="font-medium">{viewReceipt.item_name}</span></div>
                <div><span className="text-muted-foreground">Quantity:</span> <span className="font-medium">{viewReceipt.quantity || 1}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Signed:</span> <span className="font-medium">{viewReceipt.signed_date ? new Date(viewReceipt.signed_date).toLocaleString() : '—'}</span></div>
              </div>
              {viewReceipt.statement && (
                <div className="p-3 bg-muted/40 border rounded-lg text-xs text-foreground leading-relaxed">
                  {viewReceipt.statement}
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Technician Signature</p>
                <div className="border rounded-lg bg-white p-2 flex items-center justify-center">
                  <img src={viewReceipt.signature_data_url} alt="Signature" className="max-h-32 object-contain" />
                </div>
              </div>
              <div className="flex justify-between gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => archiveReceipt(viewReceipt, setReceipts)} className="text-destructive hover:text-destructive">
                  <Archive className="w-4 h-4 mr-1.5" /> Archive Receipt
                </Button>
                <Button size="sm" variant="outline" onClick={() => printReceipt(viewReceipt)}>
                  <Printer className="w-4 h-4 mr-1.5" /> Print Receipt
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}