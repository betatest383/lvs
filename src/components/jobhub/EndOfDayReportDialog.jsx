import { useState, useEffect, useRef } from 'react';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, Target, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';

const VARIANCE_REASONS = [
  { value: 'none', label: 'None — On Schedule' },
  { value: 'weather', label: 'Weather' },
  { value: 'hidden_damage', label: 'Hidden Damage' },
  { value: 'material_delay', label: 'Material Delay' },
  { value: 'customer_request', label: 'Customer Request' },
  { value: 'equipment_failure', label: 'Equipment Failure' },
  { value: 'safety_concern', label: 'Safety Concern' },
  { value: 'other', label: 'Other' },
];

export default function EndOfDayReportDialog({ open, onClose, dayPlan, appointment, jobId, jobNumber, customerName, onSaved }) {
  const { effectiveEmail, effectiveName } = useEmployeeContext();
  const [existingReview, setExistingReview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [actualWork, setActualWork] = useState('');
  const [percentComplete, setPercentComplete] = useState(0);
  const [remainingWork, setRemainingWork] = useState('');
  const [additionalWorkDiscovered, setAdditionalWorkDiscovered] = useState('');
  const [materialsUsed, setMaterialsUsed] = useState('');
  const [materialsRemaining, setMaterialsRemaining] = useState('');
  const [warehouseRestockNeeded, setWarehouseRestockNeeded] = useState('');
  const [equipmentIssues, setEquipmentIssues] = useState('');
  const [weatherDelay, setWeatherDelay] = useState('');
  const [customerQuestions, setCustomerQuestions] = useState('');
  const [customerRequests, setCustomerRequests] = useState('');
  const [additionalApprovals, setAdditionalApprovals] = useState('');
  const [customerConcerns, setCustomerConcerns] = useState('');
  const [dailyCustomerSummary, setDailyCustomerSummary] = useState('');
  const [safetyIssues, setSafetyIssues] = useState('');
  const [technicianNotes, setTechnicianNotes] = useState('');
  const [supervisorNotes, setSupervisorNotes] = useState('');
  const [actualHours, setActualHours] = useState(dayPlan?.estimated_hours || 0);
  const [actualProduction, setActualProduction] = useState('');
  const [varianceReason, setVarianceReason] = useState('none');
  const [varianceNotes, setVarianceNotes] = useState('');
  const [sqftCompleted, setSqftCompleted] = useState(0);
  const [travelTime, setTravelTime] = useState(0);
  const [idleTime, setIdleTime] = useState(0);
  const [laborHours, setLaborHours] = useState(0);
  const [photoUrls, setPhotoUrls] = useState([]);
  const [photoFile, setPhotoFile] = useState(null);

  const plannedHours = dayPlan?.estimated_hours || 0;

  const [isDirty, setIsDirty] = useState(false);
  const isLoadedRef = useRef(false);

  useEffect(() => {
    if (open) { isLoadedRef.current = false; setIsDirty(false); }
    else { isLoadedRef.current = false; }
  }, [open]);

  useEffect(() => {
    if (!open || !isLoadedRef.current) return;
    setIsDirty(true);
  }, [actualWork, percentComplete, remainingWork, additionalWorkDiscovered,
      materialsUsed, materialsRemaining, warehouseRestockNeeded, equipmentIssues,
      weatherDelay, customerQuestions, customerRequests, additionalApprovals,
      customerConcerns, dailyCustomerSummary, safetyIssues, technicianNotes,
      supervisorNotes, actualHours, actualProduction, varianceReason, varianceNotes,
      sqftCompleted, travelTime, idleTime, laborHours, photoUrls]);

  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onClose?.());
  const isBehindSchedule = actualHours > plannedHours || varianceReason !== 'none';

  // Load existing review for this appointment
  useEffect(() => {
    if (!open || !appointment?.id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const reviews = await base44.entities.DailyAppointmentReview.filter({ appointment_id: appointment.id });
        if (cancelled) return;
        const existing = reviews[0];
        if (existing) {
          setExistingReview(existing);
          setActualWork(existing.actual_work_completed || '');
          setPercentComplete(existing.percent_complete || 0);
          setRemainingWork(existing.remaining_work || '');
          setAdditionalWorkDiscovered(existing.additional_work_discovered || '');
          setMaterialsUsed(existing.materials_used || '');
          setMaterialsRemaining(existing.materials_remaining || '');
          setWarehouseRestockNeeded(existing.warehouse_restock_needed || '');
          setEquipmentIssues(existing.equipment_issues || '');
          setWeatherDelay(existing.weather_delay || '');
          setCustomerQuestions(existing.customer_questions || '');
          setCustomerRequests(existing.customer_requests || '');
          setAdditionalApprovals(existing.additional_approvals || '');
          setCustomerConcerns(existing.customer_concerns || '');
          setDailyCustomerSummary(existing.daily_customer_summary || '');
          setSafetyIssues(existing.safety_issues || '');
          setTechnicianNotes(existing.technician_notes || '');
          setSupervisorNotes(existing.supervisor_notes || '');
          setActualHours(existing.actual_hours || plannedHours);
          setActualProduction(existing.actual_production || '');
          setVarianceReason(existing.variance_reason || 'none');
          setVarianceNotes(existing.variance_notes || '');
          setSqftCompleted(existing.square_footage_completed || 0);
          setTravelTime(existing.travel_time_minutes || 0);
          setIdleTime(existing.idle_time_minutes || 0);
          setLaborHours(existing.labor_hours || 0);
          setPhotoUrls(existing.photos || []);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) { setLoading(false); Promise.resolve().then(() => { isLoadedRef.current = true; }); } }
    };
    load();
    return () => { cancelled = true; };
  }, [open, appointment?.id]);

  const handlePhotoUpload = async () => {
    if (!photoFile) return;
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: photoFile });
      setPhotoUrls(prev => [...prev, file_url]);
      setPhotoFile(null);
    } catch (e) {
      toast.error('Failed to upload photo');
    }
  };

  const handleSave = async (submitStatus = 'submitted') => {
    setSaving(true);
    try {
      const reviewData = {
        appointment_id: appointment?.id,
        job_id: jobId,
        day_number: dayPlan?.day_number || appointment?.day_number || 1,
        review_date: new Date().toLocaleDateString('en-CA'),
        customer_name: customerName,
        technician_email: effectiveEmail,
        technician_name: effectiveName,
        planned_work: dayPlan?.daily_scope || dayPlan?.production_goal || '',
        actual_work_completed: actualWork,
        percent_complete: percentComplete,
        remaining_work: remainingWork,
        additional_work_discovered: additionalWorkDiscovered,
        materials_used: materialsUsed,
        materials_remaining: materialsRemaining,
        warehouse_restock_needed: warehouseRestockNeeded,
        equipment_issues: equipmentIssues,
        weather_delay: weatherDelay,
        customer_questions: customerQuestions,
        customer_requests: customerRequests,
        additional_approvals: additionalApprovals,
        customer_concerns: customerConcerns,
        daily_customer_summary: dailyCustomerSummary,
        safety_issues: safetyIssues,
        technician_notes: technicianNotes,
        supervisor_notes: supervisorNotes,
        planned_hours: plannedHours,
        actual_hours: actualHours,
        planned_scope: dayPlan?.daily_scope || '',
        completed_scope: actualWork,
        production_goal: dayPlan?.production_goal || '',
        actual_production: actualProduction,
        variance_reason: varianceReason,
        variance_notes: varianceNotes,
        photos: photoUrls,
        square_footage_completed: sqftCompleted,
        travel_time_minutes: travelTime,
        idle_time_minutes: idleTime,
        labor_hours: laborHours,
        status: submitStatus,
        submitted_by: effectiveName,
        submitted_at: new Date().toISOString(),
      };

      if (existingReview?.id) {
        await base44.entities.DailyAppointmentReview.update(existingReview.id, reviewData);
      } else {
        const created = await base44.entities.DailyAppointmentReview.create(reviewData);
        setExistingReview(created);
      }

      // Also update the appointment with actual hours and variance
      if (appointment?.id) {
        await base44.entities.Appointment.update(appointment.id, {
          actual_hours: actualHours,
          production_variance_reason: varianceReason,
        });
      }

      // Log to activity timeline
      await base44.entities.JobActivityLog.create({
        job_id: jobId,
        job_number: jobNumber,
        customer_name: customerName,
        technician_email: effectiveEmail,
        event_type: 'activity_completed',
        event_label: `End of Day Report — Day ${dayPlan?.day_number || 1} (${submitStatus})`,
        event_details: JSON.stringify({ review_id: existingReview?.id, percent_complete: percentComplete, variance_reason: varianceReason }),
        performed_by: effectiveName,
        timestamp: new Date().toISOString(),
        hub_status: 'working',
      });

      toast.success(`Day ${dayPlan?.day_number || 1} end-of-day review ${submitStatus === 'submitted' ? 'submitted' : 'saved as draft'}`);
      setIsDirty(false);
      onSaved?.();
      onClose?.();
    } catch (e) {
      toast.error('Failed to save end-of-day review');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
...
    </Dialog>
    <DirtyCloseWarning
      open={showWarning}
      onContinueEditing={cancelDiscard}
      onDiscardChanges={confirmDiscard}
    />
    </>
  );
}