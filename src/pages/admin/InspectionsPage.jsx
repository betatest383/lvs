import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import DataTable from '../../components/shared/DataTable';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const statusColor = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-purple-100 text-purple-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function InspectionsPage() {
  const [inspections, setInspections] = useState([]);
  const [selected, setSelected] = useState(null);

  const load = () => base44.entities.InspectionSubmission.list('-created_date', 100).then(setInspections);
  useEffect(() => { load(); }, []);

  const columns = [
    { key: 'customer_name', label: 'Customer', render: r => <span className="font-medium">{r.customer_name || '—'}</span> },
    { key: 'inspection_type', label: 'Type', render: r => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.inspection_type === 'exterior' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
        {r.inspection_type === 'exterior' ? 'Exterior' : 'Interior'}
      </span>
    )},
    { key: 'technician_name', label: 'Technician' },
    { key: 'address', label: 'Address' },
    { key: 'date_submitted', label: 'Submitted', render: r => r.date_submitted ? new Date(r.date_submitted).toLocaleDateString() : '—' },
    { key: 'status', label: 'Status', render: r => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[r.status] || ''}`}>{r.status}</span>
    )},
  ];

  const handleApprove = async () => {
    await base44.entities.InspectionSubmission.update(selected.id, { status: 'approved' });

    // Fetch findings linked to this inspection
    const findings = await base44.entities.Finding.filter({ inspection_id: selected.id });
    const hasCritical = findings.some(f => f.severity === 'critical');
    const hasMajor = findings.some(f => f.severity === 'major');
    const overallCondition = hasCritical ? 'critical' : hasMajor ? 'poor' : findings.length > 2 ? 'fair' : findings.length > 0 ? 'good' : 'excellent';

    const summary = findings.length > 0
      ? `Inspection completed with ${findings.length} finding(s). ${hasCritical ? 'Critical issues require immediate attention.' : hasMajor ? 'Major issues found.' : 'Minor issues noted.'}`
      : 'Inspection completed with no significant findings.';

    await base44.entities.InspectionReport.create({
      job_id: selected.job_id,
      inspection_id: selected.id,
      customer_id: selected.customer_id,
      customer_name: selected.customer_name,
      address: selected.address,
      inspection_date: selected.date_submitted ? selected.date_submitted.split('T')[0] : new Date().toISOString().split('T')[0],
      technician_name: selected.technician_name,
      inspection_type: selected.inspection_type || 'interior',
      summary,
      findings_json: JSON.stringify(findings),
      overall_condition: overallCondition,
      photos: selected.photos || [],
      status: 'draft',
    });

    toast.success('Inspection approved & report generated');
    setSelected(null);
    load();
  };

  let parsedAnswers = {};
  if (selected?.answers) {
    try { parsedAnswers = JSON.parse(selected.answers); } catch {}
  }

  return (
    <>
      <DataTable
        title="Inspection Submissions"
        subtitle="Review technician inspection submissions"
        columns={columns}
        data={inspections}
        searchFields={['customer_name', 'technician_name', 'address']}
        onRowClick={setSelected}
      />

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inspection Details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium ml-1">{selected.customer_name}</span></div>
                <div><span className="text-muted-foreground">Technician:</span> <span className="font-medium ml-1">{selected.technician_name}</span></div>
                <div><span className="text-muted-foreground">Address:</span> <span className="font-medium ml-1">{selected.address}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[selected.status] || ''}`}>{selected.status}</span></div>
                <div><span className="text-muted-foreground">Property:</span> <span className="ml-1 capitalize">{selected.property_type}</span></div>
                <div><span className="text-muted-foreground">Chimney:</span> <span className="ml-1 capitalize">{selected.chimney_type}</span></div>
                <div><span className="text-muted-foreground">Fuel:</span> <span className="ml-1 capitalize">{selected.fuel_type}</span></div>
              </div>

              {selected.technician_notes && (
                <div>
                  <h3 className="font-semibold text-sm mb-1">Technician Notes</h3>
                  <p className="text-sm bg-muted rounded-lg p-3">{selected.technician_notes}</p>
                </div>
              )}

              {Object.keys(parsedAnswers).length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2">Answers</h3>
                  <div className="space-y-1 text-sm bg-muted rounded-lg p-3 max-h-60 overflow-y-auto">
                    {Object.entries(parsedAnswers).map(([k, v]) => (
                      <div key={k} className="flex justify-between py-1 border-b border-border/50 last:border-0">
                        <span className="text-muted-foreground truncate mr-4">{k}</span>
                        <span className="font-medium">{Array.isArray(v) ? v.join(', ') : String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.photos?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2">Photos ({selected.photos.length})</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {selected.photos.map((url, i) => (
                      <img key={i} src={url} alt={`Photo ${i + 1}`} className="w-full h-32 object-cover rounded-lg" />
                    ))}
                  </div>
                </div>
              )}

              {selected.status === 'submitted' && (
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleApprove} className="bg-green-600 hover:bg-green-700 text-white">Approve</Button>
                  <Button variant="destructive" onClick={async () => {
                    await base44.entities.InspectionSubmission.update(selected.id, { status: 'rejected' });
                    toast.success('Inspection rejected');
                    setSelected(null);
                    load();
                  }}>Reject</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}