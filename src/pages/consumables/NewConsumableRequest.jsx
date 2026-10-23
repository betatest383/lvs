import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, ChevronDown, ChevronRight, Save, Send, ChevronLeft, Clock, Truck, Search, ClipboardList, User, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import { CONSUMABLE_CATEGORIES } from '@/lib/consumableCatalog';
import QuantityStepper from '@/components/consumables/QuantityStepper';
import PhotoUploadField from '@/components/warehouse/PhotoUploadField';

export default function NewConsumableRequest() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetJobId = searchParams.get('jobId');
  const [user, setUser] = useState(null);
  const [truckNumber, setTruckNumber] = useState('');
  const [quantities, setQuantities] = useState({});
  const [expanded, setExpanded] = useState({});
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [catalogItems, setCatalogItems] = useState([]);

  // Job selection
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobSearch, setJobSearch] = useState('');
  const [loadingJobs, setLoadingJobs] = useState(false);

  const topRef = useRef(null);

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);
      try {
        const techs = await base44.entities.WarehouseTechnician.filter({ name: me.full_name });
        if (techs.length > 0 && techs[0].truck_number) setTruckNumber(techs[0].truck_number);
      } catch {}
      try {
        const catalog = await base44.entities.ConsumableCatalog.filter({ status: 'Active', is_active: true }, 'item_name', 500);
        setCatalogItems(catalog);
      } catch {}
      // Load jobs
      setLoadingJobs(true);
      try {
        const jobList = await base44.entities.Job.list('-service_date', 200);
        setJobs(jobList || []);
        if (presetJobId) {
          const preset = (jobList || []).find(j => j.id === presetJobId);
          if (preset) setSelectedJob(preset);
        }
      } catch {}
    } catch {
      toast.error('Failed to load user info');
    } finally {
      setLoading(false);
      setLoadingJobs(false);
    }
  };

  const filteredJobs = jobs.filter(j => {
    if (!jobSearch) return true;
    const q = jobSearch.toLowerCase();
    return (j.customer_name || '').toLowerCase().includes(q) ||
           (j.crm_job_number || '').toLowerCase().includes(q) ||
           (j.address || '').toLowerCase().includes(q);
  });

  const handleSelectJob = (job) => {
    setSelectedJob(job);
    // Auto-inherit technician and truck from job
    if (job.technician_name) {
      // Truck number may come from the technician assignment
    }
    if (job.technician_email) {
      try {
        const techs = base44.entities.WarehouseTechnician.filter({ name: job.technician_name });
        techs.then(results => {
          if (results.length > 0 && results[0].truck_number) setTruckNumber(results[0].truck_number);
        });
      } catch {}
    }
  };

  // Build categories from live catalog; fall back to static catalog if no inventory items exist
  const catalogCategories = catalogItems.length > 0
    ? Array.from(new Set(catalogItems.map(i => i.category).filter(Boolean)))
        .map(catName => ({
          name: catName,
          items: catalogItems
            .filter(i => i.category === catName)
            .map(i => ({ name: i.item_name, unit: i.unit, consumable_catalog_id: i.id, quantity_on_hand: i.quantity_on_hand || 0 })),
        }))
    : CONSUMABLE_CATEGORIES;

  const setQty = (name, qty) => setQuantities(prev => ({ ...prev, [name]: qty }));
  const toggle = (cat) => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }));

  const selectedItems = () => {
    const items = [];
    catalogCategories.forEach(cat => {
      cat.items.forEach(item => {
        const qty = quantities[item.name] || 0;
        if (qty > 0) items.push({
          category: cat.name,
          item_name: item.name,
          unit: item.unit,
          quantity: qty,
          consumable_catalog_id: item.consumable_catalog_id || null,
        });
      });
    });
    return items;
  };

  const totalQty = Object.values(quantities).reduce((s, q) => s + q, 0);

  const generateRequestId = async () => {
    try {
      const recs = await base44.entities.ConsumableReplenishment.list('-created_date', 1);
      let next = 1;
      if (recs.length > 0 && recs[0].request_id) {
        const m = recs[0].request_id.match(/CR-(\d+)/);
        if (m) next = parseInt(m[1]) + 1;
      }
      return `CR-${String(next).padStart(6, '0')}`;
    } catch {
      return `CR-${Date.now().toString().slice(-6)}`;
    }
  };

  const handleSubmit = async (isDraft) => {
    if (!selectedJob) { toast.error('Please select a job'); return; }
    if (!isDraft && totalQty === 0) { toast.error('Add at least one item'); return; }

    setSubmitting(true);
    try {
      const requestId = await generateRequestId();
      const now = new Date().toISOString();
      const items = selectedItems();
      await base44.entities.ConsumableReplenishment.create({
        request_id: requestId,
        workflow_id: 'WF-WH-102',
        job_id: selectedJob.id,
        job_number: selectedJob.crm_job_number || '',
        customer_name: selectedJob.customer_name || '',
        customer_id: selectedJob.customer_id || '',
        job_address: selectedJob.address || '',
        city: selectedJob.city || '',
        state: selectedJob.state || '',
        zip: selectedJob.zip || '',
        technician: selectedJob.technician_name || user?.full_name || '',
        technician_email: selectedJob.technician_email || user?.email || '',
        truck_number: truckNumber,
        date: now.split('T')[0],
        submitted_time: isDraft ? null : now,
        items: JSON.stringify(items),
        additional_notes: notes,
        photo_url: photoUrl,
        status: isDraft ? 'Draft' : 'Submitted',
        total_items: items.length,
        total_quantity: totalQty,
        related_sop_id: 'WH-102',
        related_business_process: 'BP-101',
      });
      toast.success(isDraft ? 'Draft saved' : 'Replenishment request submitted');
      navigate('/consumables');
    } catch (err) {
      toast.error('Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentTime = moment().format('h:mm A');
  const today = moment().format('MMM D, YYYY');
  const fmtJobDate = (d) => d ? moment.utc(d).format('MMM D, YYYY') : '';

  return (
    <div ref={topRef} className="max-w-2xl mx-auto pb-32">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Consumable Replenishment</h1>
          <p className="text-xs text-muted-foreground">WH-102 | WF-WH-102</p>
        </div>
      </div>

      {/* Job Selection — Required */}
      <Card className="mb-4 border-accent/30">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-accent" />
            <Label className="text-sm font-semibold">Job (Required)</Label>
          </div>
          {selectedJob ? (
            <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{selectedJob.customer_name || 'Unknown Customer'}</p>
                  <p className="text-xs text-muted-foreground">{selectedJob.address}{selectedJob.city ? `, ${selectedJob.city}` : ''}{selectedJob.state ? `, ${selectedJob.state}` : ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium">{selectedJob.crm_job_number || '\u2014'}</p>
                  <p className="text-xs text-muted-foreground">{fmtJobDate(selectedJob.service_date)}</p>
                </div>
              </div>
              {selectedJob.technician_name && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="w-3 h-3" /> {selectedJob.technician_name}
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelectedJob(null)} className="text-xs h-7">
                Change Job
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
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
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                  {filteredJobs.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-4">No jobs found</p>
                  ) : filteredJobs.slice(0, 20).map(job => (
                    <button
                      key={job.id}
                      onClick={() => handleSelectJob(job)}
                      className="w-full text-left p-2.5 rounded-lg border transition-colors hover:border-accent"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm">{job.customer_name || 'Unknown Customer'}</p>
                          <p className="text-xs text-muted-foreground">{job.address}{job.city ? `, ${job.city}` : ''}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-medium">{job.crm_job_number || '\u2014'}</p>
                          <p className="text-xs text-muted-foreground">{fmtJobDate(job.service_date)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Technician</Label>
              <p className="font-semibold text-sm">{selectedJob?.technician_name || user?.full_name || '\u2014'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Date / Time</Label>
              <p className="font-semibold text-sm">{today} · {currentTime}</p>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Truck Number</Label>
            <Input value={truckNumber} onChange={e => setTruckNumber(e.target.value)} placeholder="Enter truck number" className="mt-1" />
          </div>
        </CardContent>
      </Card>

      {catalogCategories.map(cat => {
        const isOpen = expanded[cat.name];
        const catQty = cat.items.reduce((s, item) => s + (quantities[item.name] || 0), 0);
        return (
          <Card key={cat.name} className="mb-2 overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(cat.name)}
              className="w-full flex items-center justify-between p-3.5 active:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <span className="font-semibold text-sm">{cat.name}</span>
                {catQty > 0 && (
                  <span className="bg-primary text-primary-foreground text-xs font-bold rounded-full px-2 py-0.5">{catQty}</span>
                )}
              </div>
            </button>
            {isOpen && (
              <div className="divide-y divide-border">
                {cat.items.map(item => (
                  <div key={item.name} className="flex items-center justify-between p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.unit}
                        {item.quantity_on_hand != null && (
                          <span className={`ml-1.5 ${(quantities[item.name] || 0) > item.quantity_on_hand ? 'text-red-600 font-medium' : ''}`}>
                            · Stock: {item.quantity_on_hand}
                          </span>
                        )}
                      </p>
                    </div>
                    <QuantityStepper value={quantities[item.name] || 0} onChange={qty => setQty(item.name, qty)} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      <Card className="mb-4 mt-3">
        <CardContent className="p-4 space-y-3">
          <div>
            <Label className="text-sm font-semibold">Additional Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." className="mt-1" rows={2} />
          </div>
          <div>
            <Label className="text-sm font-semibold">Photo Upload (Optional)</Label>
            <div className="mt-1">
              <PhotoUploadField value={photoUrl} onChange={setPhotoUrl} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-3 pb-safe z-50 max-w-2xl mx-auto">
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => handleSubmit(true)} disabled={submitting || !selectedJob}>
            <Save className="w-4 h-4" /> Save Draft
          </Button>
          <Button className="flex-1" onClick={() => handleSubmit(false)} disabled={submitting || !selectedJob}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Submit Request
          </Button>
        </div>
        {!selectedJob && (
          <p className="text-center text-xs text-amber-600 mt-2">Select a job to continue</p>
        )}
        {totalQty > 0 && (
          <p className="text-center text-xs text-muted-foreground mt-2">
            {selectedItems().length} item type{selectedItems().length !== 1 ? 's' : ''} · {totalQty} total unit{totalQty !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}