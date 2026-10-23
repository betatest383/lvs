import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, Loader2, MapPin } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import TruckAssignmentField from '@/components/jobs/TruckAssignmentField';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

function SearchSelect({ value, options, placeholder, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={selected ? '' : 'text-muted-foreground'}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map(opt => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => { onChange(opt.value); setOpen(false); }}
                >
                  <Check className={cn('mr-1 h-4 w-4', value === opt.value ? 'opacity-100' : 'opacity-0')} />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function JobFormDialog({ open, onOpenChange, title, initialData, customers, techs, onSave }) {
  const [data, setData] = useState(initialData || {});
  const [locations, setLocations] = useState([]);
  const [loadingLocs, setLoadingLocs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trucks, setTrucks] = useState([]);
  const [truckData, setTruckData] = useState({
    assigned_truck_id: '',
    auto_assigned_truck: '',
    truck_assignment_source: 'none',
    truck_assignment_status: 'Not Required',
    truck_override_used: false,
    truck_override_reason: '',
    truck_override_by: '',
    truck_override_at: '',
  });

  useEffect(() => {
    const normalized = { ...(initialData || {}) };
    if (normalized.service_date) {
      normalized.service_date = String(normalized.service_date).split('T')[0];
    }
    if (normalized.appointment_date) {
      normalized.appointment_date = String(normalized.appointment_date).split('T')[0];
    }
    if (!normalized.technician_emails && normalized.technician_email) {
      normalized.technician_emails = [normalized.technician_email];
    }
    setData(normalized);
    setLocations([]);
    setTruckData({
      assigned_truck_id: normalized.assigned_truck_id || '',
      auto_assigned_truck: normalized.auto_assigned_truck || '',
      truck_assignment_source: normalized.truck_assignment_source || 'none',
      truck_assignment_status: normalized.truck_assignment_status || 'Not Required',
      truck_override_used: normalized.truck_override_used || false,
      truck_override_reason: normalized.truck_override_reason || '',
      truck_override_by: normalized.truck_override_by || '',
      truck_override_at: normalized.truck_override_at || '',
    });
  }, [initialData, open]);

  useEffect(() => {
    base44.entities.TruckProfile.list('-created_date', 100)
      .then(recs => setTrucks(recs.filter(t => t.status === 'Active' || t.status === 'Shared Pool')))
      .catch(() => setTrucks([]));
  }, []);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, initialData]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const updateField = (key, value) => { setData(prev => ({ ...prev, [key]: value })); setIsDirty(true); };

  const selectedCustomer = (customers || []).find(c => c.id === data.customer_id);

  useEffect(() => {
    if (!selectedCustomer) {
      setLocations([]);
      return;
    }
    const linkKey = selectedCustomer.customer_number || selectedCustomer.id;
    setLoadingLocs(true);
    base44.entities.Location.filter({ customer_id: linkKey })
      .then(locs => setLocations(locs.filter(l => l.is_active !== false)))
      .catch(() => setLocations([]))
      .finally(() => setLoadingLocs(false));
  }, [data.customer_id, selectedCustomer]);

  const handleCustomerChange = (customerId) => {
    setData(prev => ({
      ...prev,
      customer_id: customerId,
      location_id: '',
      address: '',
      city: '',
      state: '',
      zip: '',
    }));
    setIsDirty(true);
  };

  const handleLocationChange = (locationId) => {
    const loc = locations.find(l => l.id === locationId);
    if (loc) {
      setData(prev => ({
        ...prev,
        location_id: locationId,
        address: loc.address || prev.address,
        city: loc.city || prev.city,
        state: loc.state || prev.state,
        zip: loc.zip || prev.zip,
      }));
      setIsDirty(true);
    } else {
      updateField('location_id', '');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const selectedTruck = trucks.find(t => t.id === truckData.assigned_truck_id);
    await onSave({
      ...data,
      assigned_truck_id: truckData.assigned_truck_id || '',
      assigned_truck_number: selectedTruck?.truck_number || truckData.auto_assigned_truck || '',
      auto_assigned_truck: truckData.auto_assigned_truck || '',
      truck_assignment_source: truckData.truck_assignment_source || 'none',
      truck_assignment_status: truckData.truck_assignment_status || 'Not Required',
      truck_override_used: truckData.truck_override_used || false,
      truck_override_reason: truckData.truck_override_reason || '',
      truck_override_by: truckData.truck_override_by || '',
      truck_override_at: truckData.truck_override_at || '',
    });
    setSaving(false);
    onOpenChange(false);
  };

  const customerOptions = (customers || []).map(c => ({
    value: c.id,
    label: c.name + (c.customer_number ? ` (#${c.customer_number})` : ''),
  }));

  const locationOptions = locations.map(l => ({
    value: l.id,
    label: l.name || `${l.address || ''}${l.city ? ', ' + l.city : ''}`,
  }));

  const techOptions = (techs || []).map(t => ({
    value: t.email,
    label: t.full_name || t.email,
  }));

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleCloseAttempt(); else onOpenChange(v); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title || 'Job'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Customer */}
            <div className="grid gap-2">
              <Label>Customer *</Label>
              <SearchSelect
                value={data.customer_id || ''}
                options={customerOptions}
                placeholder="Select customer..."
                onChange={handleCustomerChange}
              />
            </div>

            {/* Location */}
            {selectedCustomer && (
              <div className="grid gap-2">
                <Label className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> Service Location
                  {loadingLocs && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                </Label>
                <SearchSelect
                  value={data.location_id || ''}
                  options={locationOptions}
                  placeholder={locationOptions.length ? 'Select location...' : 'No saved locations'}
                  onChange={handleLocationChange}
                />
              </div>
            )}

            {/* Address */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="md:col-span-3 grid gap-2">
                <Label>Address</Label>
                <Input value={data.address || ''} onChange={e => updateField('address', e.target.value)} />
              </div>
              <div className="md:col-span-2 grid gap-2">
                <Label>City</Label>
                <Input value={data.city || ''} onChange={e => updateField('city', e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>State</Label>
                <Input value={data.state || ''} onChange={e => updateField('state', e.target.value)} />
              </div>
              <div className="md:col-span-1 grid gap-2">
                <Label>Zip</Label>
                <Input value={data.zip || ''} onChange={e => updateField('zip', e.target.value)} />
              </div>
            </div>

            {/* Job Type / Status / Priority */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label>Job Type</Label>
                <Select value={data.job_type || ''} onValueChange={(v) => updateField('job_type', v)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inspection">Inspection</SelectItem>
                    <SelectItem value="cleaning">Cleaning</SelectItem>
                    <SelectItem value="repair">Repair</SelectItem>
                    <SelectItem value="installation">Installation</SelectItem>
                    <SelectItem value="estimate">Estimate</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={data.status || 'scheduled'} onValueChange={(v) => updateField('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="inspection_complete">Inspection Complete</SelectItem>
                    <SelectItem value="estimate_sent">Estimate Sent</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="invoiced">Invoiced</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Priority</Label>
                <Select value={data.priority || 'normal'} onValueChange={(v) => updateField('priority', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label>Service Date</Label>
                <Input type="date" value={data.service_date || ''} onChange={e => updateField('service_date', e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Arrival Window Start</Label>
                <Input type="time" value={data.arrival_window_start || ''} onChange={e => updateField('arrival_window_start', e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Arrival Window End</Label>
                <Input type="time" value={data.arrival_window_end || ''} onChange={e => updateField('arrival_window_end', e.target.value)} />
              </div>
            </div>

            {/* Technicians */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Lead Technician</Label>
                <SearchSelect
                  value={data.lead_technician_email || ''}
                  options={techOptions}
                  placeholder="Select lead..."
                  onChange={(v) => updateField('lead_technician_email', v)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Apprentice</Label>
                <SearchSelect
                  value={data.apprentice_email || ''}
                  options={techOptions}
                  placeholder="Select apprentice..."
                  onChange={(v) => updateField('apprentice_email', v)}
                />
              </div>
            </div>

            {/* Truck */}
            <TruckAssignmentField
              trucks={trucks}
              value={truckData}
              onChange={(next) => { setTruckData(next); setIsDirty(true); }}
            />

            {/* Notes */}
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={data.notes || ''}
                onChange={e => updateField('notes', e.target.value)}
                placeholder="Any extra details..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleCloseAttempt()} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !data.customer_id}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Save Job'}
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