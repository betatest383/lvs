import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useInspectionReturn } from '@/hooks/useInspectionReturn';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight, Save, CheckCircle2, Camera, Loader2, Building2, Home as HomeIcon, CloudSun, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import { SELECTABLE_MODULES, INSPECTION_LEVELS } from '@/lib/inspectionModules';
import { completeStageServer } from '@/lib/workflowRevisions';

const fmtDate = (d) => d ? moment.utc(d).format('MMM D, YYYY') : '';

const SECTIONS = ['appointment_arrival', 'property_documentation', 'inspection_scope'];
const SECTION_LABELS = {
  appointment_arrival: 'Appointment & Arrival',
  property_documentation: 'Property Documentation',
  inspection_scope: 'Inspection Scope',
};

export default function InspectionSetup() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const { goBack } = useInspectionReturn(selectedJobId);
  const [selectedJob, setSelectedJob] = useState(null);
  const [existingSetup, setExistingSetup] = useState(null);
  const [propertyProfile, setPropertyProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [currentSection, setCurrentSection] = useState(0);
  const [setupId, setSetupId] = useState(null);
  const justCompletedRef = useRef(false);

  // Section 1: Appointment & Arrival
  const [arrivalTime, setArrivalTime] = useState(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
  const [weather, setWeather] = useState('');
  const [customerPresent, setCustomerPresent] = useState(true);
  const [occupancy, setOccupancy] = useState('');
  const [accessIssues, setAccessIssues] = useState('');
  const [safetyHazards, setSafetyHazards] = useState('');
  const [customerConcerns, setCustomerConcerns] = useState('');
  const [inspectionAuth, setInspectionAuth] = useState(false);
  const [inspectionLevel, setInspectionLevel] = useState('level_1');

  // Section 2: Property Documentation
  const [frontPhoto, setFrontPhoto] = useState('');
  const [leftPhoto, setLeftPhoto] = useState('');
  const [rightPhoto, setRightPhoto] = useState('');
  const [rearPhoto, setRearPhoto] = useState('');
  const [roofPhoto, setRoofPhoto] = useState('');
  const [buildingOverviewNotes, setBuildingOverviewNotes] = useState('');
  const [photoAction, setPhotoAction] = useState({ field: null, mode: null });

  // Section 3: Inspection Scope
  // A standard chimney inspection covers both the interior/fireplace and the
  // exterior/chimney. Technicians can still deselect a module when it truly is
  // not part of the appointment, but a new setup must not silently omit Exterior.
  const [selectedModules, setSelectedModules] = useState(['interior', 'exterior']);

  const urlParams = new URLSearchParams(window.location.search);
  const presetJobId = urlParams.get('job_id');

  // Load user and jobs
  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      Promise.all([
        base44.entities.Job.filter({ status: 'scheduled' }, '-service_date'),
        base44.entities.Job.filter({ status: 'in_progress' }, '-service_date'),
        base44.entities.Job.filter({ status: 'inspection_complete' }, '-service_date'),
      ]).then(([scheduled, inProgress, inspectionComplete]) => {
        setJobs([...scheduled, ...inProgress, ...inspectionComplete]);
      });
    });
  }, []);

  useEffect(() => {
    if (presetJobId) setSelectedJobId(presetJobId);
  }, [presetJobId]);

  // When job is selected, load existing setup + property profile
  useEffect(() => {
    if (!selectedJobId) return;
    const job = jobs.find(j => j.id === selectedJobId);
    setSelectedJob(job || null);
    // Check for existing setup
    base44.entities.InspectionSetup.filter({ job_id: selectedJobId }).then(setups => {
      if (setups.length > 0) {
        const setup = setups[0];
        setExistingSetup(setup);
        setSetupId(setup.id);
        hydrateFromSetup(setup);
        // Load property profile
        if (setup.property_profile_id) {
          base44.entities.PropertyProfile.get(setup.property_profile_id).then(setPropertyProfile).catch(() => {});
        } else if (job) {
          findPropertyProfile(job);
        }
      } else if (job) {
        findPropertyProfile(job);
      }
    });
  }, [selectedJobId, jobs]);

  // Navigation guard: if setup is already complete, route to next incomplete inspection step
  useEffect(() => {
    if (justCompletedRef.current) {
      justCompletedRef.current = false;
      return;
    }
    if (existingSetup?.status === 'complete' && selectedJobId) {
      const modules = existingSetup.selected_modules || [];
      let target;
      if (modules.includes('interior')) {
        target = `/tech/inspection?job_id=${selectedJobId}`;
      } else if (modules.includes('exterior')) {
        target = `/tech/exterior-inspection?job_id=${selectedJobId}`;
      } else {
        target = `/tech/job-hub/${selectedJobId}`;
      }
      console.log('[InspectionSetup] Setup already complete — redirecting to:', target);
      navigate(target);
    }
  }, [existingSetup, selectedJobId, navigate]);

  const findPropertyProfile = (job) => {
    if (!job.address) return;
    base44.entities.PropertyProfile.filter({ address: job.address }).then(profiles => {
      if (profiles.length > 0) {
        const profile = profiles[0];
        setPropertyProfile(profile);
        hydrateFromProfile(profile);
      }
    }).catch(() => {});
  };

  const hydrateFromSetup = (setup) => {
    setArrivalTime(setup.arrival_time || arrivalTime);
    setWeather(setup.weather || '');
    setCustomerPresent(setup.customer_present ?? true);
    setOccupancy(setup.occupancy || '');
    setAccessIssues(setup.access_issues || '');
    setSafetyHazards(setup.safety_hazards || '');
    setCustomerConcerns(setup.customer_concerns || '');
    setInspectionAuth(setup.inspection_authorization ?? false);
    setInspectionLevel(setup.inspection_level || 'level_1');
    setFrontPhoto(setup.front_photo || '');
    setLeftPhoto(setup.left_photo || '');
    setRightPhoto(setup.right_photo || '');
    setRearPhoto(setup.rear_photo || '');
    setRoofPhoto(setup.roof_photo || '');
    setBuildingOverviewNotes(setup.building_overview_notes || '');
    setSelectedModules(setup.selected_modules || []);
  };

  const hydrateFromProfile = (profile) => {
    setFrontPhoto(profile.front_photo || '');
    setLeftPhoto(profile.left_photo || '');
    setRightPhoto(profile.right_photo || '');
    setRearPhoto(profile.rear_photo || '');
    setRoofPhoto(profile.roof_photo || '');
    setBuildingOverviewNotes(profile.general_notes || '');
  };

  const handlePhotoUpload = async (file, setter, fieldName) => {
    if (!file) return;
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setter(file_url);
    setPhotoAction({ field: null, mode: null });
    toast.success('Photo uploaded');
  };

  const toggleModule = (key) => {
    setSelectedModules(prev => prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]);
  };

  const buildData = (status) => ({
    job_id: selectedJobId,
    customer_id: selectedJob?.customer_id || '',
    customer_name: selectedJob?.customer_name || '',
    technician_email: user?.email || '',
    technician_name: user?.full_name || '',
    address: selectedJob?.address || '',
    status,
    arrival_time: arrivalTime,
    weather,
    customer_present: customerPresent,
    occupancy,
    access_issues: accessIssues,
    safety_hazards: safetyHazards,
    customer_concerns: customerConcerns,
    inspection_authorization: inspectionAuth,
    inspection_level: inspectionLevel,
    front_photo: frontPhoto,
    left_photo: leftPhoto,
    right_photo: rightPhoto,
    rear_photo: rearPhoto,
    roof_photo: roofPhoto,
    building_overview_notes: buildingOverviewNotes,
    selected_modules: selectedModules,
  });

  const handleSaveDraft = async () => {
    if (!selectedJobId) { toast.error('Please select a job'); return; }
    if (selectedModules.length === 0) { toast.error('Select at least one inspection module.'); return; }
    setSaving(true);
    try {
      const data = buildData('draft');
      if (setupId) {
        await base44.entities.InspectionSetup.update(setupId, data);
      } else {
        const created = await base44.entities.InspectionSetup.create(data);
        setSetupId(created.id);
      }
      toast.success('Draft saved');
    } catch (e) {
      toast.error(e?.message || e?.error || 'Failed to save draft');
    }
    setSaving(false);
  };

  const handleComplete = async () => {
    // Guard against rapid double-clicks
    if (completing) {
      console.warn('[InspectionSetup] handleComplete already running — ignoring duplicate click');
      return;
    }
    if (!selectedJobId) { toast.error('Please select a job'); return; }
    const errors = [];
    if (!inspectionAuth) errors.push('Inspection Authorization Confirmed is required.');
    if (!frontPhoto) errors.push('Front of House photo is required.');
    if (selectedModules.length === 0) errors.push('Select at least one inspection module.');
    if (errors.length > 0) {
      toast.error('Before completing setup, please fix:\n' + errors.map(e => '• ' + e).join('\n'), { duration: 6000 });
      return;
    }

    console.log('[InspectionSetup] ─── handleComplete START ───');
    console.log('[InspectionSetup] Job ID:', selectedJobId);
    console.log('[InspectionSetup] Selected modules:', selectedModules);
    console.log('[InspectionSetup] Workflow stage before: inspection_setup');

    setCompleting(true);
    try {
      // Upsert property profile
      let profileId = existingSetup?.property_profile_id;
      const profileData = {
        customer_id: selectedJob?.customer_id || '',
        customer_name: selectedJob?.customer_name || '',
        address: selectedJob?.address || '',
        city: selectedJob?.city || '',
        state: selectedJob?.state || '',
        zip: selectedJob?.zip || '',
        front_photo: frontPhoto,
        left_photo: leftPhoto,
        right_photo: rightPhoto,
        rear_photo: rearPhoto,
        roof_photo: roofPhoto,
        general_notes: buildingOverviewNotes,
        last_inspection_date: new Date().toISOString().split('T')[0],
      };
      if (propertyProfile?.id) {
        await base44.entities.PropertyProfile.update(propertyProfile.id, profileData);
        profileId = propertyProfile.id;
      } else {
        const profile = await base44.entities.PropertyProfile.create(profileData);
        profileId = profile.id;
        setPropertyProfile(profile);
      }

      // Complete setup — save exactly once
      const data = { ...buildData('complete'), property_profile_id: profileId, completed_at: new Date().toISOString() };
      let savedSetup;
      if (setupId) {
        savedSetup = await base44.entities.InspectionSetup.update(setupId, data);
      } else {
        savedSetup = await base44.entities.InspectionSetup.create(data);
        setSetupId(savedSetup.id);
      }
      setExistingSetup(savedSetup);
      console.log('[InspectionSetup] InspectionSetup saved — status: complete');

      // Update persisted workflow stage (server-authoritative for stage_states)
      try {
        const workflows = await base44.entities.AppointmentWorkflow.filter({ job_id: selectedJobId });
        if (workflows.length > 0) {
          const wf = workflows[0];
          // Setup metadata is a server-authoritative, locked workflow mutation.
          const configureResponse = await base44.functions.invoke('manageWorkflowWorkspace', {
            action: 'configure_inspection_setup',
            job_id: selectedJobId,
            workflow_id: wf.id,
            selected_modules: selectedModules,
            expected_workflow_revision_version: wf.workflow_revision_version || 0,
            idempotency_key: `inspection-setup-${wf.id}-v${wf.workflow_revision_version || 0}-${selectedModules.join('-')}`,
          });
          const configure = configureResponse?.data || configureResponse;
          if (!configure?.ok) throw new Error(configure?.error_code || 'Workflow setup update failed');
          // Route stage completion through the server-authoritative function
          const result = await completeStageServer({
            job_id: selectedJobId,
            workflow_id: wf.id,
            stage_key: 'inspection_setup',
            expected_workflow_revision_version: configure.workflow_revision_version,
            extra_data: {
              completed_by: user?.email || '',
              completed_by_name: user?.full_name || '',
            },
          });
          if (result?.success) {
            console.log('[InspectionSetup] Server-authoritative inspection_setup → completed');
          } else {
            console.error('[InspectionSetup] Stage completion failed:', result?.error);
            toast.error(result?.error || 'Setup saved but stage completion failed. Please retry from Job Hub.');
          }
        }
      } catch (syncErr) {
        console.warn('[InspectionSetup] AppointmentWorkflow sync failed:', syncErr);
        toast.error('Could not sync the workflow stage. Your setup was saved — please retry from Job Hub.');
      }

      toast.success('Inspection Setup complete! Modules unlocked.');

      // Navigate to next interior inspection screen (not back to InspectionSetup)
      justCompletedRef.current = true;
      let navTarget;
      if (selectedModules.includes('interior')) {
        navTarget = `/tech/inspection?job_id=${selectedJobId}`;
      } else if (selectedModules.includes('exterior')) {
        navTarget = `/tech/exterior-inspection?job_id=${selectedJobId}`;
      } else {
        navTarget = `/tech/job-hub/${selectedJobId}`;
      }
      console.log('[InspectionSetup] Intended navigation target:', navTarget);
      navigate(navTarget);
      console.log('[InspectionSetup] Actual route after navigation:', window.location.pathname + window.location.search);
      console.log('[InspectionSetup] ─── handleComplete END ───');
    } catch (e) {
      toast.error(e?.message || e?.error || 'Failed to complete setup');
      console.error('[InspectionSetup] handleComplete error:', e);
    } finally {
      setCompleting(false);
    }
  };

  const currentSectionKey = SECTIONS[currentSection];
  const progress = ((currentSection + 1) / SECTIONS.length) * 100;

  const photoFields = [
    { key: 'front', label: 'Front of House', required: true, getter: frontPhoto, setter: setFrontPhoto },
    { key: 'left', label: 'Left Side', required: false, getter: leftPhoto, setter: setLeftPhoto },
    { key: 'right', label: 'Right Side', required: false, getter: rightPhoto, setter: setRightPhoto },
    { key: 'rear', label: 'Rear of House', required: false, getter: rearPhoto, setter: setRearPhoto },
    { key: 'roof', label: 'Roof Overview', required: false, getter: roofPhoto, setter: setRoofPhoto },
  ];

  return (
    <div className="space-y-4 max-w-xl mx-auto pb-24">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight">Inspection Setup</h1>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-700">Required</span>
        </div>
        <p className="text-sm text-muted-foreground">Complete setup before starting any inspection module</p>
      </div>

      {/* Property Profile Banner */}
      {propertyProfile && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm">
          <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-blue-900">Existing Property Profile Found</p>
            <p className="text-xs text-blue-700">Photos pre-loaded from last visit. Update or retake as needed.</p>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Step {currentSection + 1} of {SECTIONS.length}</span>
          <span>{SECTION_LABELS[currentSectionKey]}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-violet-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Job Selection */}
      {!selectedJobId && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 space-y-3">
            <Label className="font-medium">Select a Job</Label>
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scheduled jobs found</p>
            ) : (
              <div className="space-y-2">
                {jobs.map(job => (
                  <Button key={job.id} variant="outline" className="w-full h-auto py-3 px-4 justify-start text-left" onClick={() => setSelectedJobId(job.id)}>
                    <div>
                      <p className="font-medium">{job.customer_name}</p>
                      <p className="text-xs text-muted-foreground">{job.address} • {fmtDate(job.service_date)}</p>
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Form Sections */}
      {selectedJobId && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 space-y-5">
            {/* Job context */}
            {selectedJob && (
              <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                <p><span className="font-medium">Customer:</span> {selectedJob.customer_name}</p>
                <p><span className="font-medium">Address:</span> {selectedJob.address}</p>
                <p><span className="font-medium">Date:</span> {fmtDate(selectedJob.service_date)}</p>
              </div>
            )}

            {/* Section 1: Appointment & Arrival */}
            {currentSectionKey === 'appointment_arrival' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Appointment & Arrival</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Arrival Time</Label>
                    <Input value={arrivalTime} onChange={e => setArrivalTime(e.target.value)} className="mt-1 h-12 text-base" />
                  </div>
                  <div>
                    <Label>Weather</Label>
                    <div className="grid grid-cols-3 gap-1 mt-1">
                      {['sunny', 'cloudy', 'overcast', 'rain', 'snow', 'windy'].map(w => (
                        <Button key={w} type="button" variant={weather === w ? 'default' : 'outline'} className="h-9 text-xs capitalize" onClick={() => setWeather(w)}>{w}</Button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Customer Present?</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <Button type="button" variant={customerPresent ? 'default' : 'outline'} className="h-12" onClick={() => setCustomerPresent(true)}>Yes</Button>
                      <Button type="button" variant={!customerPresent ? 'default' : 'outline'} className="h-12" onClick={() => setCustomerPresent(false)}>No</Button>
                    </div>
                  </div>
                  <div>
                    <Label>Occupancy</Label>
                    <div className="grid grid-cols-3 gap-1 mt-1">
                      {['owner', 'tenant', 'vacant'].map(o => (
                        <Button key={o} type="button" variant={occupancy === o ? 'default' : 'outline'} className="h-9 text-xs capitalize" onClick={() => setOccupancy(o)}>{o}</Button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Access Issues</Label>
                  <Textarea value={accessIssues} onChange={e => setAccessIssues(e.target.value)} placeholder="Any access challenges..." rows={2} className="mt-1" />
                </div>
                <div>
                  <Label>Safety Hazards</Label>
                  <Textarea value={safetyHazards} onChange={e => setSafetyHazards(e.target.value)} placeholder="Any safety hazards observed..." rows={2} className="mt-1" />
                </div>
                <div>
                  <Label>Customer Concerns</Label>
                  <Textarea value={customerConcerns} onChange={e => setCustomerConcerns(e.target.value)} placeholder="What concerns has the customer expressed?" rows={3} className="mt-1" />
                </div>
                <div>
                  <Label>Inspection Level</Label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {INSPECTION_LEVELS.map(lvl => (
                      <Button key={lvl.value} type="button" variant={inspectionLevel === lvl.value ? 'default' : 'outline'} className="h-auto py-3 flex flex-col items-center gap-1" onClick={() => setInspectionLevel(lvl.value)}>
                        <span className="font-semibold">{lvl.label}</span>
                        <span className="text-[10px] text-muted-foreground leading-tight">{lvl.description}</span>
                      </Button>
                    ))}
                  </div>
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setInspectionAuth(!inspectionAuth)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setInspectionAuth(!inspectionAuth); } }}
                  className={`flex items-start gap-3 p-4 rounded-lg w-full text-left transition-colors border-2 cursor-pointer ${inspectionAuth ? 'bg-green-50 border-green-400 dark:bg-green-950 dark:border-green-700' : 'bg-amber-50 border-amber-300 dark:bg-amber-950 dark:border-amber-700'}`}
                >
                  <Checkbox
                    checked={inspectionAuth}
                    onCheckedChange={(checked) => setInspectionAuth(!!checked)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                      Inspection Authorization Confirmed
                    </p>
                    <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                      I confirm that the customer has authorized today's inspection. The customer has granted permission to perform the requested inspection.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Section 2: Property Documentation */}
            {currentSectionKey === 'property_documentation' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Property Documentation</h2>
                <p className="text-xs text-muted-foreground">Photos captured here populate all downstream reports automatically. These will never be asked again in Interior or Exterior inspections.</p>
                <div className="space-y-4">
                  {photoFields.map(field => (
                    <div key={field.key}>
                      <div className="flex items-center gap-2">
                        <Label>{field.label}</Label>
                        {field.required && <span className="text-destructive text-xs">*</span>}
                        {field.getter && (
                          <div className="flex gap-1 ml-auto">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => document.getElementById(`photo-${field.key}-retake`)?.click()}>
                              Retake
                            </Button>
                          </div>
                        )}
                      </div>
                      <input
                        id={`photo-${field.key}-retake`}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handlePhotoUpload(file, field.setter, field.key);
                        }}
                      />
                      {field.getter ? (
                        <div className="relative mt-1">
                          <img src={field.getter} alt={field.label} className="w-full h-48 object-cover rounded-lg" />
                          <Button
                            size="sm"
                            variant="secondary"
                            className="absolute top-2 right-2"
                            onClick={() => document.getElementById(`photo-${field.key}-retake`)?.click()}
                          >
                            <Camera className="w-3 h-3 mr-1" /> Replace
                          </Button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors mt-1">
                          <Camera className="w-8 h-8 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Tap to capture {field.label}</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) handlePhotoUpload(file, field.setter, field.key);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
                <div>
                  <Label>Building Overview Notes</Label>
                  <Textarea value={buildingOverviewNotes} onChange={e => setBuildingOverviewNotes(e.target.value)} placeholder="General building observations, condition, etc..." rows={4} className="mt-1" />
                </div>
              </div>
            )}

            {/* Section 3: Inspection Scope */}
            {currentSectionKey === 'inspection_scope' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Inspection Scope</h2>
                <p className="text-xs text-muted-foreground">Select which inspection modules will be completed. Only selected modules will launch.</p>
                <div className="space-y-2">
                  {SELECTABLE_MODULES.map(mod => {
                    const checked = selectedModules.includes(mod.key);
                    return (
                      <div
                        key={mod.key}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleModule(mod.key)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleModule(mod.key); } }}
                        className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all w-full text-left ${checked ? 'border-violet-400 bg-violet-50' : 'border-border hover:bg-muted/50'}`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleModule(mod.key)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-muted-foreground">{mod.short.slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{mod.label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {selectedModules.length > 0 && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-medium text-green-800">{selectedModules.length} module{selectedModules.length > 1 ? 's' : ''} selected</p>
                    <p className="text-xs text-green-700 mt-1">Inspection flow: Setup → {selectedModules.map(m => SELECTABLE_MODULES.find(s => s.key === m)?.short).join(' → ')} → Complete</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      {selectedJobId && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-background border-t p-4 flex items-center gap-3">
          <Button variant="outline" onClick={goBack} className="h-12 text-destructive border-destructive/30 hover:bg-destructive/10">
            Cancel
          </Button>
          <Button variant="outline" onClick={() => setCurrentSection(s => Math.max(0, s - 1))} disabled={currentSection === 0} className="h-12">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={handleSaveDraft} disabled={saving} className="h-12">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Save
          </Button>
          {currentSection < SECTIONS.length - 1 ? (
            <Button onClick={() => setCurrentSection(s => s + 1)} className="h-12 bg-violet-600 hover:bg-violet-700 text-white">
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={completing} className="h-12 bg-green-600 hover:bg-green-700 text-white">
              {completing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              Complete Setup
            </Button>
          )}
        </div>
      )}
    </div>
  );
}