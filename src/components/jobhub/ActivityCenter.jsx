import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ClipboardCheck, Home, TreePine, Layers, Sparkles, Wrench, HardHat, Shield,
  Phone, Camera, Video, Mic, FileText, StickyNote, ArrowLeftRight, Package,
  Undo2, History, Image, FileSearch, CreditCard, MessageSquare, Mail,
  FilePlus, Pencil, RefreshCw, DollarSign, PenTool, CheckSquare, Flag,
} from 'lucide-react';

const CATEGORIES = [
  {
    title: 'Inspection',
    icon: ClipboardCheck,
    color: 'text-blue-600 bg-blue-50',
    activities: [
      { id: 'interior', label: 'Interior', icon: Home, action: 'navigate', path: '/tech/inspection?job_id=' },
      { id: 'exterior', label: 'Exterior', icon: TreePine, action: 'navigate', path: '/tech/exterior-inspection?job_id=' },
      { id: 'level1', label: 'Level 1', icon: Layers, action: 'log' },
      { id: 'level2', label: 'Level 2', icon: Layers, action: 'log' },
      { id: 'level3', label: 'Level 3', icon: Layers, action: 'log' },
    ],
  },
  {
    title: 'Work',
    icon: Wrench,
    color: 'text-orange-600 bg-orange-50',
    activities: [
      { id: 'sweep', label: 'Sweep', icon: Sparkles, action: 'log' },
      { id: 'repair', label: 'Repair', icon: Wrench, action: 'log' },
      { id: 'installation', label: 'Installation', icon: HardHat, action: 'log' },
      { id: 'warranty_work', label: 'Warranty', icon: Shield, action: 'log' },
      { id: 'service_call', label: 'Service Call', icon: Phone, action: 'log' },
    ],
  },
  {
    title: 'Documentation',
    icon: FileText,
    color: 'text-purple-600 bg-purple-50',
    activities: [
      { id: 'photos', label: 'Photos', icon: Camera, action: 'modal' },
      { id: 'videos', label: 'Videos', icon: Video, action: 'log' },
      { id: 'voice_notes', label: 'Voice Notes', icon: Mic, action: 'log' },
      { id: 'documents', label: 'Documents', icon: FileText, action: 'log' },
      { id: 'notes', label: 'Notes', icon: StickyNote, action: 'modal' },
    ],
  },
  {
    title: 'Inventory',
    icon: Package,
    color: 'text-teal-600 bg-teal-50',
    activities: [
      { id: 'material_transfers', label: 'Material Transfers', icon: ArrowLeftRight, action: 'navigate', path: '/warehouse/transfer-sheets' },
      { id: 'consumables_used', label: 'Consumables', icon: Package, action: 'log' },
      { id: 'equipment_used', label: 'Equipment Used', icon: Wrench, action: 'log' },
      { id: 'returns', label: 'Returns', icon: Undo2, action: 'navigate', path: '/warehouse/returned-materials' },
    ],
  },
  {
    title: 'Customer',
    icon: History,
    color: 'text-indigo-600 bg-indigo-50',
    activities: [
      { id: 'history', label: 'History', icon: History, action: 'log' },
      { id: 'prev_photos', label: 'Prev Photos', icon: Image, action: 'log' },
      { id: 'prev_estimates', label: 'Prev Estimates', icon: FileSearch, action: 'navigate', path: '/admin/estimates' },
      { id: 'warranty_info', label: 'Warranty', icon: Shield, action: 'log' },
      { id: 'membership_info', label: 'Membership', icon: CreditCard, action: 'log' },
    ],
  },
  {
    title: 'Communication',
    icon: Phone,
    color: 'text-green-600 bg-green-50',
    activities: [
      { id: 'call', label: 'Call', icon: Phone, action: 'link', scheme: 'tel:' },
      { id: 'text', label: 'Text', icon: MessageSquare, action: 'link', scheme: 'sms:' },
      { id: 'email', label: 'Email', icon: Mail, action: 'link', scheme: 'mailto:' },
    ],
  },
  {
    title: 'Sales',
    icon: FilePlus,
    color: 'text-amber-600 bg-amber-50',
    activities: [
      { id: 'create_estimate', label: 'Create Estimate', icon: FilePlus, action: 'navigate', path: '/admin/estimates' },
      { id: 'change_order', label: 'Change Order', icon: Pencil, action: 'log' },
      { id: 'membership_renewal', label: 'Membership Renewal', icon: RefreshCw, action: 'log' },
      { id: 'financing', label: 'Financing', icon: DollarSign, action: 'log' },
    ],
  },
  {
    title: 'Completion',
    icon: Flag,
    color: 'text-red-600 bg-red-50',
    activities: [
      { id: 'signature', label: 'Customer Signature', icon: PenTool, action: 'modal' },
      { id: 'completion_checklist', label: 'Completion Checklist', icon: CheckSquare, action: 'modal' },
      { id: 'complete_job', label: 'Complete Appointment', icon: Flag, action: 'complete' },
    ],
  },
];

export default function ActivityCenter({ job, customer, onActivity }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-accent" /> Activity Center
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {CATEGORIES.map(cat => (
          <div key={cat.title}>
            <div className="flex items-center gap-1.5 mb-2">
              <div className={`w-6 h-6 rounded flex items-center justify-center ${cat.color}`}>
                <cat.icon className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{cat.title}</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {cat.activities.map(act => (
                <Button
                  key={act.id}
                  variant="outline"
                  size="sm"
                  className="h-auto py-2 flex-col gap-1 text-xs"
                  onClick={() => onActivity(cat, act)}
                >
                  <act.icon className="w-4 h-4" />
                  <span className="text-[10px] leading-tight">{act.label}</span>
                </Button>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}