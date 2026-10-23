import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2, FileText } from 'lucide-react';

const conditionColor = {
  excellent: 'bg-emerald-100 text-emerald-700',
  good: 'bg-green-100 text-green-700',
  fair: 'bg-amber-100 text-amber-700',
  poor: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export default function TechReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    base44.entities.InspectionReport.list('-created_date', 100).then(r => {
      setReports(r);
      setLoading(false);
    });
  }, []);

  const handleDownloadPdf = async (report) => {
    setDownloadingId(report.id);
    const response = await base44.functions.invoke('generateReportPdf', { report_id: report.id });
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inspection-report-${report.customer_name?.replace(/\s+/g, '-') || report.id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadingId(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inspection Reports</h1>
        <p className="text-muted-foreground text-sm mt-0.5">View and download completed inspection reports</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : reports.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
            No reports generated yet
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <Card key={report.id} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{report.customer_name || '—'}</p>
                  <p className="text-xs text-muted-foreground truncate">{report.address} • {report.inspection_date || '—'}</p>
                  <p className="text-xs text-muted-foreground">Tech: {report.technician_name || '—'}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {report.overall_condition && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${conditionColor[report.overall_condition] || ''}`}>
                      {report.overall_condition}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={downloadingId === report.id}
                    onClick={() => handleDownloadPdf(report)}
                  >
                    {downloadingId === report.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                    PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}