import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FlaskConical, AlertTriangle, CheckCircle2, FileSearch } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_STYLES = {
  ready: 'bg-green-100 text-green-700',
  suggested_service: 'bg-blue-100 text-blue-700',
  manual_review: 'bg-amber-100 text-amber-700',
  missing_price: 'bg-orange-100 text-orange-700',
};

const STATUS_LABELS = {
  ready: 'Ready',
  suggested_service: 'Suggested Service',
  manual_review: 'Manual Review',
  missing_price: 'Missing Price',
};

export default function TestAutoEstimateDialog({ open, onClose }) {
  const [jobs, setJobs] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedInspectionId, setSelectedInspectionId] = useState('');
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState(null);
  const [jobSearch, setJobSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    base44.entities.InspectionSetup.list('-created_date', 100)
      .then(set => setInspections(set))
      .catch(() => {});
    base44.entities.Job.list('-created_date', 50)
      .then(set => setJobs(set))
      .catch(() => {});
  }, [open]);

  // Auto-select inspection when job is selected
  useEffect(() => {
    if (!selectedJobId) {
      setSelectedInspectionId('');
      return;
    }
    const matching = inspections.find(i => i.job_id === selectedJobId);
    setSelectedInspectionId(matching?.id || '');
  }, [selectedJobId, inspections]);

  const handleRunTest = async () => {
    if (!selectedJobId) {
      toast.error('Please select a job or inspection to test');
      return;
    }
    setTesting(true);
    setResults(null);
    try {
      const response = await base44.functions.invoke('testEstimateFromTemplates', {
        job_id: selectedJobId,
        inspection_id: selectedInspectionId || undefined,
      });
      if (response.data?.status === 'error') {
        toast.error(response.data.error || 'Test failed');
      } else {
        setResults(response.data);
        toast.success('Test completed');
      }
    } catch (e) {
      toast.error('Test failed: ' + (e.message || 'Unknown error'));
    }
    setTesting(false);
  };

  const filteredJobs = jobs.filter(j => {
    if (!jobSearch) return true;
    const q = jobSearch.toLowerCase();
    return j.customer_name?.toLowerCase().includes(q) || j.crm_job_number?.toLowerCase().includes(q) || j.address?.toLowerCase().includes(q);
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !testing) { onClose(); setResults(null); } }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-accent" /> Test Auto Estimate Creation
          </DialogTitle>
        </DialogHeader>

        {/* Selection */}
        <div className="space-y-3 flex-shrink-0">
          <div>
            <Label className="text-sm font-medium">Select Job</Label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="Search by customer, job #, or address..."
                value={jobSearch}
                onChange={e => setJobSearch(e.target.value)}
                className="flex-1"
              />
            </div>
            <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg">
              {filteredJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3 text-center">No jobs found</p>
              ) : (
                filteredJobs.slice(0, 20).map(job => (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJobId(job.id)}
                    className={`w-full text-left p-2 border-b last:border-0 hover:bg-accent/5 transition-colors ${
                      selectedJobId === job.id ? 'bg-accent/10 border-l-4 border-l-accent' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium">{job.customer_name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{job.crm_job_number || ''}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{job.status}</Badge>
                    </div>
                    {job.address && <p className="text-xs text-muted-foreground">{job.address}</p>}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <Button onClick={handleRunTest} disabled={testing || !selectedJobId} className="gap-1.5">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSearch className="w-4 h-4" />}
            Run Dry-Run Test
          </Button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto space-y-3">
          {!results && !testing && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Select a job and run the test to see how deficiencies would be matched to templates and services.
            </div>
          )}

          {testing && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">Scanning deficiencies and matching templates...</p>
            </div>
          )}

          {results && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-5 gap-2 flex-shrink-0">
                <SummaryCard label="Scanned" value={results.summary.total_findings_scanned} />
                <SummaryCard label="Eligible" value={results.summary.total_eligible} />
                <SummaryCard label="Ready" value={results.summary.ready} color="text-green-600" />
                <SummaryCard label="Suggested" value={results.summary.suggested_service} color="text-blue-600" />
                <SummaryCard label="Manual" value={results.summary.manual_review} color="text-amber-600" />
              </div>

              {results.summary.total_estimated_value > 0 && (
                <div className="text-sm font-medium p-3 rounded-lg bg-accent/5 border border-accent/20">
                  Total Estimated Value: <span className="text-lg">${results.summary.total_estimated_value.toFixed(2)}</span>
                  <span className="text-muted-foreground ml-2">({results.summary.templates_available} templates available)</span>
                </div>
              )}

              {/* Per-finding results */}
              {results.results.length === 0 ? (
                <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
                  No eligible deficiencies found for this job. Ensure findings exist and are marked as deficiencies with include_in_estimate=true.
                </CardContent></Card>
              ) : (
                results.results.map((r, idx) => (
                  <TestResultCard key={idx} result={r} />
                ))
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => { onClose(); setResults(null); }}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <Card><CardContent className="p-3 text-center">
      <p className={`text-xl font-bold ${color || ''}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
    </CardContent></Card>
  );
}

function TestResultCard({ result }) {
  const hasTemplate = !!result.template_match;
  const hasService = !!result.recommended_service;

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={STATUS_STYLES[result.status] || 'bg-gray-100 text-gray-700'} variant="secondary">
                {STATUS_LABELS[result.status] || result.status}
              </Badge>
              <span className="text-sm font-medium">{result.title}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-muted-foreground">
              <span><strong className="text-foreground">Deficiency:</strong> {result.deficiency_type}</span>
              <span><strong className="text-foreground">Severity:</strong> {result.severity}</span>
              <span><strong className="text-foreground">Source:</strong> {result.match_source}</span>
            </div>
          </div>
          {result.estimated_price > 0 && (
            <div className="text-right">
              <p className="text-lg font-bold">${result.estimated_price.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground">est. price</p>
            </div>
          )}
        </div>

        {/* Description */}
        {result.description && (
          <p className="text-xs text-muted-foreground">{result.description}</p>
        )}

        {/* Template match */}
        {hasTemplate && (
          <div className="p-2 rounded-lg bg-green-50 border border-green-200 text-xs">
            <div className="flex items-center gap-1 font-medium text-green-800">
              <CheckCircle2 className="w-3 h-3" />
              Template: {result.template_match.template_name}
              <span className="text-green-600 ml-1">(score: {result.template_match.score})</span>
            </div>
            {result.template_match.match_reasons && (
              <p className="text-green-700 mt-0.5">{result.template_match.match_reasons.join(', ')}</p>
            )}
            {result.template_match.all_matches?.length > 1 && (
              <p className="text-amber-700 mt-0.5">
                ⚠ {result.template_match.all_matches.length} competing matches:{' '}
                {result.template_match.all_matches.map(m => m.template_name).join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Recommended service */}
        {hasService && (
          <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-xs">
            <div className="font-medium text-blue-800">
              Service: {result.recommended_service.service_name}
              {result.recommended_service.service_code && (
                <span className="text-blue-600 ml-1">({result.recommended_service.service_code})</span>
              )}
            </div>
            {result.recommended_service.default_selling_price > 0 && (
              <span className="text-blue-700">Price: ${result.recommended_service.default_selling_price.toFixed(2)}</span>
            )}
            {(result.recommended_service.estimated_time_hours > 0 || result.recommended_service.estimated_time_minutes > 0) && (
              <span className="text-blue-700 ml-2">
                Time: {result.recommended_service.estimated_time_hours}h {result.recommended_service.estimated_time_minutes}m
              </span>
            )}
          </div>
        )}

        {/* Materials */}
        {result.materials_added?.length > 0 && (
          <div className="text-xs">
            <span className="font-medium">Materials: </span>
            {result.materials_added.map((m, i) => (
              <span key={i} className="text-muted-foreground">
                {m.material_name} (×{m.quantity}, ${m.unit_price}{m.chargeable ? '' : ' internal'})
                {i < result.materials_added.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        )}

        {/* Warnings */}
        {result.warnings?.length > 0 && (
          <div className="flex items-start gap-1 text-xs text-amber-700">
            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>{result.warnings.join('; ')}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}