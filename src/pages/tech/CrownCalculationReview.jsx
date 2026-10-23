import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  ArrowLeft, Settings as SettingsIcon, CheckCircle2, AlertTriangle, Lock,
  PackageCheck, Calendar, User, MapPin, Wrench, Building2, AlertCircle,
} from 'lucide-react';
import CrownCalculationResults from '@/components/crown/CrownCalculationResults';
import CrownSettingsPanel from '@/components/crown/CrownSettingsPanel';
import InspectionAnswersDisplay from '@/components/crown/InspectionAnswersDisplay';
import { runFullCalculation, DEFAULT_CROWN_SETTINGS } from '@/lib/crownCalculationEngine';
import { CROWN_QUESTION_IDS, extractCrownMeasurements } from '@/lib/crownQuestionIds';

const STATUS_CONFIG = {
  draft: { label: 'Draft', variant: 'secondary', icon: null },
  confirmed: { label: 'Confirmed', variant: 'default', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  outdated: { label: 'Outdated — Recalculate', variant: 'destructive', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  locked: { label: 'Locked (Proposal)', variant: 'outline', icon: <Lock className="w-3.5 h-3.5" /> },
  missing_measurements: { label: 'Missing Measurements', variant: 'destructive', icon: <AlertCircle className="w-3.5 h-3.5" /> },
};

export default function CrownCalculationReview() {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [job, setJob] = useState(null);
  const [existingCalc, setExistingCalc] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_CROWN_SETTINGS);
  const [repairTemplate, setRepairTemplate] = useState(null);
  const [propertyAssets, setPropertyAssets] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [inspectionAnswers, setInspectionAnswers] = useState(null);
  const [measurements, setMeasurements] = useState(null);
  const [missingMeasurements, setMissingMeasurements] = useState([]);

  useEffect(() => { loadAll(); }, [jobId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [jobData, settingsList, existingCalcs, assets] = await Promise.all([
        base44.entities.Job.get(jobId).catch(() => null),
        base44.entities.CrownCalculationSettings.list().catch(() => []),
        base44.entities.CrownCalculation.filter({ job_id: jobId }).catch(() => []),
        base44.entities.PropertyAsset.filter({ job_id: jobId }).catch(() => []),
      ]);

      setJob(jobData);
      if (settingsList?.length > 0) setSettings(settingsList[0]);
      if (assets?.length > 0) setPropertyAssets(assets);

      const existing = existingCalcs?.[0] || null;
      setExistingCalc(existing);
      if (existing) setSelectedAssetId(existing.property_asset_id || '');
      if (assets?.length === 1 && !existing) setSelectedAssetId(assets[0].id);

      // Load inspection submissions and merge answers
      const submissions = await base44.entities.InspectionSubmission
        .filter({ job_id: jobId, status: 'submitted' }).catch(() => []);

      const mergedAnswers = {};
      for (const sub of submissions) {
        let subAnswers = {};
        try { subAnswers = JSON.parse(sub.answers || '{}'); } catch {}
        for (const [key, val] of Object.entries(subAnswers)) {
          if (key.startsWith('__')) continue;
          if (mergedAnswers[key] === undefined || mergedAnswers[key] === '') {
            mergedAnswers[key] = val;
          }
        }
      }

      // Extract crown measurements from inspection answers
      const extracted = extractCrownMeasurements(mergedAnswers);
      setInspectionAnswers({
        crown_measurements: mergedAnswers[CROWN_QUESTION_IDS.crown_measurements] || '',
        flue_measurements: mergedAnswers[CROWN_QUESTION_IDS.flue_measurements] || '',
        brick_courses: mergedAnswers[CROWN_QUESTION_IDS.brick_courses] || '',
        crown_step_in: mergedAnswers[CROWN_QUESTION_IDS.crown_step_in] || '',
        crown_cracks: mergedAnswers[CROWN_QUESTION_IDS.crown_cracks] || '',
        repair_method: mergedAnswers[CROWN_QUESTION_IDS.repair_method] || '',
      });

      if (existing) {
        // Use stored values from CrownCalculation record, fall back to extracted
        let flues = [];
        try { flues = JSON.parse(existing.flues_json || '[]'); } catch {}
        setMeasurements({
          crown_form_length: existing.crown_form_length || extracted.measurements.crown_form_length,
          crown_form_width: existing.crown_form_width || extracted.measurements.crown_form_width,
          flues: flues.length > 0 ? flues : extracted.measurements.flues,
          removing_brick_courses: existing.removing_brick_courses ?? extracted.measurements.removing_brick_courses,
          crown_step_in: existing.crown_step_in ?? extracted.measurements.crown_step_in,
        });
        try {
          setMissingMeasurements(existing.missing_measurements_json
            ? JSON.parse(existing.missing_measurements_json)
            : extracted.missing);
        } catch { setMissingMeasurements(extracted.missing); }
      } else {
        setMeasurements(extracted.measurements);
        setMissingMeasurements(extracted.missing);
      }

      // Find crown repair template
      const templates = await base44.entities.RepairRecommendationTemplate.filter({}).catch(() => []);
      const crownTemplate = templates.find(t => t.material_calculation_type === 'crown_concrete_replacement')
        || templates.find(t => (t.template_name || '').toLowerCase().includes('concrete crown'));
      if (crownTemplate) setRepairTemplate(crownTemplate);
    } catch (err) {
      toast.error('Failed to load: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Live calculation from extracted measurements (read-only, no editing)
  const calc = useMemo(() => {
    if (!measurements?.crown_form_length || !measurements?.crown_form_width) return null;
    return runFullCalculation(measurements, settings);
  }, [measurements, settings]);

  const isLocked = existingCalc?.status === 'locked';
  const isMissingMeasurements = existingCalc?.status === 'missing_measurements'
    || (missingMeasurements.length > 0 && !existingCalc);
  const currentStatus = isLocked ? 'locked'
    : (isMissingMeasurements ? 'missing_measurements'
    : (existingCalc?.status || 'draft'));

  const handleConfirm = async (pushMaterials = false) => {
    if (!measurements?.crown_form_length || !measurements?.crown_form_width) {
      toast.error('Crown measurements are missing from the inspection. Complete the inspection first.');
      return;
    }
    setSaving(true);
    try {
      const selectedAsset = propertyAssets.find(a => a.id === selectedAssetId);
      const res = await base44.functions.invoke('calculateCrownMaterials', {
        job_id: jobId,
        measurements,
        crown_calculation_id: existingCalc?.id,
        repair_template_id: repairTemplate?.id,
        property_asset_id: selectedAssetId,
        property_asset_name: selectedAsset?.asset_name || '',
        push_materials: pushMaterials,
      });

      if (res.data?.error) {
        toast.error(res.data.error);
        return;
      }

      setExistingCalc(res.data?.calculation);
      if (pushMaterials && res.data?.materials_pushed) {
        const mp = res.data.materials_pushed;
        toast.success(`Calculation confirmed. Materials pushed to ${mp.items_updated > 0 ? 'estimate item' : 'new estimate item'}.`);
      } else {
        toast.success('Calculation confirmed and saved');
      }
      loadAll();
    } catch (err) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReturnToInspection = () => {
    navigate(`/tech/job-hub/${jobId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  const customerAddress = job ? [job.address, job.city, job.state, job.zip].filter(Boolean).join(', ') : '';
  const technician = job?.lead_technician_name || job?.technician_name || job?.lead_technician_email || '';
  const statusCfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.draft;

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Crown Calculation</h1>
            <p className="text-sm text-muted-foreground">Install New Concrete Crown — Inspection-Driven</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusCfg.variant} className="gap-1">
            {statusCfg.icon}
            {statusCfg.label}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="gap-1.5">
            <SettingsIcon className="w-4 h-4" /> Settings
          </Button>
        </div>
      </div>

      {/* Job Info (auto-populated, read-only) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Job Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <InfoItem icon={<Calendar className="w-4 h-4" />} label="Date" value={job?.service_date ? new Date(job.service_date).toLocaleDateString() : new Date().toLocaleDateString()} />
          <InfoItem icon={<User className="w-4 h-4" />} label="Customer" value={job?.customer_name} />
          <InfoItem icon={<MapPin className="w-4 h-4" />} label="Address" value={customerAddress} />
          <InfoItem icon={<Wrench className="w-4 h-4" />} label="Technician" value={technician} />
          <InfoItem icon={<Building2 className="w-4 h-4" />} label="Job ID" value={jobId} />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="w-4 h-4" /> Property Asset / Chimney</Label>
            {propertyAssets.length > 0 ? (
              <Select value={selectedAssetId} onValueChange={setSelectedAssetId} disabled={isLocked}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select asset..." /></SelectTrigger>
                <SelectContent>
                  {propertyAssets.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.asset_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">No assets found</p>
            )}
          </div>
        </CardContent>
      </Card>

      {repairTemplate && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
          <Badge variant="outline" className="text-xs">Repair Template</Badge>
          <span>{repairTemplate.template_name}</span>
          <Badge variant="secondary" className="text-xs">Calculation: {repairTemplate.material_calculation_type}</Badge>
        </div>
      )}

      {/* Missing Measurements Warning */}
      {isMissingMeasurements && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-sm font-medium text-red-900">
                {missingMeasurements.length} measurement(s) missing from inspection
              </p>
            </div>
            <p className="text-xs text-red-700 mb-2">
              Complete these inspection questions to enable the Crown Calculation. No zero-value materials will be created.
            </p>
            <div className="space-y-1">
              {missingMeasurements.map((m, i) => (
                <div key={i} className="flex items-center justify-between gap-2 bg-white/60 rounded px-2 py-1">
                  <span className="text-xs text-red-800">{m.label}</span>
                  <Button size="sm" variant="outline" onClick={handleReturnToInspection} className="gap-1 h-7 text-xs">
                    <ArrowLeft className="w-3 h-3" /> Return to Inspection
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Locked Warning */}
      {isLocked && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="flex items-center gap-3 py-3">
            <Lock className="w-5 h-5 text-red-600" />
            <p className="text-sm font-medium text-red-900">This calculation is locked because it's linked to a presented or accepted proposal.</p>
          </CardContent>
        </Card>
      )}

      {/* Inspection Answers (Read-Only Review) */}
      {inspectionAnswers && (
        <InspectionAnswersDisplay
          answers={inspectionAnswers}
          measurements={measurements}
          missing={missingMeasurements}
          onReturnToInspection={handleReturnToInspection}
        />
      )}

      {/* Calculated Results */}
      {calc ? (
        <div>
          <h2 className="text-sm font-semibold mb-2 px-1">Calculated Outputs</h2>
          <CrownCalculationResults
            calc={{ ...calc, flue_count: measurements?.flues?.length || 0 }}
            removingBrickCourses={measurements?.removing_brick_courses}
            crownStepIn={measurements?.crown_step_in}
          />
        </div>
      ) : !isMissingMeasurements && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Waiting for crown measurements from inspection.
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      {!isLocked && !isMissingMeasurements && calc && (
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={() => handleConfirm(false)} disabled={saving} variant="outline" className="gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> {saving ? 'Saving...' : 'Confirm Calculation'}
          </Button>
          <Button onClick={() => handleConfirm(true)} disabled={saving} className="gap-1.5">
            <PackageCheck className="w-4 h-4" /> {saving ? 'Saving...' : 'Confirm & Push Materials'}
          </Button>
        </div>
      )}

      {existingCalc?.materials_pushed && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Materials pushed to estimate {existingCalc.materials_pushed_at ? `on ${new Date(existingCalc.materials_pushed_at).toLocaleString()}` : ''}
        </p>
      )}

      <CrownSettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSaved={(s) => setSettings(s)}
      />
    </div>
  );
}

function InfoItem({ icon, label, value }) {
  return (
    <div className="space-y-0.5">
      <Label className="text-xs text-muted-foreground flex items-center gap-1">{icon} {label}</Label>
      <p className="text-sm font-medium truncate">{value || '—'}</p>
    </div>
  );
}