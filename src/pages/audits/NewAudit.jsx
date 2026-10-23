import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import {
  CheckCircle2, XCircle, MinusCircle, AlertTriangle, Camera, Loader2, PenTool,
} from 'lucide-react';
import {
  parseSections, calculateScore, buildChecklistResults, generateAuditNumber,
  getScoreColor,
} from '@/lib/auditConstants';
import SignaturePad from '@/components/warehouse/SignaturePad';

function ResultButton({ result, current, onClick, icon: Icon, color, label }) {
  const isActive = current === result;
  return (
    <button
      onClick={() => onClick(result)}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
        isActive ? `${color} ring-1 ring-offset-1` : 'bg-muted text-muted-foreground hover:bg-muted/80'
      }`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

export default function NewAudit() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [user, setUser] = useState(null);
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [auditInfo, setAuditInfo] = useState({});
  const [sections, setSections] = useState([]);
  const [results, setResults] = useState({});
  const [generalComments, setGeneralComments] = useState('');
  const [signature, setSignature] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState(null);

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      setAuditInfo((p) => ({
        ...p,
        auditor: u?.full_name || '',
        auditor_email: u?.email || '',
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      }));
    }).catch(() => {});
    base44.entities.AuditTemplate.filter({ status: 'Active' }).then(setTemplates).catch(() => {});
  }, []);

  const selectTemplate = (tpl) => {
    setSelectedTemplate(tpl);
    const parsed = parseSections(tpl.sections);
    setSections(parsed);
    const init = {};
    parsed.forEach((sec, sIdx) => {
      (sec.items || []).forEach((_, iIdx) => {
        init[`${sIdx}-${iIdx}`] = { result: null, comments: '', photos: [] };
      });
    });
    setResults(init);
    setAuditInfo((p) => ({
      ...p,
      audit_template_id: tpl.id,
      audit_template_name: tpl.audit_name,
      related_sop: tpl.related_sop || '',
      related_business_process: tpl.related_business_process || '',
      department: tpl.department || '',
    }));
    setStep(2);
  };

  const setResult = (key, result) => setResults((p) => ({ ...p, [key]: { ...p[key], result: p[key]?.result === result ? null : result } }));
  const setComments = (key, comments) => setResults((p) => ({ ...p, [key]: { ...p[key], comments } }));

  const handlePhotoUpload = async (key, files) => {
    if (!files.length) return;
    setUploadingIdx(key);
    try {
      const urls = [];
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        urls.push(file_url);
      }
      setResults((p) => ({ ...p, [key]: { ...p[key], photos: [...(p[key]?.photos || []), ...urls] } }));
    } catch (e) { console.error(e); }
    setUploadingIdx(null);
  };

  const score = calculateScore(sections, results);
  const scoreColor = getScoreColor(score.passPercentage);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const auditNumber = await generateAuditNumber();
      const checklistResults = buildChecklistResults(sections, results);
      const allPhotos = Object.values(results).flatMap((r) => r.photos || []);
      await base44.entities.ManagementAudit.create({
        ...auditInfo,
        audit_number: auditNumber,
        checklist_results: JSON.stringify(checklistResults),
        photos: allPhotos,
        comments: generalComments,
        overall_score: score.overallScore,
        pass_percentage: score.passPercentage,
        failed_items: score.failedItems,
        critical_failures: score.criticalFailures,
        status: 'Completed',
        digital_signature: signature || '',
        signed_by: user?.full_name || '',
        role: user?.role || '',
      });
      // TODO: Notify employee, manager, operations manager
      navigate('/audits/completed');
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const inputClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

  // Step 1: Template selection + audit info
  if (step === 1) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Audit</h1>
          <p className="text-muted-foreground text-sm">Select a template and fill in audit details</p>
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Select Audit Template</CardTitle></CardHeader>
          <CardContent>
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No active templates. Create one first.</p>
            ) : (
              <div className="space-y-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTemplate(t)}
                    className="w-full text-left rounded-lg border border-border p-3 hover:bg-accent/5 hover:border-accent transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{t.audit_name}</p>
                        <p className="text-xs text-muted-foreground">{t.audit_id} · {t.department} · {t.audit_frequency}</p>
                      </div>
                      {t.related_sop && <span className="text-xs font-mono text-muted-foreground">{t.related_sop}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedTemplate && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Audit Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Employee *</Label>
                  <Input value={auditInfo.employee || ''} onChange={(e) => setAuditInfo((p) => ({ ...p, employee: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Employee Email</Label>
                  <Input value={auditInfo.employee_email || ''} onChange={(e) => setAuditInfo((p) => ({ ...p, employee_email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Date</Label>
                  <input type="date" className={inputClass} value={auditInfo.date || ''} onChange={(e) => setAuditInfo((p) => ({ ...p, date: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Time</Label>
                  <Input value={auditInfo.time || ''} onChange={(e) => setAuditInfo((p) => ({ ...p, time: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Location</Label>
                  <Input value={auditInfo.location || ''} onChange={(e) => setAuditInfo((p) => ({ ...p, location: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Truck Number</Label>
                  <Input value={auditInfo.truck_number || ''} onChange={(e) => setAuditInfo((p) => ({ ...p, truck_number: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Job Number</Label>
                  <Input value={auditInfo.job_number || ''} onChange={(e) => setAuditInfo((p) => ({ ...p, job_number: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Related Workflow</Label>
                  <Input value={auditInfo.related_workflow || ''} onChange={(e) => setAuditInfo((p) => ({ ...p, related_workflow: e.target.value }))} />
                </div>
              </div>
              <Button onClick={() => setStep(2)} disabled={!auditInfo.employee?.trim()} className="w-full">
                Start Audit →
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Step 2: Perform audit
  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Performing Audit</h1>
          <p className="text-muted-foreground text-sm">{selectedTemplate.audit_name} · {auditInfo.employee}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setStep(1)}>← Back</Button>
      </div>

      {/* Live Score Bar */}
      <Card className={`sticky top-0 z-10 ${score.criticalFailures > 0 ? 'border-red-300' : ''}`}>
        <CardContent className="p-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Pass Rate</p>
              <p className={`text-2xl font-bold ${scoreColor.text}`}>{score.passPercentage}%</p>
            </div>
            <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
              <div className={`h-full ${scoreColor.bg}`} style={{ width: `${score.passPercentage}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Failed</p>
              <p className="font-bold text-red-600">{score.failedItems}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Critical</p>
              <p className="font-bold text-red-700">{score.criticalFailures}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sections */}
      {sections.map((section, sIdx) => (
        <Card key={sIdx}>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">{section.name}</h3>
            <div className="space-y-3">
              {(section.items || []).map((item, iIdx) => {
                const key = `${sIdx}-${iIdx}`;
                const r = results[key] || { result: null, comments: '', photos: [] };
                const isCritical = r.result === 'fail' && item.required;
                return (
                  <div key={iIdx} className={`rounded-lg border p-3 ${isCritical ? 'border-red-300 bg-red-50/50 ring-1 ring-red-200' : 'border-border'}`}>
                    {isCritical && (
                      <div className="flex items-center gap-1 text-xs text-red-700 font-semibold mb-2">
                        <AlertTriangle className="w-3.5 h-3.5" /> CRITICAL FAILURE — Required Item
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-medium flex-1">{item.description}</p>
                      <span className="text-xs text-muted-foreground shrink-0">Weight: {item.weight}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <ResultButton result="pass" current={r.result} onClick={(v) => setResult(key, v)} icon={CheckCircle2} color="bg-green-100 text-green-700" label="Pass" />
                      <ResultButton result="fail" current={r.result} onClick={(v) => setResult(key, v)} icon={XCircle} color="bg-red-100 text-red-700" label="Fail" />
                      <ResultButton result="na" current={r.result} onClick={(v) => setResult(key, v)} icon={MinusCircle} color="bg-gray-100 text-gray-700" label="N/A" />
                      {item.photo_required && (
                        <span className="flex items-center gap-1 text-xs text-yellow-600 ml-auto">
                          <Camera className="w-3.5 h-3.5" /> Photo Required
                        </span>
                      )}
                    </div>
                    <Input
                      value={r.comments}
                      onChange={(e) => setComments(key, e.target.value)}
                      placeholder="Comments (optional)..."
                      className="text-sm mb-2"
                    />
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-input text-xs cursor-pointer hover:bg-accent/10">
                        {uploadingIdx === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                        <span>Add Photo</span>
                        <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(key, Array.from(e.target.files))} disabled={uploadingIdx === key} />
                      </label>
                      {r.photos?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {r.photos.map((url, pi) => (
                            <img key={pi} src={url} alt="Audit" className="w-12 h-12 rounded-md object-cover" />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Comments + Signature */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">General Comments</Label>
            <Textarea value={generalComments} onChange={(e) => setGeneralComments(e.target.value)} rows={3} placeholder="Overall audit comments..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><PenTool className="w-3.5 h-3.5" /> Digital Signature</Label>
            <SignaturePad onSave={(url) => setSignature(url)} />
            {signature && <img src={signature} alt="Signature" className="max-h-16 mt-1" />}
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-2 pb-4">
        <Button variant="outline" onClick={() => navigate('/audits')}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? 'Submitting...' : 'Complete Audit'}
        </Button>
      </div>
    </div>
  );
}