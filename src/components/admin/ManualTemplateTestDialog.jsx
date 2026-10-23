import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, FlaskConical, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const SEVERITIES = [
  { value: '', label: 'Any' },
  { value: 'info', label: 'Info' },
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'major', label: 'Major' },
  { value: 'critical', label: 'Critical' },
];

const STATUS_STYLES = {
  ready: 'bg-green-100 text-green-700',
  suggested_service: 'bg-blue-100 text-blue-700',
  manual_review: 'bg-amber-100 text-amber-700',
  missing_price: 'bg-orange-100 text-orange-700',
};

const STATUS_LABELS = {
  ready: 'Ready',
  suggested_service: 'Suggested Service Review',
  manual_review: 'Manual Review Required',
  missing_price: 'Missing Price',
};

export default function ManualTemplateTestDialog({ open, onClose }) {
  const [form, setForm] = useState({
    inspection_section: '',
    deficiency_type: '',
    failed_question_text: '',
    finding_title: '',
    finding_description: '',
    severity: '',
  });
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleRun = async () => {
    if (!form.deficiency_type && !form.finding_title) {
      toast.error('Deficiency type or finding title is required');
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const response = await base44.functions.invoke('lookupRepairRecommendation', form);
      if (response.data?.status === 'error') {
        toast.error(response.data.error || 'Lookup failed');
      } else {
        setResult(response.data);
        if (response.data.matched) {
          toast.success(`Matched: ${response.data.template_name}`);
        } else {
          toast.warning('No matching template found');
        }
      }
    } catch (e) {
      toast.error('Test failed: ' + (e.message || 'Unknown error'));
    }
    setTesting(false);
  };

  const handleClose = () => {
    onClose();
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !testing) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-accent" /> Test Template Match
          </DialogTitle>
        </DialogHeader>

        {/* Input form */}
        <div className="space-y-3 flex-shrink-0">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium">Inspection Section</Label>
              <Input
                value={form.inspection_section}
                onChange={e => update('inspection_section', e.target.value)}
                placeholder="e.g. exterior"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Deficiency Type</Label>
              <Input
                value={form.deficiency_type}
                onChange={e => update('deficiency_type', e.target.value)}
                placeholder="e.g. cracked_crown"
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium">Failed Question Text</Label>
            <Textarea
              value={form.failed_question_text}
              onChange={e => update('failed_question_text', e.target.value)}
              placeholder="The full text of the failed inspection question..."
              rows={2}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Finding Title</Label>
            <Input
              value={form.finding_title}
              onChange={e => update('finding_title', e.target.value)}
              placeholder="e.g. Cracked chimney crown"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Finding Description</Label>
            <Textarea
              value={form.finding_description}
              onChange={e => update('finding_description', e.target.value)}
              placeholder="Description from the inspection finding..."
              rows={2}
              className="mt-1"
            />
          </div>
          <div className="w-48">
            <Label className="text-sm font-medium">Severity</Label>
            <Select value={form.severity || 'any'} onValueChange={v => update('severity', v === 'any' ? '' : v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEVERITIES.map(s => (
                  <SelectItem key={s.value || 'any'} value={s.value || 'any'}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleRun} disabled={testing} className="gap-1.5">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
            Run Match Test
          </Button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto space-y-3">
          {result && (
            <>
              {result.matched ? (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <span className="font-semibold">{result.template_name}</span>
                      </div>
                      <Badge className={STATUS_STYLES[result.expected_estimate_status] || 'bg-gray-100'}>
                        {STATUS_LABELS[result.expected_estimate_status] || result.expected_estimate_status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <DiagRow label="Confidence" value={`${result.confidence_score}%`} />
                      <DiagRow label="Template ID" value={result.template_id} />
                    </div>

                    {result.matched_keywords?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {result.matched_keywords.map((kw, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">{kw}</Badge>
                        ))}
                      </div>
                    )}

                    {result.recommendation_content?.customer_summary && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Customer Summary</p>
                        <p className="text-xs">{result.recommendation_content.customer_summary}</p>
                      </div>
                    )}
                    {result.recommendation_content?.recommended_solution && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Recommended Solution</p>
                        <p className="text-xs">{result.recommendation_content.recommended_solution}</p>
                      </div>
                    )}

                    {result.service_mapping && (
                      <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-xs">
                        <span className="font-medium text-blue-800">Service: </span>
                        <span className="text-blue-700">{result.service_mapping.service_name}</span>
                        {result.service_mapping.default_selling_price > 0 && (
                          <span className="text-blue-700 ml-2">${result.service_mapping.default_selling_price.toFixed(2)}</span>
                        )}
                      </div>
                    )}

                    {result.material_mapping && (
                      <div className="text-xs space-y-1">
                        <p className="font-semibold text-muted-foreground uppercase">Materials</p>
                        {result.material_mapping.default?.map((m, i) => (
                          <div key={`d${i}`} className="text-muted-foreground">
                            • {m.material_name} (×{m.quantity}, ${m.unit_price}{m.chargeable_to_customer ? '' : ' internal'})
                          </div>
                        ))}
                        {result.material_mapping.internal?.map((m, i) => (
                          <div key={`i${i}`} className="text-muted-foreground">
                            • {m.material_name} (×{m.quantity}, internal)
                          </div>
                        ))}
                        {result.material_mapping.default?.length === 0 && result.material_mapping.internal?.length === 0 && (
                          <p className="text-muted-foreground italic">No materials configured</p>
                        )}
                      </div>
                    )}

                    {result.all_matches?.length > 1 && (
                      <div className="text-xs">
                        <p className="font-semibold text-amber-700 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {result.all_matches.length} competing matches:
                        </p>
                        {result.all_matches.map((m, i) => (
                          <div key={i} className="text-muted-foreground">
                            {m.template_name} — score {m.score} ({m.confidence}%)
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card><CardContent className="p-6 text-center">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                  <p className="font-medium">No matching template found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Configure a template with matching deficiency type or keywords.
                  </p>
                </CardContent></Card>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 border-t pt-4">
          <Button variant="outline" onClick={handleClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiagRow({ label, value }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}