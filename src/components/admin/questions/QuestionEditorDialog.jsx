import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import SubFieldsEditor from '../SubFieldsEditor';
import MatrixStatusBar from './MatrixStatusBar';
import ImpactAnalysisDialog from './ImpactAnalysisDialog';
import TabBasic from './TabBasic';
import TabLogic from './TabLogic';
import TabPhotos from './TabPhotos';
import TabOutputs from './TabOutputs';
import TabRepairEstimates from './TabRepairEstimates';
import TabValidation from './TabValidation';
import TabPreview from './TabPreview';
import TabStandards from './TabStandards';
import { classifyGaps } from '@/lib/inspectionMatrixGapClassifier';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';
import LinkedResourcesPanel from '@/components/resources/LinkedResourcesPanel';

const BLANK = {
  question_text: '', question_type: 'yes_no', category: 'other', subsection: '',
  inspection_type: 'interior', answer_options: '',
  required_flag: false, help_text: '', is_active: true,
  show_on_report: true, show_on_material_list: false,
  visibility_rule: '', sub_fields: '', display_after_question_id: '',
  placement_mode: 'standard_sort',
  question_role: 'observation', question_purpose: [], question_category: '',
  nfpa_trigger: false, safety_trigger: false, critical_failure: false,
  creates_finding: false, repair_system_config: 'none',
  linked_standard_ids: [],
  photo_requirement: 'not_required', minimum_photos: 0,
  require_caption: false, require_annotation: false, require_measurement_photo: false,
  allow_photo_override: true, photo_override_reason_required: false,
};

