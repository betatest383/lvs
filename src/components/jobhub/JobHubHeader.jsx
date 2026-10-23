import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  MapPin, Clock, Truck, User, CreditCard, Shield, Calendar,
  ArrowLeft, Home,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const HUB_STATUSES = [
  { key: 'scheduled', label: 'Scheduled', color: 'bg-blue-500' },
  { key: 'en_route', label: 'En Route', color: 'bg-purple-500' },
  { key: 'on_site', label: 'On Site', color: 'bg-amber-500' },
  { key: 'working', label: 'Working', color: 'bg-orange-500' },
  { key: 'awaiting_signature', label: 'Awaiting Sig', color: 'bg-cyan-500' },
  { key: 'completed', label: 'Completed', color: 'bg-green-500' },
];

const PROGRESS_STEPS = ['Inspection', 'Documentation', 'Estimate', 'Signature', 'Complete'];

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function JobHubHeader({ job, customer, hubStatus, elapsedSeconds, onStatusChange, progressStep, technicianName, truckNumber }) {
  if (!job) return null;
  const initials = (job.customer_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const completedSteps = PROGRESS_STEP_INDEXES.slice(0, progressStep + 1);

  return (
    <Card className="border-0 shadow-md sticky top-0 z-30 bg-card/95 backdrop-blur">
      <CardContent className="p-4 space-y-3">
        {/* Top row: identity + return button */}
        <div className="flex items-start gap-3">
          <Link to="/tech/dashboard">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <ArrowLeft className="w-4 h-4" /> Hub
            </Button>
          </Link>
          <Avatar className="w-12 h-12 border-2 border-primary/20">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold truncate">{job.customer_name}</h1>
              <Badge variant="outline" className="text-xs font-mono">{job.crm_job_number || job.id?.slice(-6) || '—'}</Badge>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{[job.address, job.city, job.state].filter(Boolean).join(', ')}</span>
            </div>
          </div>
          {/* Elapsed timer */}
          <div className="text-right flex-shrink-0">
            <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
              <Clock className="w-3 h-3" /> Elapsed
            </div>
            <div className="text-lg font-mono font-bold tabular-nums">{formatElapsed(elapsedSeconds)}</div>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {HUB_STATUSES.map(s => (
            <button
              key={s.key}
              onClick={() => onStatusChange(s.key, s.label)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                hubStatus === s.key
                  ? `${s.color} text-white shadow-sm scale-105`
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-1">
          {PROGRESS_STEPS.map((step, i) => (
            <div key={step} className="flex items-center flex-1">
              <div className={`flex-1 h-1.5 rounded-full ${i <= progressStep ? 'bg-accent' : 'bg-muted'}`} />
              {i < PROGRESS_STEPS.length - 1 && (
                <span className={`text-[9px] px-1 ${i < progressStep ? 'text-accent font-medium' : 'text-muted-foreground'}`}>→</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between -mt-1">
          {PROGRESS_STEPS.map((step, i) => (
            <span key={step} className={`text-[9px] ${i <= progressStep ? 'text-accent font-medium' : 'text-muted-foreground'}`}>
              {step}
            </span>
          ))}
        </div>

        {/* Info row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><User className="w-3 h-3" /> {technicianName || '—'}</span>
          <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {truckNumber || '—'}</span>
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {job.service_date || '—'}</span>
          <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> {customer?.status === 'active' ? 'Member' : 'Non-Member'}</span>
          <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Warranty: —</span>
        </div>
      </CardContent>
    </Card>
  );
}

const PROGRESS_STEP_INDEXES = [0, 1, 2, 3, 4];