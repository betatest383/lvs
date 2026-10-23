import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Clock, Circle, CheckCircle2, Camera, FileText, PenTool,
  ArrowLeftRight, Package, Flag, Play, Eye, UserCheck,
  SkipForward, Wrench, DollarSign, Presentation, Users,
  Settings, Home, TreePine, ClipboardList,
} from 'lucide-react';
import { formatTimeET } from '@/lib/timezone';

const EVENT_ICONS = {
  status_change: Circle,
  activity_completed: CheckCircle2,
  activity_started: Play,
  photo_uploaded: Camera,
  note_added: FileText,
  estimate_created: DollarSign,
  signature_captured: PenTool,
  material_transfer: ArrowLeftRight,
  consumable_used: Package,
  equipment_used: Package,
  equipment_returned: Package,
  job_completed: Flag,
};

const STAGE_ICONS = {
  inspection_setup: Settings,
  interior_inspection: Home,
  exterior_inspection: TreePine,
  inspection_summary: FileText,
  repair_system_review: Wrench,
  estimate_review: DollarSign,
  customer_presentation: Presentation,
  customer_decision: Users,
  scope_of_work: ClipboardList,
  complete_appointment: Flag,
};

export default function JobTimeline({ logs }) {
  const sorted = [...(logs || [])].sort((a, b) => {
    const ta = new Date(a.timestamp || a.created_date).getTime();
    const tb = new Date(b.timestamp || b.created_date).getTime();
    return tb - ta;
  });

  const getIcon = (log) => {
    // Check if this is a workflow stage event
    if (log.event_type === 'activity_started' || log.event_type === 'activity_completed') {
      const label = (log.event_label || '').toLowerCase();
      for (const [stageKey, Icon] of Object.entries(STAGE_ICONS)) {
        if (label.includes(stageKey.replace(/_/g, ' '))) return Icon;
      }
    }
    return EVENT_ICONS[log.event_type] || Circle;
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent" /> Workflow History & Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Timeline will populate as you work through the appointment.
          </p>
        ) : (
          <div className="space-y-0">
            {sorted.map((log, i) => {
              const Icon = getIcon(log);
              const isLast = i === sorted.length - 1;
              const details = log.event_details ? (() => {
                try { return JSON.parse(log.event_details); } catch { return null; }
              })() : null;

              return (
                <div key={log.id || i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-3.5 h-3.5 text-accent" />
                    </div>
                    {!isLast && <div className="w-0.5 flex-1 bg-border min-h-[24px]" />}
                  </div>
                  <div className="pb-4 flex-1 min-w-0">
                    <p className="text-sm font-medium">{log.event_label}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      <span>{formatTimeET(log.timestamp || log.created_date)}</span>
                      {log.performed_by && <span>· {log.performed_by}</span>}
                      {details?.device && <Badge variant="outline" className="text-[9px]">{details.device}</Badge>}
                      {details?.time_spent && <span>· {details.time_spent}</span>}
                    </div>
                    {details?.photos != null && (
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        {details.photos > 0 && <span>📷 {details.photos}</span>}
                        {details.findings > 0 && <span>⚠️ {details.findings}</span>}
                        {details.measurements > 0 && <span>📏 {details.measurements}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}