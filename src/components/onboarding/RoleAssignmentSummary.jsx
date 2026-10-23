import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, CheckCircle2, XCircle } from 'lucide-react';

const InfoRow = ({ label, value }) => (
  <div className="flex justify-between items-start gap-2 py-1.5 border-b last:border-0">
    <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
    <span className="text-sm font-medium text-right">{value || '—'}</span>
  </div>
);

const ArrayList = ({ items }) => {
  if (!items || items.length === 0) return <span className="text-sm text-muted-foreground">None</span>;
  return (
    <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
      {items.map((item, i) => (
        <span key={i} className="px-1.5 py-0.5 rounded bg-muted text-xs">{item}</span>
      ))}
    </div>
  );
};

export default function RoleAssignmentSummary({ role }) {
  if (!role) return null;
  const requiresTruck = role.default_portal === 'tech' || role.default_portal === 'fleet';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent" /> Role Assignment Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0">
        <InfoRow label="Role" value={role.role_name} />
        <InfoRow label="Role ID" value={role.role_id} />
        <InfoRow label="Department" value={role.department} />
        <InfoRow label="Permission Level" value={role.permission_level} />
        <InfoRow label="Portal" value={role.default_portal} />
        <InfoRow label="Dashboard" value={role.dashboard} />
        <InfoRow label="Home Screen" value={role.home_screen} />
        <div className="flex justify-between items-center gap-2 py-1.5 border-b last:border-0">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Manager Approval Authority</span>
          {role.manager_approval_authority
            ? <CheckCircle2 className="w-4 h-4 text-green-600" />
            : <XCircle className="w-4 h-4 text-muted-foreground" />}
        </div>
        <InfoRow label="Equipment Package" value={role.required_equipment_package} />
        <InfoRow label="Truck Required" value={requiresTruck ? 'Yes' : 'No'} />
        <div className="py-1.5 border-b last:border-0">
          <div className="flex justify-between items-start gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Software</span>
            <ArrayList items={role.required_software} />
          </div>
        </div>
        <div className="py-1.5 border-b last:border-0">
          <div className="flex justify-between items-start gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Required SOPs</span>
            <ArrayList items={role.required_sops} />
          </div>
        </div>
        <div className="py-1.5 border-b last:border-0">
          <div className="flex justify-between items-start gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Required Policies</span>
            <ArrayList items={role.required_policies} />
          </div>
        </div>
        <div className="py-1.5 border-b last:border-0">
          <div className="flex justify-between items-start gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Required Certifications</span>
            <ArrayList items={role.required_certifications} />
          </div>
        </div>
        <div className="py-1.5">
          <div className="flex justify-between items-start gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Career Path (Promotes To)</span>
            <ArrayList items={role.career_path_to} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}