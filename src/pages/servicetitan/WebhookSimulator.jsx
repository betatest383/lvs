import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Play, Upload, CheckCircle2, AlertTriangle, ArrowRight, Workflow,
  LayoutDashboard, Bell, RefreshCw, FileText, Truck, Link2, Sparkles,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { SAMPLE_PAYLOADS } from "@/lib/servicetitanSamplePayloads";

export default function WebhookSimulator() {
  const [selectedType, setSelectedType] = useState('transfer_sheet_created');
  const [payloadText, setPayloadText] = useState('');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleLoadSample = () => {
    const sample = SAMPLE_PAYLOADS[selectedType];
    if (sample) {
      setPayloadText(JSON.stringify(sample.payload, null, 2));
      setError(null);
    }
  };

  const handleExecute = async () => {
    setExecuting(true);
    setResult(null);
    setError(null);
    try {
      let parsed;
      try {
        parsed = JSON.parse(payloadText);
      } catch (e) {
        setError('Invalid JSON: ' + e.message);
        setExecuting(false);
        return;
      }
      const response = await base44.functions.invoke('simulateWebhookEvent', {
        event_type: selectedType,
        payload: parsed,
      });
      setResult(response.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Webhook Simulator</h1>
        <p className="text-muted-foreground text-sm">Test LVC OS workflows without waiting for live ServiceTitan webhooks</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Event Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">Event Type</Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SAMPLE_PAYLOADS).map(([key, val]) => (
                      <SelectItem key={key} value={key}>{val.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={handleLoadSample} className="w-full">
                <Upload className="h-4 w-4 mr-2" /> Load Saved Sample Payload
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">JSON Payload</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                placeholder='Paste JSON payload here, or click "Load Saved Sample Payload" above...'
                className="font-mono text-xs min-h-[300px]"
              />
              <Button onClick={handleExecute} disabled={executing || !payloadText.trim()} className="w-full">
                {executing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                {executing ? 'Executing...' : 'Execute Event'}
              </Button>
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                  <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="space-y-4">
          {!result && !error && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Play className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Execute an event to see results — parsed data, matching records, triggered workflows, dashboard updates, and notifications.</p>
              </CardContent>
            </Card>
          )}

          {result && (
            <>
              {/* Status Banner */}
              <Card className={result.status === 'Processed' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
                <CardContent className="p-4 flex items-center gap-3">
                  {result.status === 'Processed' ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {result.status === 'Processed' ? 'Event Processed Successfully' : 'Event Failed'}
                    </p>
                    <p className="text-xs text-muted-foreground">{result.summary || result.error}</p>
                  </div>
                  <Link to="/servicetitan/event-log">
                    <Button variant="outline" size="sm">
                      <FileText className="h-3.5 w-3.5 mr-1" /> {result.event_id}
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* Created/Updated Record */}
              {result.created_or_updated && (
                <ResultSection icon={Sparkles} title="Record Created/Updated" color="text-blue-600">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${result.created_or_updated.action === 'created' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      {result.created_or_updated.action}
                    </span>
                    <span className="font-medium">{result.created_or_updated.entity}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-xs">{result.created_or_updated.identifier}</span>
                  </div>
                </ResultSection>
              )}

              {/* Parsed Data */}
              {result.parsed_data && Object.keys(result.parsed_data).length > 0 && (
                <ResultSection icon={FileText} title="Parsed Data" color="text-indigo-600">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(result.parsed_data).filter(([, v]) => v != null && typeof v !== 'object').map(([key, val]) => (
                      <div key={key} className="flex justify-between gap-2 border-b border-border/50 py-1">
                        <span className="text-muted-foreground">{key.replace(/_/g, ' ')}:</span>
                        <span className="font-medium text-right truncate">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                  {result.parsed_data.items && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-muted-foreground">Items:</p>
                      {result.parsed_data.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs bg-muted/50 px-2 py-1 rounded">
                          <span>{item.name}</span>
                          <span className="text-muted-foreground">Qty: {item.quantity} — ${(item.cost || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </ResultSection>
              )}

              {/* Matching Records */}
              {result.matching_records && Object.keys(result.matching_records).length > 0 && (
                <ResultSection icon={Link2} title="Matching LVC OS Records" color="text-purple-600">
                  <div className="space-y-1.5 text-sm">
                    <MatchRow label="Truck" matched={result.matching_records.truck_matched} value={result.matching_records.truck_number || result.matching_records.truck_id} />
                    {result.matching_records.job_id && <MatchRow label="Job" matched={true} value={result.matching_records.job_id} />}
                    {result.matching_records.transfer_sheet_id && <MatchRow label="Transfer Sheet" matched={true} value="Linked" />}
                    {result.matching_records.po_id && <MatchRow label="Purchase Order" matched={true} value="Linked" />}
                  </div>
                </ResultSection>
              )}

              {/* Triggered Workflows */}
              {result.triggered_workflows?.length > 0 && (
                <ResultSection icon={Workflow} title="Triggered Workflows" color="text-amber-600">
                  <div className="space-y-1">
                    {result.triggered_workflows.map((w, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm bg-amber-50 px-2 py-1.5 rounded">
                        <Workflow className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                </ResultSection>
              )}

              {/* Updated Dashboards */}
              {result.updated_dashboards?.length > 0 && (
                <ResultSection icon={LayoutDashboard} title="Updated Dashboards" color="text-blue-600">
                  <div className="flex flex-wrap gap-1.5">
                    {result.updated_dashboards.map((d, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs">
                        <LayoutDashboard className="h-3 w-3" /> {d}
                      </span>
                    ))}
                  </div>
                </ResultSection>
              )}

              {/* Notifications */}
              {result.notifications?.length > 0 && (
                <ResultSection icon={Bell} title="Notifications Generated" color="text-orange-600">
                  <div className="space-y-1">
                    {result.notifications.map((n, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm bg-orange-50 px-2 py-1.5 rounded">
                        <Bell className="h-3.5 w-3.5 text-orange-600 flex-shrink-0 mt-0.5" />
                        <span>{n}</span>
                      </div>
                    ))}
                  </div>
                </ResultSection>
              )}

              {/* Errors */}
              {result.error && (
                <ResultSection icon={AlertTriangle} title="Errors" color="text-red-600">
                  <p className="text-sm text-red-700 font-mono bg-red-50 px-2 py-1.5 rounded">{result.error}</p>
                </ResultSection>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultSection({ icon: Icon, title, color, children }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className={`text-sm flex items-center gap-2 ${color}`}>
          <Icon className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function MatchRow({ label, matched, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground text-xs">{label}:</span>
      <div className="flex items-center gap-1.5">
        {matched ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        )}
        <span className="text-xs font-medium">{matched ? value || 'Matched' : 'No match'}</span>
      </div>
    </div>
  );
}