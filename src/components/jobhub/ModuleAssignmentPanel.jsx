import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Users, Camera, AlertTriangle, Clock, Activity } from 'lucide-react';
import moment from 'moment';

export default function ModuleAssignmentPanel({ stages, workflow, crewMembers, onAssign, isLead }) {
  const [assigning, setAssigning] = useState(null);
  const moduleAssignments = JSON.parse(workflow?.module_assignments || '{}');
  const selectedModules = JSON.parse(workflow?.selected_modules || '["interior","exterior"]');

  const modules = [
    { key: 'interior', label: 'Interior Inspection', stageKey: 'interior_inspection' },
    { key: 'exterior', label: 'Exterior Inspection', stageKey: 'exterior_inspection' },
  ].filter(m => selectedModules.includes(m.key));

  if (modules.length === 0) return null;

  const handleAssign = async (moduleKey, crewMember) => {
    setAssigning(moduleKey);
    try {
      const member = crewMembers.find(c => c.email === crewMember);
      await onAssign(moduleKey, member || { email: crewMember, name: crewMember });
    } finally {
      setAssigning(null);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-accent" /> Module Assignment & Live Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {modules.map(mod => {
          const stage = stages[mod.stageKey] || { status: 'locked' };
          const assignment = moduleAssignments[mod.key] || {};

          return (
            <div key={mod.key} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{mod.label}</p>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {stage.status?.replace(/_/g, ' ')}
                </Badge>
              </div>

              {/* Assignment selector */}
              {isLead && stage.status !== 'completed' && stage.status !== 'skipped' && (
                <Select
                  value={assignment.assigned_to_email || ''}
                  onValueChange={(v) => handleAssign(mod.key, v)}
                  disabled={assigning === mod.key}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Assign to crew member..." />
                  </SelectTrigger>
                  <SelectContent>
                    {crewMembers.map(c => (
                      <SelectItem key={c.email} value={c.email} className="text-xs">
                        {c.name} ({c.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Assigned technician */}
              {assignment.assigned_to_name && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" /> Assigned: {assignment.assigned_to_name}
                </p>
              )}

              {/* Live stats */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center p-1.5 rounded bg-muted/50">
                  <Camera className="w-3 h-3 mx-auto text-muted-foreground" />
                  <p className="font-bold mt-0.5">{assignment.photos || 0}</p>
                  <p className="text-[9px] text-muted-foreground">Photos</p>
                </div>
                <div className="text-center p-1.5 rounded bg-muted/50">
                  <AlertTriangle className="w-3 h-3 mx-auto text-muted-foreground" />
                  <p className="font-bold mt-0.5">{assignment.findings || 0}</p>
                  <p className="text-[9px] text-muted-foreground">Findings</p>
                </div>
                <div className="text-center p-1.5 rounded bg-muted/50">
                  <Activity className="w-3 h-3 mx-auto text-muted-foreground" />
                  <p className="font-bold mt-0.5">{assignment.completion_pct || 0}%</p>
                  <p className="text-[9px] text-muted-foreground">Done</p>
                </div>
              </div>

              {/* Last updated */}
              {assignment.last_updated && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  Updated {moment(assignment.last_updated).format('h:mm A')}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}