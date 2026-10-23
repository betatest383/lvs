import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useInspectionReturn } from '@/hooks/useInspectionReturn';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, CheckCircle2, ArrowRight, Loader2, ClipboardCheck, Home, TreePine, Warehouse, CloudSun, ArrowDownToLine, Flame, Layers, Building2, MoreHorizontal } from 'lucide-react';
import { SELECTABLE_MODULES, computeModuleProgress, getInspectionFlow } from '@/lib/inspectionModules';
import moment from 'moment';

const ICON_MAP = { ClipboardCheck, Home, TreePine, Warehouse, CloudSun, ArrowDownToLine, Flame, Layers, Building2, MoreHorizontal };

const fmtDate = (d) => d ? moment.utc(d).format('MMM D, YYYY') : '';

export default function InspectionLanding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetJobId = searchParams.get('job_id');
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(presetJobId || '');
  const { goBack } = useInspectionReturn(selectedJobId);
  const [selectedJob, setSelectedJob] = useState(null);
  const [setup, setSetup] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      base44.entities.Job.filter({ status: 'scheduled' }, '-service_date'),
      base44.entities.Job.filter({ status: 'in_progress' }, '-service_date'),
      base44.entities.Job.filter({ status: 'inspection_complete' }, '-service_date'),
    ]).then(([scheduled, inProgress, inspectionComplete]) => {
      setJobs([...scheduled, ...inProgress, ...inspectionComplete]);
    });
  }, []);

  useEffect(() => {
    if (presetJobId) setSelectedJobId(presetJobId);
  }, [presetJobId]);

  useEffect(() => {
    if (!selectedJobId) return;
    const job = jobs.find(j => j.id === selectedJobId);
    setSelectedJob(job || null);
    setLoading(true);
    base44.entities.InspectionSetup.filter({ job_id: selectedJobId }).then(setups => {
      setSetup(setups.length > 0 ? setups[0] : null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selectedJobId, jobs]);

  const setupComplete = setup?.status === 'complete';
  const selectedModules = setup?.selected_modules || [];
  const progress = computeModuleProgress(setup);
  const flow = getInspectionFlow(selectedModules);

  const getModuleRoute = (modKey) => {
    if (modKey === 'inspection_setup') return '/tech/inspection-setup';
    if (modKey === 'interior') return '/tech/inspection';
    if (modKey === 'exterior') return '/tech/exterior-inspection';
    return null;
  };

  const getModuleStatus = (modKey) => {
    if (modKey === 'inspection_setup') return setupComplete ? 'complete' : (setup ? 'in_progress' : 'pending');
    if (!setupComplete) return 'locked';
    if (!selectedModules.includes(modKey)) return 'not_selected';
    return progress[modKey] || 'pending';
  };

  return (
    <div className="max-w-md mx-auto space-y-6 pt-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inspection Workflow</h1>
        <p className="text-muted-foreground mt-1">Complete Setup, then launch selected modules</p>
      </div>

      {!selectedJobId && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 space-y-3">
            <p className="font-medium">Select a Job</p>
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

      {selectedJobId && (
        <>
          {selectedJob && (
            <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
              <p><span className="font-medium">Customer:</span> {selectedJob.customer_name}</p>
              <p><span className="font-medium">Address:</span> {selectedJob.address}</p>
              <p><span className="font-medium">Date:</span> {fmtDate(selectedJob.service_date)}</p>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {setup && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Overall Progress</span>
                    <span>{progress.overall}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full transition-all duration-300" style={{ width: `${progress.overall}%` }} />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {flow.map((step, idx) => {
                  const isSetup = step.key === 'inspection_setup';
                  const isComplete = step.key === 'complete';
                  const status = isComplete ? (progress.overall === 100 ? 'complete' : 'pending') : getModuleStatus(step.key);
                  const route = isSetup ? '/tech/inspection-setup' : getModuleRoute(step.key);
                  const isLocked = status === 'locked';
                  const isComplete2 = status === 'complete';
                  const isNotSelected = status === 'not_selected';
                  const mod = isSetup ? SELECTABLE_MODULES[0] : isComplete ? null : SELECTABLE_MODULES.find(m => m.key === step.key);
                  const Icon = mod ? (ICON_MAP[mod.icon] || Home) : CheckCircle2;

                  return (
                    <div key={step.key}>
                      {idx > 0 && (
                        <div className="flex justify-center -my-1">
                          <div className={`w-0.5 h-4 ${flow[idx - 1] && getModuleStatus(flow[idx - 1].key) === 'complete' ? 'bg-green-400' : 'bg-muted-foreground/20'}`} />
                        </div>
                      )}
                      {isComplete ? (
                        <Card className={`border-2 ${progress.overall === 100 ? 'border-green-300 bg-green-50' : 'border-dashed border-muted'}`}>
                          <CardContent className="p-4 flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${progress.overall === 100 ? 'bg-green-500' : 'bg-muted'}`}>
                              <CheckCircle2 className={`w-5 h-5 ${progress.overall === 100 ? 'text-white' : 'text-muted-foreground'}`} />
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">{step.label}</p>
                              <p className="text-xs text-muted-foreground">{progress.overall === 100 ? 'All modules complete' : 'Complete remaining modules'}</p>
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <Card className={`border-2 transition-all ${isLocked ? 'border-muted opacity-60' : isComplete2 ? 'border-green-300 bg-green-50' : isNotSelected ? 'border-muted opacity-40' : 'border-violet-300 hover:shadow-md'} ${!isLocked && !isNotSelected ? 'cursor-pointer' : ''}`}
                          onClick={() => {
                            if (isLocked || isNotSelected || !route) return;
                            navigate(`${route}?job_id=${selectedJobId}`);
                          }}
                        >
                          <CardContent className="p-4 flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isComplete2 ? 'bg-green-500' : isLocked ? 'bg-muted' : isNotSelected ? 'bg-muted' : mod?.accent || 'bg-violet-500'}`}>
                              {isLocked ? <Lock className="w-5 h-5 text-muted-foreground" /> : isComplete2 ? <CheckCircle2 className="w-5 h-5 text-white" /> : <Icon className="w-5 h-5 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium">{step.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {isLocked ? 'Complete Inspection Setup first' : isComplete2 ? 'Completed' : isNotSelected ? 'Not selected' : isSetup ? 'Required before inspection' : 'Tap to start'}
                              </p>
                            </div>
                            {!isLocked && !isNotSelected && !isComplete2 && route && (
                              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  );
                })}
              </div>

              {!setupComplete && (
                <Button className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => navigate(`/tech/inspection-setup?job_id=${selectedJobId}`)}>
                  <ClipboardCheck className="w-4 h-4 mr-2" />
                  {setup ? 'Continue Inspection Setup' : 'Start Inspection Setup'}
                </Button>
              )}
            </>
          )}
        </>
      )}

      <Button variant="outline" className="w-full" onClick={goBack}>
        Cancel
      </Button>
    </div>
  );
}