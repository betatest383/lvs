import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import DataTable from '../../components/shared/DataTable';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FileDown, Loader2 } from 'lucide-react';

const statusColor = {
  draft: 'bg-gray-100 text-gray-700',
  pending_review: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  published: 'bg-blue-100 text-blue-700',
};

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const handleDownloadPdf = async (report) => {
    setDownloadingId(report.id);
    const token = localStorage.getItem('base44_access_token') || appParams.token || '';
    const baseUrl = appParams.appBaseUrl || 'https://base44.app';
    const appId = appParams.appId;
    const res = await fetch(`${baseUrl}/api/apps/${appId}/functions/generateReportPdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ report_id: report.id }),
    });
    if (!res.ok) {
      const errText = await res.text();
      toast.error(`Failed to generate PDF: ${errText || res.statusText}`);
      setDownloadingId(null);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inspection-report-${report.customer_name?.replace(/\s+/g, '-') || report.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadingId(null);
  };

  const load = () => base44.entities.InspectionReport.list('-created_date', 100).then(setReports);
  useEffect(() => { load(); }, []);

  const updateStatus = async (status) => {
    await base44.entities.InspectionReport.update(selected.id, { status });
    toast.success(`Report marked as ${status}`);
    setSelected(null);
    load();
  };

  const columns = [
    { key: 'customer_name', label: 'Customer', render: r => <span className="font-medium">{r.customer_name || '—'}</span> },
    { key: 'inspection_type', label: 'Type', render: r => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.inspection_type === 'exterior' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
        {r.inspection_type === 'exterior' ? 'Exterior' : 'Interior'}
      </span>
    )},
    { key: 'address', label: 'Address' },
    { key: 'technician_name', label: 'Technician' },
    { key: 'inspection_date', label: 'Date' },
    { key: 'overall_condition', label: 'Condition', render: r => <span className="capitalize">{r.overall_condition || '—'}</span> },
    { key: 'status', label: 'Status', render: r => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[r.status] || ''}`}>{r.status}</span>
    )},
    { key: 'pdf', label: '', render: r => (
      <div onClick={e => e.stopPropagation()}>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" disabled={downloadingId === r.id} onClick={() => handleDownloadPdf(r)}>
          {downloadingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
          PDF
        </Button>
      </div>
    )},
  ];

  return (
    <>
      <DataTable
        title="Inspection Reports"
        subtitle="Generated inspection reports for customers"
        columns={columns}
        data={reports}
        searchFields={['customer_name', 'address', 'technician_name']}
        emptyMessage="No reports generated yet. Submit an inspection to auto-generate a report."
        onRowClick={setSelected}
      />

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Report Details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium ml-1">{selected.customer_name}</span></div>
                <div><span className="text-muted-foreground">Technician:</span> <span className="font-medium ml-1">{selected.technician_name || '—'}</span></div>
                <div><span className="text-muted-foreground">Address:</span> <span className="font-medium ml-1">{selected.address}</span></div>
                <div><span className="text-muted-foreground">Date:</span> <span className="font-medium ml-1">{selected.inspection_date || '—'}</span></div>
                <div><span className="text-muted-foreground">Condition:</span> <span className="font-medium ml-1 capitalize">{selected.overall_condition || '—'}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[selected.status] || ''}`}>{selected.status}</span></div>
              </div>
              {selected.summary && (
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Summary</p>
                  <p className="bg-muted rounded-lg p-3">{selected.summary}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                {selected.status !== 'pending_review' && <Button variant="outline" onClick={() => updateStatus('pending_review')}>Mark Pending Review</Button>}
                {selected.status !== 'approved' && <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => updateStatus('approved')}>Approve</Button>}
                {selected.status !== 'published' && <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => updateStatus('published')}>Publish to Customer</Button>}
                {selected.status !== 'draft' && <Button variant="outline" onClick={() => updateStatus('draft')}>Revert to Draft</Button>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}