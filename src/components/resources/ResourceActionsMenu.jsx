import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  MoreVertical, Send, Brain, Check, X, Globe, Archive, Edit
} from 'lucide-react';
import {
  canManageResource, canReviewResource, canClassifyResource, VALID_TRANSITIONS
} from '@/lib/productResourceConstants';

export default function ResourceActionsMenu({ resource, user, onAction }) {
  if (!resource) return null;
  const canManage = canManageResource(user, resource);
  const canReview = canReviewResource(user);
  const canClassify = canClassifyResource(user);
  const allowed = VALID_TRANSITIONS[resource.status] || [];

  const items = [];

  if (canManage && (resource.status === 'Draft' || resource.status === 'Pending Classification')) {
    items.push({ key: 'classify', label: 'Classify with AI', icon: Brain, disabled: !canClassify });
  }
  if (canManage && allowed.includes('Pending Review')) {
    items.push({ key: 'submit_for_review', label: 'Submit for Review', icon: Send });
  }
  if (canReview && allowed.includes('Approved')) {
    items.push({ key: 'approve', label: 'Approve', icon: Check });
  }
  if (canReview && allowed.includes('Rejected')) {
    items.push({ key: 'reject', label: 'Reject', icon: X });
  }
  if (canReview && allowed.includes('Published')) {
    items.push({ key: 'publish', label: 'Publish', icon: Globe });
  }
  if (canReview && allowed.includes('Archived')) {
    items.push({ key: 'archive', label: 'Archive', icon: Archive });
  }
  if (canManage) {
    items.push({ key: 'edit', label: 'Edit Details', icon: Edit });
  }

  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <MoreVertical className="h-4 w-4" />
          Actions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Workflow Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item, idx) => (
          <DropdownMenuItem
            key={idx}
            onClick={() => onAction(item.key)}
            disabled={item.disabled}
          >
            <item.icon className="h-4 w-4 mr-2" />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}