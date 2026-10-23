import { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileCheck, ArrowRight, Wrench, Mountain, ClipboardList, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';
import ProjectScheduleSection, {
  durationToDays, ensureDailyPlans, computeLaborFromSchedule,
} from '@/components/jobhub/ProjectScheduleSection';
import EquipmentCategoryPicker from '@/components/jobhub/scope/EquipmentCategoryPicker';
import RoofPitchSelector from '@/components/jobhub/scope/RoofPitchSelector';
import ScaffoldFormDialog, { isScaffoldFormComplete } from '@/components/jobhub/scope/ScaffoldFormDialog';
import LiftFormDialog, { isLiftFormComplete } from '@/components/jobhub/scope/LiftFormDialog';
import { isScaffoldSelected, isLiftSelected } from '@/components/jobhub/scope/scopeConstants';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';
import {
  toStorageSchedule, aggregateDailySchedule, deriveScheduleTotals,
} from '@/lib/dailyLabor';

const ACCESS_DIFFICULTY = [
  { value: 'easy', label: 'Easy' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'difficult', label: 'Difficult' },
  { value: 'very_difficult', label: 'Very Difficult' },
];

const WEATHER_SENSITIVITY = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

// Materials are confirmed in Recommendation Review and travel with the draft
// estimate item. Scope of Work consumes the rolled-up result; it never asks the
// technician to enter the same materials a second time.
function rollUpPackageMaterials(items) {
  const byMaterialId = new Map();
  for (const item of items) {
    let materials = [];
    try { materials = typeof item.materials === 'string' ? JSON.parse(item.materials || '[]') : (item.materials || []); } catch {}
    for (const material of Array.isArray(materials) ? materials : []) {
      const materialId = material.material_id || material.inventory_master_id || material.id || '';
      const quantity = Number(material.quantity || 0);
      if (!materialId || quantity <= 0) continue;
      const key = String(materialId);
      const existing = byMaterialId.get(key);
      if (existing) {
        existing.quantity += quantity;
      } else {
        byMaterialId.set(key, {
          material_id: materialId,
          inventory_master_id: materialId,
          material_name: material.item_name || material.material_name || material.name || 'Material',
          item_name: material.item_name || material.material_name || material.name || 'Material',
          sku: material.sku || '',
          quantity,
          unit: material.unit || 'ea',
          unit_cost: Number(material.unit_cost || material.purchase_cost || 0),
          source_estimate_item_ids: [item.id],
        });
      }
    }
  }
  return Array.from(byMaterialId.values());
}

/**
 * Initialize scope data for a repair recommendation from its template defaults.
 */
function initScopeData(rec) {
  const initHours = rec.estimated_time_hours || 0;
  const initCrew = rec.crew_size_required || 1;
  return {
    // Project Schedule
    project_duration: initHours > 0 && initHours < 8 ? 'less_than_one_day' : '1_day',
    custom_days: null,
    estimated_hours: initHours > 0 && initHours < 8 ? initHours : null,
    daily_plans: [{
      day_number: 1,
      work_activities: [],
      work_notes: '',
      lead_technicians: 1,
      apprentices: Math.max(0, initCrew - 1),
      masons: 0,
      staging_sequence: '',
      crew_hours: (initHours > 0 && initHours < 8) ? initHours : 8,
    }],
    // Equipment
    equipment_items: [],
    scaffold_form: null,
    lift_form: null,
    // Job Conditions
    roof_pitch_options: [],
    chimney_height: '',
    access_difficulty: 'moderate',
    parking_truck_access: '',
    interior_protection_required: false,
    weather_sensitivity: 'none',
    safety_concerns: '',
    customer_constraints: '',
    // Internal Instructions
    staging_notes: '',
    safety_notes: '',
    cleanup_requirements: '',
    technician_notes: '',
  };
}

function ScopeItemEditor({ rec, data, onUpdate }) {
  const set = (field, value) => onUpdate(rec.id, { [field]: value });
  const [scaffoldOpen, setScaffoldOpen] = useState(false);
  const [liftOpen, setLiftOpen] = useState(false);

  const equipmentItems = data.equipment_items || [];
  const needsScaffoldForm = isScaffoldSelected(equipmentItems);
  const needsLiftForm = isLiftSelected(equipmentItems);
  const scaffoldComplete = isScaffoldFormComplete(data.scaffold_form);
  const liftComplete = isLiftFormComplete(data.lift_form);

  return (
    <Card className="border-l-4 border-l-accent">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">{rec.service_name || rec.recommendation_title || rec.title || 'Service'}</p>
            {rec.service_code && <Badge variant="outline" className="text-[10px] mt-1">{rec.service_code}</Badge>}
          </div>
        </div>

        {/* Project Schedule Section (replaces Labor) */}
        <ProjectScheduleSection data={data} onUpdate={updates => onUpdate(rec.id, updates)} equipmentItems={equipmentItems} />

        {/* Equipment Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
            <Wrench className="w-3.5 h-3.5" /> Equipment
          </div>
          <EquipmentCategoryPicker
            selected={equipmentItems}
            onChange={items => set('equipment_items', items)}
          />
          {/* Scaffold Form Trigger */}
          {needsScaffoldForm && (
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="text-xs gap-1" onClick={() => setScaffoldOpen(true)}>
                {scaffoldComplete ? '✓ Scaffold Form' : '⚠ Scaffold Form Required'}
              </Button>
              {!scaffoldComplete && <span className="text-[10px] text-amber-600">Required — form must be completed</span>}
            </div>
          )}
          {/* Lift Form Trigger */}
          {needsLiftForm && (
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="text-xs gap-1" onClick={() => setLiftOpen(true)}>
                {liftComplete ? '✓ Lift Form' : '⚠ Lift Form Required'}
              </Button>
              {!liftComplete && <span className="text-[10px] text-amber-600">Required — form must be completed</span>}
            </div>
          )}
          <ScaffoldFormDialog
            open={scaffoldOpen}
            onClose={() => setScaffoldOpen(false)}
            data={data.scaffold_form}
            onUpdate={updates => set('scaffold_form', { ...(data.scaffold_form || {}), ...updates })}
          />
          <LiftFormDialog
            open={liftOpen}
            onClose={() => setLiftOpen(false)}
            data={data.lift_form}
            onUpdate={updates => set('lift_form', { ...(data.lift_form || {}), ...updates })}
          />
        </div>

        {/* Job Conditions */}
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
            <Mountain className="w-3.5 h-3.5" /> Job Conditions
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="col-span-2 sm:col-span-1">
              <RoofPitchSelector
                selected={data.roof_pitch_options || []}
                onChange={vals => set('roof_pitch_options', vals)}
              />
            </div>
            <div>
              <Label className="text-xs">Chimney Height</Label>
              <Input value={data.chimney_height || ''} placeholder="e.g. 25ft"
                onChange={e => set('chimney_height', e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Access Difficulty</Label>
              <Select value={data.access_difficulty} onValueChange={v => set('access_difficulty', v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCESS_DIFFICULTY.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Parking / Truck Access</Label>
              <Input value={data.parking_truck_access || ''} placeholder="e.g. Driveway"
                onChange={e => set('parking_truck_access', e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Weather Sensitivity</Label>
              <Select value={data.weather_sensitivity} onValueChange={v => set('weather_sensitivity', v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEATHER_SENSITIVITY.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5 pt-5">
              <Switch checked={!!data.interior_protection_required} onCheckedChange={v => set('interior_protection_required', v)} />
              <Label className="text-xs">Interior Protection</Label>
            </div>
          </div>
          <Textarea value={data.safety_concerns || ''} placeholder="Safety concerns..."
            onChange={e => set('safety_concerns', e.target.value)} rows={1} className="text-sm" />
          <Textarea value={data.customer_constraints || ''} placeholder="Customer constraints..."
            onChange={e => set('customer_constraints', e.target.value)} rows={1} className="text-sm" />
        </div>

        {/* Internal Instructions */}
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
            <ClipboardList className="w-3.5 h-3.5" /> Internal Instructions
          </div>
          <div className="space-y-1">
            <Textarea value={data.safety_notes || ''} placeholder="Safety notes..."
              onChange={e => set('safety_notes', e.target.value)} rows={1} className="text-sm" />
            <Textarea value={data.cleanup_requirements || ''} placeholder="Cleanup requirements..."
              onChange={e => set('cleanup_requirements', e.target.value)} rows={1} className="text-sm" />
            <Textarea value={data.technician_notes || ''} placeholder="Technician notes..."
              onChange={e => set('technician_notes', e.target.value)} rows={1} className="text-sm" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * ScopeOfWorkBuilderDialog — collects operational details needed for dynamic pricing
 * BEFORE estimate generation. Saves to ScopeOfWork entity, then triggers estimate auto-build.
 *
 * Props:
 *   open: boolean
 *   jobId: string
 *   repairRecs: Array<RepairSystemRecommendation>
 *   estimate: Estimate | null
 *   onRefresh: () => Promise
 *   onClose: () => void
 *   onContinue: () => Promise  — called after scope is saved and estimate is auto-built
 */
export default function ScopeOfWorkBuilderDialog({
  open, jobId, repairRecs, estimate, onRefresh, onClose, onContinue,
  proposalOptionId, estimatePackageId,
}) {
  const { isDevToolsVisible } = useDeveloperMode();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scopeData, setScopeData] = useState({});
  const [existingScope, setExistingScope] = useState(null);
  const [scopeOptions, setScopeOptions] = useState([]);
  const [activeScopePackageId, setActiveScopePackageId] = useState(null);
  // Authoritative apprentice labor rate — sourced from LoadedLaborCost (the single
  // pricing configuration), never hardcoded. Fallback 0 until loaded.
  const [apprenticeLoadedRate, setApprenticeLoadedRate] = useState(0);

  useEffect(() => {
    if (!open || !jobId) return;
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      try {
        // Load the authoritative apprentice loaded rate from the pricing config
        // (LoadedLaborCost). This is the single source of truth for the apprentice
        // dollar rate — the backend calculatePricing reads the same entity.
        const laborCosts = await base44.entities.LoadedLaborCost.filter({ status: 'active' }).catch(() => []);
        const apprenticeRate = (laborCosts || []).find(l => (l.role || '').toLowerCase() === 'apprentice');
        if (!cancelled) setApprenticeLoadedRate(apprenticeRate?.loaded_hourly_cost || 0);

        // Load existing scope of work — one independent scope per proposal option.
        // When estimatePackageId / proposalOptionId is supplied, load the scope
        // bound to that option (immutable option relationship). Editing one option
        // never affects another; reopening repeatedly never creates duplicates.
        const [scopes, packages, draftItems] = await Promise.all([
          base44.entities.ScopeOfWork.filter({ job_id: jobId }).catch(() => []),
          base44.entities.EstimatePackage.filter({ job_id: jobId }).catch(() => []),
          base44.entities.DraftEstimateItem.filter({ job_id: jobId }).catch(() => []),
        ]);
        // The package is the Scope of Work owner. Build the three Good/Better/Best
        // tabs from the package's item relationship even before a scope exists.
        // Previously this derived option tabs from saved scope records, so a new job
        // fell back to five recommendation-level forms.
        const recommendationIdForItem = item =>
          item?.repair_system_recommendation_id ||
          item?.recommendation_review_item_id ||
          item?.repair_recommendation_id ||
          '';
        const optionScopes = packages
          .filter(pkg => pkg.is_authoritative !== false && ['good', 'better', 'best'].includes(pkg.option_type))
          .map(pkg => {
            const scope = scopes.find(item => item.estimate_package_id === pkg.id && item.status !== 'archived' && !item.superseded_by_id)
              || scopes.find(item => item.estimate_package_id === pkg.id && item.status !== 'archived');
            let itemIds = [];
            let traceableRecommendationIds = [];
            try { itemIds = JSON.parse(pkg.estimate_item_ids || '[]'); } catch {}
            try { traceableRecommendationIds = JSON.parse(pkg.traceable_recommendation_ids || '[]'); } catch {}
            const recommendationIds = [...new Set([
              ...draftItems.filter(item => itemIds.includes(item.id)).map(recommendationIdForItem),
              ...traceableRecommendationIds,
            ].filter(Boolean))];
            return { packageId: pkg.id, tier: pkg.option_type, scope, recommendationIds, itemCount: itemIds.length };
          })
          .filter(option => option.itemCount > 0 || option.recommendationIds.length > 0 || option.scope);
        if (!cancelled) {
          setScopeOptions(optionScopes);
          // A direct package edit must open and save against that exact option.
          // Do not retain a prior Good/Better/Best selection from a previous open.
          setActiveScopePackageId(estimatePackageId || (previous => previous || optionScopes[0]?.packageId || null));
        }
        let authoritativeScope = null;
        if (estimatePackageId) {
          authoritativeScope = scopes.find(s => s.estimate_package_id === estimatePackageId && !s.superseded_by_id && s.status === 'approved')
            || scopes.find(s => s.estimate_package_id === estimatePackageId && !s.superseded_by_id)
            || scopes.find(s => s.estimate_package_id === estimatePackageId)
            || null;
        } else if (proposalOptionId) {
          authoritativeScope = scopes.find(s => s.proposal_option_id === proposalOptionId && !s.superseded_by_id && s.status === 'approved')
            || scopes.find(s => s.proposal_option_id === proposalOptionId && !s.superseded_by_id)
            || scopes.find(s => s.proposal_option_id === proposalOptionId)
            || null;
        }
        if (!authoritativeScope) {
          authoritativeScope = scopes.find(s => s.status === 'approved' && !s.superseded_by_id)
            || scopes.find(s => s.status === 'approved')
            || scopes.find(s => !s.superseded_by_id)
            || scopes[0] || null;
        }
        if (!cancelled && authoritativeScope) setExistingScope(authoritativeScope);

        // Operational inputs belong to the option-level scope, never to an
        // individual deficiency. One key per package gives Good, Better, and Best
        // their own independent schedule, crew, equipment, and site conditions.
        if (!estimatePackageId && !proposalOptionId && optionScopes.length > 0) {
          const initial = {};
          for (const option of optionScopes) {
            const included = (repairRecs || []).filter(rec => option.recommendationIds.includes(rec.id));
            const defaultHours = included.reduce((sum, rec) => sum + Number(rec.estimated_time_hours || 0), 0);
            const defaultCrew = Math.max(1, ...included.map(rec => Number(rec.crew_size_required || 1)));
            let priorPhase = null;
            let savedSchedule = [];
            try { priorPhase = JSON.parse(option.scope?.work_phases || '[]')[0]?.scope_data || null; } catch {}
            try { savedSchedule = JSON.parse(option.scope?.daily_schedule || '[]'); } catch {}
            const data = { ...initScopeData({ estimated_time_hours: defaultHours, crew_size_required: defaultCrew }), ...(priorPhase || {}) };
            if (savedSchedule.length > 0) {
              data.daily_plans = savedSchedule.map(day => ({
                ...day,
                apprentices: day.apprentices ?? day.apprentice_count ?? 0,
                work_activities: day.work_activities || [],
                work_notes: day.work_notes || '',
                staging_sequence: day.staging_sequence || '',
              }));
              data.project_duration = savedSchedule.length === 1 && Number(savedSchedule[0].crew_hours || 0) < 8
                ? 'less_than_one_day'
                : `${savedSchedule.length}_days`;
              data.estimated_hours = option.scope?.total_estimated_hours || defaultHours;
            }
            initial[option.packageId] = data;
          }
          setScopeData(initial);
        } else {
          const selectedScope = authoritativeScope;
          let priorPhase = null;
          try { priorPhase = JSON.parse(selectedScope?.work_phases || '[]')[0]?.scope_data || null; } catch {}
          setScopeData({
            [estimatePackageId || proposalOptionId || 'legacy']: {
              ...initScopeData({ estimated_time_hours: selectedScope?.total_estimated_hours || 0, crew_size_required: selectedScope?.total_crew_required || 1 }),
              ...(priorPhase || {}),
            },
          });
        }
      } catch (e) {
        console.error('Scope builder init failed:', e);
      }
      if (!cancelled) setLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, [open, jobId, repairRecs, estimatePackageId, proposalOptionId]);

  const handleUpdate = useCallback((recId, updates) => {
    setScopeData(prev => ({
      ...prev,
      [recId]: { ...(prev[recId] || {}), ...updates },
    }));
  }, []);

  const handleContinue = useCallback(async () => {
    if (!repairRecs || repairRecs.length === 0) {
      toast.info('No repair recommendations to scope.');
      await onContinue();
      return;
    }

    // Validate the one operational form for each proposal option.
    const scopeEntries = (!estimatePackageId && !proposalOptionId && scopeOptions.length > 0)
      ? scopeOptions.map(option => ({
          id: option.packageId,
          label: `${option.tier.charAt(0).toUpperCase() + option.tier.slice(1)} Scope`,
          data: scopeData[option.packageId] || initScopeData({}),
        }))
      : [{
          id: estimatePackageId || proposalOptionId || 'legacy',
          label: 'Scope',
          data: scopeData[estimatePackageId || proposalOptionId || 'legacy'] || initScopeData({}),
        }];

    for (const entry of scopeEntries) {
      const items = entry.data.equipment_items || [];
      if (isScaffoldSelected(items) && !isScaffoldFormComplete(entry.data.scaffold_form)) {
        toast.error(`Scaffold form required for ${entry.label}. Complete the form before saving.`);
        return;
      }
      if (isLiftSelected(items) && !isLiftFormComplete(entry.data.lift_form)) {
        toast.error(`Lift form required for ${entry.label}. Complete the form before saving.`);
        return;
      }
      const plans = ensureDailyPlans(entry.data, durationToDays(entry.data.project_duration, entry.data.custom_days));
      for (const plan of plans) {
        const ch = plan.crew_hours;
        if (ch === undefined || ch === null || ch === '' || isNaN(Number(ch)) || Number(ch) < 0) {
          toast.error(`Enter valid non-negative hours for Day ${plan.day_number} in ${entry.label}.`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      console.log('[ScopeTransition] Step 1: Scope Save Clicked — handleContinue invoked');

      // Build work phases from scope data — compute authoritative per-day labor
      const workPhases = (repairRecs || []).map(rec => {
        const data = scopeData[rec.id] || initScopeData(rec);
        const labor = computeLaborFromSchedule(data);
        const dailySchedule = toStorageSchedule(labor.days);
        const enrichedData = {
          ...data,
          estimated_labor_hours: labor.totalCrewHours,
          crew_size_required: labor.crewSizeRequired,
          number_of_technicians: labor.crewSizeRequired,
          total_lead_technicians: labor.totalLeads,
          total_apprentices: labor.totalApprentices,
          total_masons: labor.totalMasons,
          total_crew_hours: labor.totalCrewHours,
          production_days: labor.productionDays,
          apprentice_man_hours: labor.apprenticeManHours,
          daily_schedule: dailySchedule,
        };
        return {
          recommendation_id: rec.id,
          phase_name: rec.service_name || rec.title || 'Service',
          service_name: rec.service_name || '',
          estimated_hours: labor.totalCrewHours,
          crew_size: labor.crewSizeRequired,
          scope_data: enrichedData,
        };
      });

      const totalHours = workPhases.reduce((sum, p) => sum + (p.estimated_hours || 0), 0);
      const maxCrew = Math.max(1, ...workPhases.map(p => p.crew_size || 1));

      const safetyNotes = Object.values(scopeData)
        .map(d => d.safety_notes).filter(Boolean);
      const cleanupTasks = Object.values(scopeData)
        .map(d => d.cleanup_requirements).filter(Boolean);
      const internalNotes = Object.values(scopeData)
        .map(d => d.technician_notes).filter(Boolean).join('\n');

      // Aggregate the per-phase daily schedules into a single scope-level daily
      // schedule and derive authoritative totals (total_crew_hours, production_days,
      // apprentice_man_hours) plus apprentice labor cost from the LoadedLaborCost rate.
      const phaseSchedules = workPhases.map(p => p.scope_data?.daily_schedule || []);
      const aggregatedSchedule = aggregateDailySchedule(phaseSchedules);
      const scheduleTotals = deriveScheduleTotals(aggregatedSchedule);
      const apprenticeLaborCost = scheduleTotals.apprenticeManHours * apprenticeLoadedRate;

      const scopePayload = {
        job_id: jobId,
        estimate_id: estimate?.id || null,
        status: 'approved',
        work_phases: JSON.stringify(workPhases),
        daily_schedule: JSON.stringify(aggregatedSchedule),
        total_estimated_hours: scheduleTotals.totalCrewHours || totalHours,
        estimated_hours: scheduleTotals.totalCrewHours || totalHours,
        estimated_days: scheduleTotals.productionDays || 1,
        total_crew_hours: scheduleTotals.totalCrewHours || totalHours,
        production_days: scheduleTotals.productionDays || 0,
        apprentice_man_hours: scheduleTotals.apprenticeManHours || 0,
        apprentice_labor_cost: apprenticeLaborCost || 0,
        total_crew_required: maxCrew,
        safety_notes: JSON.stringify(safetyNotes),
        cleanup_tasks: JSON.stringify(cleanupTasks),
        internal_notes: internalNotes,
        approved_at: new Date().toISOString(),
        approved_by: estimate?.customer_name || 'scope_builder',
        generated_from: 'scope_builder',
      };

      // When this is the workflow's normal Scope stage (rather than a direct edit
      // of one option), generate one separate scope for every Good / Better / Best
      // package. Each scope contains only that option's recommendation phases.
      if (!estimatePackageId && !proposalOptionId) {
        const [packages, draftItems, currentScopes] = await Promise.all([
          base44.entities.EstimatePackage.filter({ job_id: jobId }).catch(() => []),
          base44.entities.DraftEstimateItem.filter({ job_id: jobId }).catch(() => []),
          base44.entities.ScopeOfWork.filter({ job_id: jobId }, '-created_date').catch(() => []),
        ]);
        const options = packages.filter(pkg => pkg.is_authoritative !== false && ['good', 'better', 'best'].includes(pkg.option_type));
        if (options.length > 0) {
          for (const pkg of options) {
            let itemIds = [];
            try { itemIds = JSON.parse(pkg.estimate_item_ids || '[]'); } catch {}
            let traceableRecommendationIds = [];
            try { traceableRecommendationIds = JSON.parse(pkg.traceable_recommendation_ids || '[]'); } catch {}
            const recommendationIds = new Set([
              ...draftItems
                .filter(item => itemIds.includes(item.id))
                .map(item => item.repair_system_recommendation_id || item.recommendation_review_item_id || item.repair_recommendation_id)
                .filter(Boolean),
              ...traceableRecommendationIds,
            ]);
            // One shared schedule/crew/equipment/conditions form belongs to this
            // package. The phases below only identify the deficiencies included in it.
            const optionData = scopeData[pkg.id] || initScopeData({});
            const optionLabor = computeLaborFromSchedule(optionData);
            const packageSchedule = toStorageSchedule(optionLabor.days);
            const optionScopeData = {
              ...optionData,
              estimated_labor_hours: optionLabor.totalCrewHours,
              crew_size_required: optionLabor.crewSizeRequired,
              number_of_technicians: optionLabor.crewSizeRequired,
              total_lead_technicians: optionLabor.totalLeads,
              total_apprentices: optionLabor.totalApprentices,
              total_masons: optionLabor.totalMasons,
              total_crew_hours: optionLabor.totalCrewHours,
              production_days: optionLabor.productionDays,
              apprentice_man_hours: optionLabor.apprenticeManHours,
              daily_schedule: packageSchedule,
            };
            const packagePhases = (repairRecs || [])
              .filter(rec => recommendationIds.has(rec.id))
              .map(rec => ({
                recommendation_id: rec.id,
                phase_name: rec.service_name || rec.title || 'Service',
                service_name: rec.service_name || '',
                estimated_hours: Number(rec.estimated_time_hours || 0),
                crew_size: optionLabor.crewSizeRequired,
                scope_data: optionScopeData,
              }));
            if (packagePhases.length === 0 && itemIds.length === 0) continue;

            const packageTotals = {
              totalCrewHours: optionLabor.totalCrewHours,
              productionDays: optionLabor.productionDays,
              apprenticeManHours: optionLabor.apprenticeManHours,
            };
            const packageMaterials = rollUpPackageMaterials(draftItems.filter(item => itemIds.includes(item.id)));
            const packagePayload = {
              ...scopePayload,
              work_phases: JSON.stringify(packagePhases),
              daily_schedule: JSON.stringify(packageSchedule),
              total_estimated_hours: packageTotals.totalCrewHours,
              estimated_hours: packageTotals.totalCrewHours,
              estimated_days: packageTotals.productionDays || 1,
              total_crew_hours: packageTotals.totalCrewHours,
              production_days: packageTotals.productionDays || 0,
              apprentice_man_hours: packageTotals.apprenticeManHours || 0,
              apprentice_labor_cost: (packageTotals.apprenticeManHours || 0) * apprenticeLoadedRate,
              total_crew_required: optionLabor.crewSizeRequired,
              // Authoritative material handoff: Recommendation Review → package → scope.
              required_materials: JSON.stringify(packageMaterials),
              required_equipment: JSON.stringify(optionData.equipment_items || []),
              job_conditions: JSON.stringify({
                roof_pitch_options: optionData.roof_pitch_options || [],
                chimney_height: optionData.chimney_height || '',
                access_difficulty: optionData.access_difficulty || '',
                parking_truck_access: optionData.parking_truck_access || '',
                interior_protection_required: !!optionData.interior_protection_required,
                weather_sensitivity: optionData.weather_sensitivity || '',
                safety_concerns: optionData.safety_concerns || '',
                customer_constraints: optionData.customer_constraints || '',
              }),
              safety_notes: JSON.stringify([optionData.safety_notes].filter(Boolean)),
              cleanup_tasks: JSON.stringify([optionData.cleanup_requirements].filter(Boolean)),
              internal_notes: optionData.technician_notes || '',
              estimate_package_id: pkg.id,
              is_authoritative: true,
              is_legacy: false,
              workflow_version: 'v2_package',
              source_type: 'estimate_package',
            };
            const priorScope = currentScopes.find(scope => scope.estimate_package_id === pkg.id && !scope.superseded_by_id)
              || currentScopes.find(scope => scope.estimate_package_id === pkg.id);
            const savedPackageScope = priorScope
              ? await base44.entities.ScopeOfWork.update(priorScope.id, packagePayload)
              : await base44.entities.ScopeOfWork.create({
                  ...packagePayload,
                  customer_id: estimate?.customer_id || '',
                  customer_name: estimate?.customer_name || '',
                });
            await base44.entities.EstimatePackage.update(pkg.id, {
              scope_of_work_id: savedPackageScope.id,
              estimated_hours: packageTotals.totalCrewHours,
              estimated_days: packageTotals.productionDays || 1,
            }).catch(() => {});
          }

          // Packages already reference the approved DraftEstimateItems. Do not rebuild
          // them here: a rebuild creates new item IDs and would sever the package links.
          await onRefresh();
          await onContinue();
          return;
        }
      }

      // Prevent duplicate scope records: reload latest scope for THIS option before save.
      // Upsert by (job_id + estimate_package_id/proposal_option_id) — the immutable
      // option relationship. Reopening and repeatedly saving updates the same record.
      const currentScopes = await base44.entities.ScopeOfWork.filter({ job_id: jobId }, '-created_date').catch(() => []);
      let latestScope = null;
      if (estimatePackageId) {
        latestScope = currentScopes.find(s => s.estimate_package_id === estimatePackageId && !s.superseded_by_id)
          || currentScopes.find(s => s.estimate_package_id === estimatePackageId)
          || existingScope || null;
      } else if (proposalOptionId) {
        latestScope = currentScopes.find(s => s.proposal_option_id === proposalOptionId && !s.superseded_by_id)
          || currentScopes.find(s => s.proposal_option_id === proposalOptionId)
          || existingScope || null;
      } else {
        latestScope = currentScopes.find(s => s.status === 'approved') || currentScopes[0] || existingScope || null;
      }
      // Tag the payload with the immutable option relationship on create.
      const optionTag = estimatePackageId || proposalOptionId ? {
        estimate_package_id: estimatePackageId || null,
        proposal_option_id: proposalOptionId || null,
        is_authoritative: true,
        is_legacy: false,
        workflow_version: 'v2_package',
        source_type: 'package_scope_builder',
      } : {};
      console.log('[ScopeTransition] Step 2: Scope Record Save — option:', estimatePackageId || proposalOptionId || 'job-level', 'existing:', latestScope?.id || 'new', 'duplicate_count:', currentScopes.length);

      let savedScope;
      if (latestScope) {
        // Update this option's scope — never touches another option's record.
        savedScope = await base44.entities.ScopeOfWork.update(latestScope.id, { ...scopePayload, ...optionTag, estimate_package_id: latestScope.estimate_package_id || optionTag.estimate_package_id, proposal_option_id: latestScope.proposal_option_id || optionTag.proposal_option_id });
      } else {
        savedScope = await base44.entities.ScopeOfWork.create({
          ...scopePayload,
          ...optionTag,
          customer_id: estimate?.customer_id || '',
          customer_name: estimate?.customer_name || '',
        });
      }
      console.log('[ScopeTransition] Step 2: Scope Record Saved — id:', savedScope?.id, 'status:', savedScope?.status, 'hours:', savedScope?.total_estimated_hours, 'option:', estimatePackageId || proposalOptionId || 'job-level');

      // Link the option's package back to its scope (immutable relationship).
      if (estimatePackageId && savedScope?.id) {
        await base44.entities.EstimatePackage.update(estimatePackageId, { scope_of_work_id: savedScope.id }).catch(() => {});
      }

      // Auto-build draft estimate items using Service Configuration Engine
      try {
        await base44.functions.invoke('autoBuildDraftEstimate', { job_id: jobId });
      } catch (e) {
        console.error('Auto-build estimate failed:', e);
        toast.warning('Scope of Work saved, but estimate auto-build encountered an issue. You can still review the estimate.');
      }

      await onRefresh();
      await onContinue();
    } catch (e) {
      toast.error('Failed to save scope of work: ' + e.message);
    } finally {
      setSaving(false);
    }
  }, [repairRecs, scopeData, jobId, estimate, existingScope, apprenticeLoadedRate, onRefresh, onContinue, estimatePackageId, proposalOptionId]);

  const activeScopeOption = scopeOptions.find(option => option.packageId === activeScopePackageId) || null;
  const visibleRepairRecs = activeScopeOption
    ? (repairRecs || []).filter(rec => activeScopeOption.recommendationIds.includes(rec.id))
    : (repairRecs || []);
  const activeScopeKey = activeScopeOption?.packageId || estimatePackageId || proposalOptionId || 'legacy';
  const activeScopeData = scopeData[activeScopeKey] || initScopeData({});
  // The summary is calculated from the one shared option schedule, not by adding
  // together each included deficiency's schedule.
  const aggregateLabor = computeLaborFromSchedule(activeScopeData);
  const aggregateApprenticeLaborCost = aggregateLabor.apprenticeManHours * apprenticeLoadedRate;

  const [isDirty, setIsDirty] = useState(false);
  const skipDirtyRef = useRef(true);

  useEffect(() => {
    if (open) {
      skipDirtyRef.current = true;
      setIsDirty(false);
      const timer = setTimeout(() => { skipDirtyRef.current = false; }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open || skipDirtyRef.current) return;
    setIsDirty(true);
  }, [scopeData]);

  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onClose());

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCloseAttempt(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" /> Scope of Work Builder
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading scope…</span>
          </div>
        ) : (!repairRecs || repairRecs.length === 0) ? (
          <div className="py-12 text-center space-y-2">
            <p className="text-sm text-muted-foreground">No repair recommendations to scope for this job.</p>
            <p className="text-xs text-muted-foreground">Save an empty scope to proceed to the next step.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {scopeOptions.length > 0 && (
              <div className="grid md:grid-cols-3 gap-2">
                {scopeOptions.map(option => {
                  const selected = option.packageId === activeScopePackageId;
                  return <Button key={option.packageId} type="button" variant={selected ? 'default' : 'outline'} onClick={() => setActiveScopePackageId(option.packageId)}>
                    {option.tier.charAt(0).toUpperCase() + option.tier.slice(1)} Scope ({option.recommendationIds.length} {option.recommendationIds.length === 1 ? 'deficiency' : 'deficiencies'})
                  </Button>;
                })}
              </div>
            )}
            {/* Aggregate summary across the selected option — authoritative per-day model */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="bg-muted/30"><CardContent className="p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Total Crew Hours</p>
                <p className="text-lg font-semibold">{aggregateLabor.totalCrewHours}</p>
              </CardContent></Card>
              <Card className="bg-muted/30"><CardContent className="p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Production Days</p>
                <p className="text-lg font-semibold">{aggregateLabor.productionDays}</p>
              </CardContent></Card>
              <Card className="bg-muted/30"><CardContent className="p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Leads / Appr.</p>
                <p className="text-lg font-semibold">{aggregateLabor.totalLeads} / {aggregateLabor.totalApprentices}</p>
              </CardContent></Card>
              <Card className="bg-muted/30"><CardContent className="p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Apprentice Labor</p>
                <p className="text-lg font-semibold">${aggregateApprenticeLaborCost.toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground">{aggregateLabor.apprenticeManHours} man-hrs @ ${apprenticeLoadedRate}/hr</p>
              </CardContent></Card>
            </div>

            <ScopeItemEditor
              key={activeScopeKey}
              rec={{
                id: activeScopeKey,
                service_name: activeScopeOption
                  ? `${activeScopeOption.tier.charAt(0).toUpperCase() + activeScopeOption.tier.slice(1)} Scope of Work`
                  : 'Scope of Work',
              }}
              data={activeScopeData}
              onUpdate={handleUpdate}
            />

            <Card className="border-dashed">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Included Deficiencies</p>
                <div className="space-y-1">
                  {visibleRepairRecs.map(rec => (
                    <p key={rec.id} className="text-sm">• {rec.service_name || rec.recommendation_title || rec.title || 'Service'}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onClose()} disabled={saving}>Cancel</Button>
          <Button onClick={handleContinue} disabled={saving || loading}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileCheck className="w-4 h-4" /> Save & Continue</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <DirtyCloseWarning
      open={showWarning}
      onContinueEditing={cancelDiscard}
      onDiscardChanges={confirmDiscard}
    />
    </>
  );
}