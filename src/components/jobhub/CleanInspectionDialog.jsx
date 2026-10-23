import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2, FileText, PenTool, Loader2, Download, Flag, ExternalLink,
} from 'lucide-react';
import CustomerSignatureModal from '@/components/jobhub/CustomerSignatureModal';

export function useInspectionWorkflowConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const configs = await base44.entities.InspectionWorkflowConfig.list().catch(() => []);
      setConfig(configs[0] || null);
    } catch (e) {
      console.error('Failed to load workflow config:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return {
    config,
    loading,
    requireSignatureClean: config?.require_signature_clean_inspection ?? true,
    requireSignatureWithRecs: config?.require_signature_with_recommendations ?? true,
    reload: load,
  };
}

export default function CleanInspectionDialog({
  open, onClose, onComplete, job, inspectionReport, requireSignature, effectiveName,
}) {
  const [reportReviewed, setReportReviewed] = useState(false);
  const [signatureCaptured, setSignatureCaptured] = useState(false);
  const [finalNotes, setFinalNotes] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [signatureAudit, setSignatureAudit] = useState(null);

  const reset = () => {
    setReportReviewed(false);
    setSignatureCaptured(false);
    setSignatureAudit(null);
    setFinalNotes('');
    setPdfUrl(null);
  };

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    try {
      const res = await base44.functions.invoke('generateReportPdf', { job_id: job?.id });
      if (res.data?.pdf_url) {
        setPdfUrl(res.data.pdf_url);
        window.open(res.data.pdf_url, '_blank');
      } else if (res.data?.url) {
        setPdfUrl(res.data.url);
        window.open(res.data.url, '_blank');
      }
    } catch (e) {
      console.error('PDF generation failed:', e);
    }
    setGeneratingPdf(false);
  };

  const handleSignatureOpen = () => setSigModalOpen(true);

  const handleSignatureSign = async (auditData) => {
    setSignatureAudit(auditData);
    setSignatureCaptured(true);
    setSigModalOpen(false);
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await onComplete({
        reportReviewed,
        signatureCaptured,
        signatureAudit,
        finalNotes: finalNotes.trim(),
        pdfUrl,
      });
      reset();
    } catch (e) {
      console.error('Complete failed:', e);
    }
    setCompleting(false);
  };

  const canComplete = reportReviewed && (!requireSignature || signatureCaptured);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" /> Clean Inspection Completion
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-2">
          <div className="space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">No repair recommendations were generated.</p>
                <p className="text-xs mt-0.5">This inspection is clean. Review the report with the customer and complete the appointment.</p>
              </div>
            </div>

            {/* PDF Preview */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Inspection Report
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="gap-1.5 flex-1"
                  onClick={handleGeneratePdf}
                  disabled={generatingPdf}
                >
                  {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {generatingPdf ? 'Generating PDF...' : 'Preview Inspection Report'}
                </Button>
                {pdfUrl && (
                  <Button variant="ghost" size="icon" onClick={() => window.open(pdfUrl, '_blank')}>
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {inspectionReport?.ai_summary_final && (
                <div className="rounded-lg bg-muted/30 border p-3 text-xs text-muted-foreground max-h-32 overflow-y-auto">
                  <p className="font-medium mb-1">AI Summary (approved):</p>
                  <p className="whitespace-pre-wrap">{inspectionReport.ai_summary_final}</p>
                </div>
              )}
            </div>

            {/* Report reviewed checkbox */}
            <div className="flex items-start gap-2 p-3 rounded-lg border">
              <Checkbox
                checked={reportReviewed}
                onCheckedChange={(v) => setReportReviewed(!!v)}
                id="report-reviewed"
                className="mt-0.5"
              />
              <Label htmlFor="report-reviewed" className="text-sm font-normal cursor-pointer">
                I have reviewed the inspection report with the customer
              </Label>
            </div>

            {/* Signature (conditional) */}
            {requireSignature && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Customer Acknowledgment Signature (required)
                </Label>
                {!signatureCaptured ? (
                  <Button variant="outline" className="gap-1.5 w-full" onClick={handleSignatureOpen}>
                    <PenTool className="w-4 h-4" /> Capture Customer Signature
                  </Button>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                      <CheckCircle2 className="w-4 h-4" /> Signature captured
                      {signatureAudit?.signerName && (
                        <span className="text-xs text-green-600">— {signatureAudit.signerName}</span>
                      )}
                    </div>
                    {signatureAudit?.signatureUrl && (
                      <img
                        src={signatureAudit.signatureUrl}
                        alt="Customer signature"
                        className="max-h-16 object-contain border rounded bg-white p-1"
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Final notes */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Final Technician Notes (optional)
              </Label>
              <Textarea
                value={finalNotes}
                onChange={(e) => setFinalNotes(e.target.value)}
                placeholder="Any final notes for this appointment..."
                rows={3}
                className="text-sm"
              />
            </div>

            {!canComplete && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {requireSignature
                  ? 'Review report with customer and capture acknowledgment signature to complete.'
                  : 'Review report with customer to complete.'}
              </p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            className="gap-1.5 bg-green-600 hover:bg-green-700"
            onClick={handleComplete}
            disabled={!canComplete || completing}
          >
            {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
            Complete Appointment
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Real signature pad modal — only marks captured on successful sign */}
      <CustomerSignatureModal
        open={sigModalOpen}
        onClose={() => setSigModalOpen(false)}
        onSign={handleSignatureSign}
        defaultSignerName={job?.customer_name || ''}
        defaultPurpose="clean_inspection_acknowledgment"
        title="Customer Acknowledgment Signature"
      />
    </Dialog>
  );
}