import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Search, Plus, Trash2, ChevronRight, ChevronLeft, CheckCircle2, MapPin, Truck, User, Package, ClipboardList, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useAuth } from '@/lib/AuthContext';

const STEPS = [
  { num: 1, label: 'Select Job', icon: ClipboardList },
  { num: 2, label: 'Select Technician', icon: User },
  { num: 3, label: 'Confirm Details', icon: MapPin },
  { num: 4, label: 'Add Items & Quantities', icon: Package },
  { num: 5, label: 'Review & Create', icon: CheckCircle2 },
];

export default function MaterialTransferWizard({ open, onOpenChange, onCreated, contextJob }) {
  const { technicians } = useTechnicians();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1: Job
  const [jobs, setJobs] = useState([]);
  const [jobSearch, setJobSearch] = useState('');
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);

  // Step 2: Technician
  const [selectedTech, setSelectedTech] = useState(null);

  // Step 4: Items
  const [lineItems, setLineItems] = useState([]);
  const [invSearch, setInvSearch] = useState('');
  const [invResults, setInvResults] = useState([]);
  const [searchingInv, setSearchingInv] = useState(false);

  // Notes
  const [notes, setNotes] = useState('');
  const [jobChangedFromContext, setJobChangedFromContext] = useState(false);

  useEffect(() => {
    if (open) {
      setJobChangedFromContext(false);
      setLineItems([]);
      setJobSearch('');
      setInvSearch('');
      setNotes('');

      if (contextJob) {
        setSelectedJob(contextJob);
        const jobTechEmail = contextJob.technician_email;
        if (jobTechEmail) {
          const match = technicians.find(t => t.email === jobTechEmail);
          if (match) {
            setSelectedTech(match);
            setStep(4);
          } else {
            setSelectedTech(null);
            setStep(2);
          }
        } else {
          setSelectedTech(null);
          setStep(2);
        }
      } else {
        setStep(1);
        setSelectedJob(null);
        setSelectedTech(null);
      }
    }
  }, [open, contextJob]);

  // Auto-select tech when technicians load late
  useEffect(() => {
    if (open && contextJob && selectedJob && !selectedTech && technicians.length > 0 && step === 2) {
      const match = technicians.find(t => t.email === contextJob.technician_email);
      if (match) {
        setSelectedTech(match);
        setStep(4);
      }
    }
  }, [technicians, open, contextJob, selectedJob, selectedTech, step]);

  // Load jobs
  useEffect(() => {
    if (open && jobs.length === 0) {
      setLoadingJobs(true);
      base44.entities.Job.list('-service_date', 200)
        .then(setJobs)
        .finally(() => setLoadingJobs(false));
    }
  }, [open]);

  // Debounced inventory search
  const searchInventory = useCallback(async (query) => {
    if (!query || query.length < 2) { setInvResults([]); return; }
    setSearchingInv(true);
    try {
      const results = await base44.entities.InventoryMaster.filter(
        { item_name: { $regex: query, $options: 'i' }, status: 'Active', is_active: true },
        '-item_name',
        20
      );
      setInvResults(results || []);
    } catch {
      setInvResults([]);
    } finally {
      setSearchingInv(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchInventory(invSearch), 300);
    return () => clearTimeout(timer);
  }, [invSearch]);

  const filteredJobs = jobs.filter(j => {
    if (!jobSearch) return true;
    const q = jobSearch.toLowerCase();
    return (j.customer_name || '').toLowerCase().includes(q) ||
           (j.crm_job_number || '').toLowerCase().includes(q) ||
           (j.address || '').toLowerCase().includes(q);
  });

  const handleSelectJob = (job) => {
    setSelectedJob(job);
    // Try to auto-select technician from job
    const jobTechEmail = job.technician_email;
    if (jobTechEmail) {
      const match = technicians.find(t => t.email === jobTechEmail);
      if (match) setSelectedTech(match);
    }
    setStep(2);
  };

  const handleSelectTech = (tech) => {
    setSelectedTech(tech);
    setStep(3);
  };

  const canChangeJob = !!contextJob && user?.role === 'admin';

  const handleChangeJob = () => {
    setSelectedJob(null);
    setSelectedTech(null);
    setStep(1);
    setJobChangedFromContext(true);
    setJobSearch('');
  };

  const handleAddItem = (item) => {
    if (lineItems.find(li => li.inventory_master_id === item.id)) {
      toast.warning('Item already added');
      return;
    }
    setLineItems(prev => [...prev, {
      inventory_master_id: item.id,
      sku: item.sku || '',
      item_name: item.item_name || '',
      quantity_requested: 1,
      quantity_available: item.quantity_available || 0,
      quantity_reserved: item.quantity_reserved || 0,
      warehouse_location: item.warehouse_location || '',
      bin_location: item.bin_location || '',
      unit_cost: item.unit_cost || 0,
      unit: item.unit || 'ea',
    }]);
    setInvSearch('');
    setInvResults([]);
  };

  const handleUpdateQty = (idx, qty) => {
    setLineItems(prev => prev.map((li, i) => {
      if (i !== idx) return li;
      const numQty = Number(qty) || 0;
      return { ...li, quantity_requested: numQty };
    }));
  };

  const handleRemoveItem = (idx) => {
    setLineItems(prev => prev.filter((_, i) => i !== idx));
  };

  const hasQtyErrors = lineItems.some(li => li.quantity_requested <= 0 || li.quantity_requested > li.quantity_available);
  const canProceedStep4 = lineItems.length > 0 && !hasQtyErrors;

  const handleCreate = async () => {
    setSaving(true);
    try {
      let finalNotes = notes || '';
      if (jobChangedFromContext && contextJob) {
        const auditNote = `[Audit: Job changed from ${contextJob.crm_job_number || contextJob.id} to ${selectedJob?.crm_job_number || selectedJob?.id}]`;
        finalNotes = finalNotes ? `${finalNotes}\n\n${auditNote}` : auditNote;
      }
      const response = await base44.functions.invoke('processMaterialTransfer', {
        action: 'create',
        job_id: selectedJob?.id || null,
        job_number: selectedJob?.crm_job_number || null,
        customer_name: selectedJob?.customer_name || null,
        customer_id: selectedJob?.customer_id || null,
        job_address: selectedJob?.address || null,
        city: selectedJob?.city || null,
        state: selectedJob?.state || null,
        zip: selectedJob?.zip || null,
        technician: selectedTech?.name || null,
        technician_id: selectedTech?.id || null,
        technician_email: selectedTech?.email || null,
        truck_number: selectedTech?.truck_number || null,
        truck_id: null,
        line_items: lineItems,
        notes: finalNotes || null,
      });

      if (response.data?.error) {
        toast.error(response.data.error);
        setSaving(false);
        return;
      }

      toast.success(`Material transfer ${response.data?.transfer_id || ''} created — inventory reserved`);
      onCreated();
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to create material transfer');
    } finally {
      setSaving(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return selectedJob !== null;
      case 2: return selectedTech !== null;
      case 3: return true;
      case 4: return canProceedStep4;
      case 5: return true;
      default: return false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Material Transfer</DialogTitle>
        </DialogHeader>

        {/* Job context header */}
        {selectedJob && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Creating Material Transfer For</p>
              {contextJob && (
                canChangeJob ? (
                  <button onClick={handleChangeJob} className="text-xs text-blue-600 hover:underline">
                    Change Job
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Job locked
                  </span>
                )
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <div><span className="text-muted-foreground">Job #:</span> <span className="font-medium">{selectedJob.crm_job_number || '\u2014'}</span></div>
              <div><span className="text-muted-foreground">Scheduled Date:</span> <span className="font-medium">{selectedJob.service_date || '\u2014'}</span></div>
              <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{selectedJob.customer_name || '\u2014'}</span></div>
              <div><span className="text-muted-foreground">Technician:</span> <span className="font-medium">{selectedTech?.name || selectedJob.technician_name || '\u2014'}</span></div>
              <div className="col-span-2"><span className="text-muted-foreground">Address:</span> <span className="font-medium">{selectedJob.address}{selectedJob.city ? `, ${selectedJob.city}` : ''}{selectedJob.state ? `, ${selectedJob.state}` : ''} {selectedJob.zip || ''}</span></div>
              <div><span className="text-muted-foreground">Truck:</span> <span className="font-medium">{selectedTech?.truck_number ? `#${selectedTech.truck_number}` : '\u2014'}</span></div>
            </div>
          </div>
        )}

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center gap-1 flex-shrink-0">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${step === s.num ? 'bg-accent text-accent-foreground' : step > s.num ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                <s.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{s.num}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
            </div>
          ))}
        </div>

        {/* Step 1: Select Job */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer name, job number, or address..."
                value={jobSearch}
                onChange={e => setJobSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {loadingJobs ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredJobs.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">No jobs found</p>
                ) : filteredJobs.map(job => (
                  <button
                    key={job.id}
                    onClick={() => handleSelectJob(job)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors hover:border-accent ${selectedJob?.id === job.id ? 'border-accent bg-accent/5' : 'border-input'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{job.customer_name || 'Unknown Customer'}</p>
                        <p className="text-xs text-muted-foreground">{job.address}{job.city ? `, ${job.city}` : ''}{job.state ? `, ${job.state}` : ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium">{job.crm_job_number || '—'}</p>
                        <p className="text-xs text-muted-foreground">{job.service_date || ''}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Select Technician */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {selectedJob ? `Job: ${selectedJob.customer_name} — ${selectedJob.address}` : 'Select a technician'}
            </p>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {technicians.filter(t => t.active_status).map(tech => (
                <button
                  key={tech.id}
                  onClick={() => handleSelectTech(tech)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors hover:border-accent ${selectedTech?.id === tech.id ? 'border-accent bg-accent/5' : 'border-input'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{tech.name}</p>
                      <p className="text-xs text-muted-foreground">{tech.email}</p>
                    </div>
                    {tech.truck_number && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Truck className="w-3.5 h-3.5" /> Truck #{tech.truck_number}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            {selectedJob && selectedTech && (
              <Button onClick={() => setStep(3)} className="w-full">
                Continue <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}

        {/* Step 3: Confirm Details */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Technician</p>
                  <p className="font-medium text-sm">{selectedTech?.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Assigned Truck</p>
                  <p className="font-medium text-sm">{selectedTech?.truck_number ? `Truck #${selectedTech.truck_number}` : 'No truck assigned'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Customer & Job Address</p>
                  <p className="font-medium text-sm">{selectedJob?.customer_name || '—'}</p>
                  <p className="text-sm text-muted-foreground">{selectedJob?.address}{selectedJob?.city ? `, ${selectedJob.city}` : ''}{selectedJob?.state ? `, ${selectedJob.state}` : ''} {selectedJob?.zip || ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Job Number</p>
                  <p className="font-medium text-sm">{selectedJob?.crm_job_number || '—'}</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">These details were auto-populated from the selected job and technician.</p>
          </div>
        )}

        {/* Step 4: Add Items & Quantities */}
        {step === 4 && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search inventory by item name..."
                value={invSearch}
                onChange={e => setInvSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {searchingInv && <p className="text-xs text-muted-foreground">Searching...</p>}
            {invResults.length > 0 && (
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto rounded-lg border p-2 bg-muted/30">
                {invResults.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleAddItem(item)}
                    className="w-full text-left p-2 rounded-md hover:bg-accent/10 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.item_name}</p>
                      <p className="text-xs text-muted-foreground">{item.sku} • {item.warehouse_location} {item.bin_location ? `/ ${item.bin_location}` : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-green-600">Avail: {item.quantity_available || 0}</p>
                      <p className="text-xs text-amber-600">Res: {item.quantity_reserved || 0}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {invSearch.length >= 2 && !searchingInv && invResults.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">No items found</p>
            )}

            {/* Line items */}
            {lineItems.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">Requested Items</Label>
                {lineItems.map((li, idx) => (
                  <div key={li.inventory_master_id} className="flex items-start gap-2 p-2.5 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{li.item_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {li.sku} • {li.warehouse_location} {li.bin_location ? `/ ${li.bin_location}` : ''}
                      </p>
                      <p className="text-xs">
                        <span className="text-green-600">Avail: {li.quantity_available}</span>
                        <span className="text-amber-600 ml-2">Res: {li.quantity_reserved}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max={li.quantity_available}
                        value={li.quantity_requested}
                        onChange={e => handleUpdateQty(idx, e.target.value)}
                        className="w-20 h-8"
                      />
                      <button onClick={() => handleRemoveItem(idx)} className="text-destructive hover:bg-destructive/10 p-1 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {hasQtyErrors && (
                  <p className="text-xs text-destructive">⚠ Quantities must be between 1 and available quantity</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 5: Review & Create */}
        {step === 5 && (
          <div className="space-y-3">
            <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Technician:</span> <span className="font-medium">{selectedTech?.name}</span></div>
                <div><span className="text-muted-foreground">Truck:</span> <span className="font-medium">{selectedTech?.truck_number ? `#${selectedTech.truck_number}` : '—'}</span></div>
                <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{selectedJob?.customer_name}</span></div>
                <div><span className="text-muted-foreground">Job #:</span> <span className="font-medium">{selectedJob?.crm_job_number || '—'}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Address:</span> <span className="font-medium">{selectedJob?.address}, {selectedJob?.city}, {selectedJob?.state} {selectedJob?.zip}</span></div>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Items ({lineItems.length})</Label>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {lineItems.map(li => (
                  <div key={li.inventory_master_id} className="flex items-center justify-between p-2 rounded-md border text-sm">
                    <div>
                      <span className="font-medium">{li.item_name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{li.sku}</span>
                    </div>
                    <span className="font-medium">Qty: {li.quantity_requested} {li.unit}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Add any notes..." />
            </div>
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
              <CheckCircle2 className="w-4 h-4 inline mr-1" />
              On creation, inventory will be reserved (Available → Reserved) and the transfer status will be set to <strong>Requested</strong>.
            </div>
          </div>
        )}

        {/* Footer navigation */}
        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : onOpenChange(false)}>
              {step > 1 ? <><ChevronLeft className="w-4 h-4" /> Back</> : 'Cancel'}
            </Button>
            {step < 5 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed() && step !== 3}
              >
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Transfer
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}