import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const JOB_TYPES = [
  { value: 'inspection', label: 'Chimney Inspection' },
  { value: 'cleaning', label: 'Chimney Cleaning' },
  { value: 'repair', label: 'Repair' },
  { value: 'installation', label: 'Installation' },
  { value: 'follow_up', label: 'Follow-Up Visit' },
];

export default function BookJobPage() {
  const [selectedDate, setSelectedDate] = useState(null);
  const [jobType, setJobType] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!selectedDate) { toast.error('Please select a date'); return; }
    if (!jobType) { toast.error('Please select a service type'); return; }
    if (!address) { toast.error('Please enter your address'); return; }

    setSubmitting(true);
    const user = await base44.auth.me();

    // Find or match customer by email
    const customers = await base44.entities.Customer.filter({ email: user.email });
    let customer = customers[0];

    if (!customer) {
      customer = await base44.entities.Customer.create({
        name: user.full_name,
        email: user.email,
        address,
        city,
        state,
        zip,
      });
    }

    await base44.entities.Job.create({
      customer_id: customer.id,
      customer_name: customer.name,
      service_date: format(selectedDate, 'yyyy-MM-dd'),
      job_type: jobType,
      address,
      city,
      state,
      zip,
      notes,
      status: 'scheduled',
      priority: 'normal',
    });

    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold">Booking Confirmed!</h2>
        <p className="text-muted-foreground text-center max-w-sm">
          Your appointment has been requested for <strong>{format(selectedDate, 'MMMM d, yyyy')}</strong>. We'll be in touch to confirm.
        </p>
        <Button onClick={() => { setSubmitted(false); setSelectedDate(null); setJobType(''); setAddress(''); setCity(''); setState(''); setZip(''); setNotes(''); }} variant="outline">
          Book Another
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Book a Service</h1>
        <p className="text-muted-foreground text-sm mt-1">Schedule a chimney service appointment</p>
      </div>

      {/* Service Type */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-3">
          <Label className="text-base font-semibold">Select Service Type</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {JOB_TYPES.map(t => (
              <Button
                key={t.value}
                type="button"
                variant={jobType === t.value ? 'default' : 'outline'}
                className="h-auto py-3 text-sm"
                onClick={() => setJobType(t.value)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-3">
          <Label className="text-base font-semibold">Select a Date</Label>
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={(date) => date < new Date() || date.getDay() === 0 || date.getDay() === 6}
              className="rounded-xl border"
            />
          </div>
          {selectedDate && (
            <p className="text-sm text-center text-muted-foreground">
              Selected: <strong className="text-foreground">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</strong>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Address */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <Label className="text-base font-semibold">Service Address</Label>
          <div className="space-y-3">
            <div>
              <Label>Street Address</Label>
              <Input className="mt-1" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <Label>City</Label>
                <Input className="mt-1" value={city} onChange={e => setCity(e.target.value)} placeholder="City" />
              </div>
              <div>
                <Label>State</Label>
                <Input className="mt-1" value={state} onChange={e => setState(e.target.value)} placeholder="State" />
              </div>
              <div>
                <Label>Zip</Label>
                <Input className="mt-1" value={zip} onChange={e => setZip(e.target.value)} placeholder="Zip" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-2">
          <Label className="text-base font-semibold">Additional Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any details we should know..." rows={3} />
        </CardContent>
      </Card>

      <Button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full h-12 text-base bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {submitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
        {submitting ? 'Booking...' : 'Request Appointment'}
      </Button>
    </div>
  );
}