export default function QuestionEditorDialog({ open, onOpenChange, editing, questions, onSave }) {
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [showImpact, setShowImpact] = useState(false);
  const [logicRules, setLogicRules] = useState([]);
  const [pricebookMappings, setPricebookMappings] = useState([]);
  const [loadingDeps, setLoadingDeps] = useState(false);

  useEffect(() => {
    setForm(editing ? { ...BLANK, ...editing } : { ...BLANK });
    setActiveTab('basic');
  }, [editing, open]);

  useEffect(() => {
    if (!open) return;
    const loadDeps = async () => {
      setLoadingDeps(true);
      try {
        const [rules, mappings] = await Promise.all([
          base44.entities.LogicRule.list('-priority', 500),
          base44.entities.FindingPricebookMapping.filter({ is_active: true }),
        ]);
        setLogicRules(rules || []);
        setPricebookMappings(mappings || []);
      } catch { /* deps load failure is non-fatal */ }
      finally { setLoadingDeps(false); }
    };
    loadDeps();
  }, [open]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, editing]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const set = (key, val) => { setForm(f => ({ ...f, [key]: val })); setIsDirty(true); };

  // Find rules that reference this question
  const linkedRules = useMemo(() => {
    if (!editing?.id) return [];
    return logicRules.filter(rule => {
      try {
        const conditions = JSON.parse(rule.conditions_json || '[]');
        return Array.isArray(conditions) && conditions.some(c => c.question_id === editing.id);
      } catch { return false; }
    });
  }, [logicRules, editing]);

  // Find pricebook mappings for this question's category
  const linkedMappings = useMemo(() => {
    if (!editing?.category && !form.category) return [];
    const cat = form.category || editing?.category;
    const deficiencyMap = {
      crown: ['cracked_crown','spalling_crown','crown_wash_failure','deteriorated_crown','missing_drip_edge','water_entry_crown'],
      chimney_cap: ['missing_cap','damaged_cap','rusted_chase_cover','water_stains_cap','animal_entry','deteriorated_chase_cover'],
      liner: ['cracked_clay_liner','damaged_liner','deteriorated_flue','missing_flue_mortar','improper_sizing','unsafe_venting','gaps_flue_tiles'],
      flue: ['creosote_buildup','damaged_liner','deteriorated_flue'],
      smoke_chamber: ['smoke_chamber_gaps','smoke_chamber_cracking','corbeling_issues','creosote_buildup','rough_smoke_chamber','smoke_chamber_deterioration'],
      firebox: ['cracked_firebox_brick','deteriorated_mortar','missing_mortar_joints','spalling_brick'],
      flashing: ['flashing_failure','water_intrusion'],
      water_damage: ['water_intrusion','spalling_brick','efflorescence'],
      structural: ['leaning_chimney','loose_brick','spalling_brick','cracked_bricks'],
    };
    const defTypes = deficiencyMap[cat] || [];
    return pricebookMappings.filter(m => defTypes.includes(m.deficiency_type));
  }, [pricebookMappings, editing, form.category]);

  // Compute gap results for validation tab
  const gapResults = useMemo(() => {
    if (!editing) return [];
    // Build a pseudo matrix entry from the current form for live gap checking
    const entry = {
      question_id: editing.id,
      question_text: form.question_text,
      question_role: form.question_role,
      question_purpose: JSON.stringify(form.question_purpose || []),
      question_category: form.question_category,
      category: form.category,
      inspection_type: form.inspection_type,
      is_active: form.is_active !== false,
      required: form.required_flag,
      customer_pdf: form.output_customer_pdf === true || (form.output_customer_pdf === undefined && form.show_on_report !== false) ? 'show' : 'hide',
      show_on_report: form.show_on_report,
      show_on_material_list: form.show_on_material_list,
      logic_source: linkedRules.length > 0 ? 'rule' : 'none',
      recommendation_trigger: linkedRules.length > 0,
      pricebook_mapping: linkedMappings.length > 0,
      estimate_recommendation: linkedRules.length > 0 || linkedMappings.length > 0,
      repair_system: form.repair_system_config || 'none',
      feeds_material_calculator: form.output_material_calculator === true || form.show_on_material_list,
      customer_facing: form.output_customer_pdf === true || form.show_on_report !== false,
      customer_summary: form.output_customer_summary,
      nfpa_211_question: form.nfpa_trigger,
      safety_concern: form.safety_trigger,
      critical_failure: form.critical_failure,
      photo_required: form.photo_required || form.question_type === 'photo',
      photo_customer_pdf: form.photo_customer_visible,
      photo_internal_only: form.photo_internal_only,
      measurement_required: form.question_type === 'number',
      measurement_material_calc: form.output_material_calculator || form.show_on_material_list,
      validation_flags: '[]',
      validation_unused: false,
      validation_duplicate: false,
      validation_incomplete: !form.question_text || !form.question_type,
      validation_missing_repair_mapping: false,
      validation_missing_pdf_mapping: false,
      validation_missing_estimate_mapping: false,
      pass_fail: form.nfpa_trigger ? 'pass_fail' : 'none',
      severity: form.severity_config || '',
      good_better_best: [form.good_option, form.better_option, form.best_option].filter(Boolean).join(' / '),
      section: '', subsection: '',
    };
    try {
      return classifyGaps([entry]);
    } catch { return []; }
  }, [form, editing, linkedRules, linkedMappings]);

  const handleSaveClick = () => {
    if (!form.question_text?.trim()) { toast.error('Question text is required'); return; }
    setShowImpact(true);
  };

  const handleConfirmSave = async () => {
    setShowImpact(false);
    setSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to save question: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" onCloseAttempt={handleCloseAttempt}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Question' : 'New Question'}</DialogTitle>
          </DialogHeader>

          {/* Live Matrix Status */}
          <MatrixStatusBar
            form={form}
            linkedRules={linkedRules}
            linkedMappings={linkedMappings}
            onNavigateToValidation={() => setActiveTab('validation')}
          />

          {loadingDeps && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading dependencies...
            </div>
          )}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-8 w-full">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="standards">Standards</TabsTrigger>
              <TabsTrigger value="logic">Logic</TabsTrigger>
              <TabsTrigger value="photos">Photos</TabsTrigger>
              <TabsTrigger value="outputs">Outputs</TabsTrigger>
              <TabsTrigger value="repair">Repair</TabsTrigger>
              <TabsTrigger value="validation">Validation</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="mt-4">
              <TabBasic form={form} set={set} questions={questions} />
              <div className="mt-4">
                <SubFieldsEditor value={form.sub_fields || ''} onChange={v => set('sub_fields', v)} />
              </div>
            </TabsContent>

            <TabsContent value="standards" className="mt-4">
              <TabStandards form={form} set={set} />
            </TabsContent>

            <TabsContent value="logic" className="mt-4">
              <TabLogic form={form} set={set} questions={questions} editing={editing} linkedRules={linkedRules} allQuestions={questions} />
            </TabsContent>

            <TabsContent value="photos" className="mt-4">
              <TabPhotos form={form} set={set} />
            </TabsContent>

            <TabsContent value="outputs" className="mt-4">
              <TabOutputs form={form} set={set} />
            </TabsContent>

            <TabsContent value="repair" className="mt-4">
              <TabRepairEstimates form={form} set={set} linkedMappings={linkedMappings} />
            </TabsContent>

            <TabsContent value="validation" className="mt-4">
              <TabValidation form={form} linkedRules={linkedRules} linkedMappings={linkedMappings} gapResults={gapResults} />
            </TabsContent>

            <TabsContent value="preview" className="mt-4">
              <TabPreview form={form} linkedRules={linkedRules} linkedMappings={linkedMappings} />
            </TabsContent>
          </Tabs>

          {editing?.id && (
            <LinkedResourcesPanel entityType="InspectionQuestion" entityId={editing.id} title="Product Resources" />
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={handleCloseAttempt}>Cancel</Button>
            <Button onClick={handleSaveClick} disabled={saving}>
              {saving ? 'Saving...' : 'Save Question'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <DirtyCloseWarning
        open={showWarning}
        onContinueEditing={cancelDiscard}
        onDiscardChanges={confirmDiscard}
      />

      <ImpactAnalysisDialog
        open={showImpact}
        onOpenChange={setShowImpact}
        form={form}
        linkedRules={linkedRules}
        linkedMappings={linkedMappings}
        onConfirm={handleConfirmSave}
      />
    </>
  );
}