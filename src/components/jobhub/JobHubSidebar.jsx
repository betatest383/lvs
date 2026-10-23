import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Phone, MessageSquare, Mail, Clock, CheckSquare, Bell,
  StickyNote, Calendar, AlertTriangle, ChevronRight, Truck,
  CreditCard, Shield, FileText, Users, Info,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import CrewManager from './CrewManager';

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function JobHubSidebar({
  customer, elapsedSeconds, recentTimeline, outstandingActions, tasks, notifications,
  quickNotes, onAddNote, nextJob, job, workflow, crewMembers, onSetCrew,
  currentUserEmail, isLead, truckNumber, inspectionLevel, customerConcerns,
  propertyDocsStatus,
}) {
  const [noteInput, setNoteInput] = useState('');

  const handleAddNote = () => {
    if (!noteInput.trim()) return;
    onAddNote(noteInput.trim());
    setNoteInput('');
  };

  return (
    <div className="space-y-3">
      {/* Appointment Timer */}
      <Card className="border-0 shadow-sm bg-accent/5">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <Clock className="w-5 h-5 text-accent" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Appointment Timer</p>
            <p className="text-lg font-mono font-bold tabular-nums">{formatElapsed(elapsedSeconds)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Customer Information */}
      {customer && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Customer Information</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            <div className="flex gap-1.5">
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full gap-1 text-xs"><Phone className="w-3 h-3" /> Call</Button>
                </a>
              )}
              {customer.phone && (
                <a href={`sms:${customer.phone}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full gap-1 text-xs"><MessageSquare className="w-3 h-3" /> Text</Button>
                </a>
              )}
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full gap-1 text-xs"><Mail className="w-3 h-3" /> Email</Button>
                </a>
              )}
            </div>
            <div className="space-y-0.5 text-xs">
              <p className="text-muted-foreground">{customer.address}</p>
              <p className="text-muted-foreground">{[customer.city, customer.state, customer.zip].filter(Boolean).join(', ')}</p>
              <p className="text-muted-foreground font-mono">{customer.phone}</p>
            </div>
            {/* Customer Concerns */}
            {customerConcerns && (
              <div className="pt-1.5 border-t">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <Info className="w-2.5 h-2.5" /> Customer Concerns
                </p>
                <p className="text-xs mt-0.5">{customerConcerns}</p>
              </div>
            )}
            {/* Inspection Level */}
            {inspectionLevel && (
              <div className="pt-1.5 border-t flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Inspection Level</span>
                <Badge variant="outline" className="text-[10px] capitalize">{inspectionLevel.replace(/_/g, ' ')}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Crew Members */}
      <CrewManager
        workflow={workflow}
        crewMembers={crewMembers}
        onSetCrew={onSetCrew}
        currentUserEmail={currentUserEmail}
        isLead={isLead}
      />

      {/* Truck & Membership */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-muted-foreground"><Truck className="w-3 h-3" /> Assigned Truck</span>
            <span className="font-medium">{truckNumber || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-muted-foreground"><CreditCard className="w-3 h-3" /> Membership</span>
            <Badge variant="outline" className={`text-[10px] ${customer?.status === 'active' ? 'bg-green-100 text-green-700' : ''}`}>
              {customer?.status === 'active' ? 'Active' : 'Non-Member'}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-muted-foreground"><FileText className="w-3 h-3" /> Property Docs</span>
            <Badge variant="outline" className={`text-[10px] ${propertyDocsStatus === 'complete' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {propertyDocsStatus === 'complete' ? 'Complete' : 'Pending'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Outstanding Required Actions */}
      {outstandingActions.length > 0 && (
        <Card className="border-0 shadow-sm border-l-4 border-l-amber-400">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Outstanding Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {outstandingActions.map((action, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>{action}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tasks */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <CheckSquare className="w-3.5 h-3.5" /> Tasks
            </CardTitle>
            <Badge variant="secondary" className="text-[10px]">{tasks.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {tasks.slice(0, 3).map(t => (
            <div key={t.id} className="text-xs truncate flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
              <span className="truncate">{t.title || t.task_id || 'Task'}</span>
            </div>
          ))}
          {tasks.length === 0 && <p className="text-xs text-muted-foreground">No open tasks</p>}
          <Link to="/tasks/my-tasks" className="text-[11px] text-accent hover:underline flex items-center gap-0.5 pt-1">
            View all <ChevronRight className="w-3 h-3" />
          </Link>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Bell className="w-3.5 h-3.5" /> Notifications
            </CardTitle>
            <Badge variant="secondary" className="text-[10px]">{notifications.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {notifications.slice(0, 3).map(n => (
            <div key={n.id} className="text-xs truncate flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
              <span className="truncate">{n.subject || n.title || 'Notification'}</span>
            </div>
          ))}
          {notifications.length === 0 && <p className="text-xs text-muted-foreground">No notifications</p>}
          <Link to="/notifications/my" className="text-[11px] text-accent hover:underline flex items-center gap-0.5 pt-1">
            View all <ChevronRight className="w-3 h-3" />
          </Link>
        </CardContent>
      </Card>

      {/* Quick Notes */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <StickyNote className="w-3.5 h-3.5" /> Quick Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {quickNotes.slice(-3).map((note, i) => (
            <div key={i} className="text-xs p-2 rounded bg-muted/50">
              <p>{note.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{note.time}</p>
            </div>
          ))}
          <div className="flex gap-1">
            <input
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddNote()}
              placeholder="Add note..."
              className="flex-1 px-2 py-1 text-xs rounded border bg-background"
            />
            <Button size="sm" variant="secondary" className="h-7 px-2" onClick={handleAddNote}>Add</Button>
          </div>
        </CardContent>
      </Card>

      {/* Next Appointment */}
      {nextJob && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Next Appointment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link to={`/tech/job-hub/${nextJob.id}`} className="block">
              <p className="text-sm font-medium truncate">{nextJob.customer_name}</p>
              <p className="text-xs text-muted-foreground">{nextJob.service_date}</p>
              <p className="text-xs text-muted-foreground truncate">{nextJob.address}</p>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}