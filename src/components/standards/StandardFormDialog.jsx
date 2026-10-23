import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { STANDARD_TABS, STANDARD_STATUSES } from '@/lib/inspectionStandardConstants';
import StandardField from './StandardField';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

const BLANK = {
  standard_name: '', standard_number: '', version: '1.0', status: 'draft',
  category: '', applies_to: [], inspection_level: '',
  authority_level: [], authority_details: '[]',
  pass_criteria: '', warning_criteria: '', fail_criteria: '',
  critical_failure_criteria: '', na_criteria: '',
  measurement_tolerances: '', photo_requirements: '',
  measurement_requirements: '', required_supporting_evidence: '',
  minimum_value: null, maximum_value: null, target_value: null, unit_of_measure: '',
  inspection_procedure: '', how_to_inspect: '', measurement_instructions: '',
  photo_instructions: '', required_documentation: '',
  common_defects: '', common_causes: '', safety_considerations: '',
  troubleshooting_tips: '', technician_notes: '',
  customer_explanation: '', why_this_matters: '', potential_risks: '',
  consequences_if_ignored: '', recommended_maintenance: '',
  faq: '', customer_friendly_language: '',
  default_repair_system: 'none', possible_repair_systems: [],
  good_option: '', better_option: '', best_option: '',
  recommended_pricebook_categories: '', suggested_material_calc_template: '',
  suggested_scope_of_work_template: '', typical_labor_difficulty: '',
  severity: 'medium',
  safety_concern: false, code_failure: false, insurance_concern: false,
  warranty_concern: false, structural_concern: false, water_intrusion: false,
  fire_hazard: false, carbon_monoxide_hazard: false, life_safety_hazard: false,
  created_by: '', reviewed_by: '', approved_by: '',
  approval_date: '', revision_history: '[]',
};

export default function StandardFormDialog({ open, onOpenChange, editing, onSave }) {
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (editing) {
      setForm({ ...BLANK, ...editing });
    } else {
      setForm({ ...BLANK });
    }
    setActiveTab('general');
  }, [editing, open]);

  useEffect(() => {
    if (open && !editing) {
      base44.auth.me().then(u => {
        setUser(u);
        setForm(f => ({ ...f, created_by: u?.full_name || u?.email || '' }));
      }).catch(() => {});
    }
  }, [open, editing]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, editing]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const set = (key, val) => { setForm(f => ({ ...f, [key]: val })); setIsDirty(true); };

  const handleSave = async () => {
    if (!form.standard_name?.trim()) { toast.error('Standard Name is required'); return; }
    setSaving(true);
    try {
      // Auto-maintain revision history on version changes
      let revisionHistory = form.revision_history || '[]';
      if (editing && editing.version !== form.version) {
        const history = JSON.parse(revisionHistory);
        history.push({ version: form.version, date: new Date().toISOString(), author: user?.full_name || 'System', changes: `Version updated from ${editing.version} to ${form.version}` });
        revisionHistory = JSON.stringify(history);
      }
      // Auto-set approval fields when status changes to approved
      let data = { ...form, revision_history: revisionHistory };
      if (form.status === 'approved' && (!editing || editing.status !== 'approved')) {
        data.approved_by = user?.full_name || '';
        data.approval_date = new Date().toISOString().split('T')[0];
        data.reviewed_by = data.reviewed_by || user?.full_name || '';
      }
      await onSave(data);
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to save standard: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" onCloseAttempt={handleCloseAttempt}>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Inspection Standard' : 'New Inspection Standard'}</DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto">
            {STANDARD_TABS.map(tab => (
              <TabsTrigger key={tab.key} value={tab.key} className="text-xs">{tab.label}</TabsTrigger>
            ))}
          </TabsList>
          {STANDARD_TABS.map(tab => (
            <TabsContent key={tab.key} value={tab.key} className="space-y-3 mt-3">
              <div className="grid grid-cols-2 gap-3">
                {tab.fields.filter(f => !f.full).map(field => (
                  <StandardField key={field.key} field={field} form={form} set={set} />
                ))}
              </div>
              <div className="space-y-3">
                {tab.fields.filter(f => f.full).map(field => (
                  <StandardField key={field.key} field={field} form={form} set={set} />
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={handleCloseAttempt} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {editing ? 'Update' : 'Create'}
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