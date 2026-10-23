import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Briefcase, Truck, Wrench, FileText, GitBranch,
         FolderTree, ScrollText, GraduationCap, Award, ClipboardCheck,
         AlertCircle, UserPlus, Lightbulb } from 'lucide-react';
import { useTaskRelatedNames } from '@/hooks/useTaskRelatedNames';

function Row({ icon: Icon, label, record }) {
  if (!record) return null;
  return (
    <div className="flex items-center justify-between text-sm py-1 border-b last:border-0">
      <span className="text-muted-foreground flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </span>
      {record.route && !record.unavailable ? (
        <Link to={record.route} className="font-medium text-accent hover:underline text-right truncate max-w-[60%]">
          {record.name}
        </Link>
      ) : (
        <span className={`font-medium text-right truncate max-w-[60%] ${record.unavailable ? 'text-muted-foreground italic' : ''}`}>
          {record.name}
        </span>
      )}
    </div>
  );
}

export default function TaskRelatedRecords({ task }) {
  const names = useTaskRelatedNames(task);

  // Keep any row whose task field is set — resolved OR unavailable — so the
  // section never hides just because a lookup failed.
  const rows = [
    { icon: Users, label: 'Customer', record: names.customer },
    { icon: Briefcase, label: 'Job', record: names.job },
    { icon: Truck, label: 'Truck', record: names.truck },
    { icon: Wrench, label: 'Equipment', record: names.equipment },
    { icon: FileText, label: 'SOP', record: names.sop },
    { icon: GitBranch, label: 'Workflow', record: names.workflow },
    { icon: FolderTree, label: 'Business Process', record: names.businessProcess },
    { icon: ScrollText, label: 'Policy', record: names.policy },
    { icon: GraduationCap, label: 'Training', record: names.training },
    { icon: Award, label: 'Certification', record: names.certification },
    { icon: ClipboardCheck, label: 'Audit', record: names.audit },
    { icon: AlertCircle, label: 'Corrective Action', record: names.correctiveAction },
    { icon: UserPlus, label: 'Onboarding', record: names.onboarding },
    { icon: Lightbulb, label: 'Improvement Request', record: names.improvementRequest },
  ].filter(r => r.record);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
          <Users className="w-4 h-4 text-accent" /> Related Records
        </h3>
        {rows.map((r, i) => (
          <Row key={i} {...r} />
        ))}
      </CardContent>
    </Card>
  );
}