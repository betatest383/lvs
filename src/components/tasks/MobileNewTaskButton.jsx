import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useCurrentRole } from '@/hooks/useCurrentRole';
import { hasTaskPermission } from '@/lib/taskPermissions';
import TaskFormDialog from '@/components/tasks/TaskFormDialog';

/**
 * Mobile-only floating "New Task" button. Renders as a FAB on small screens,
 * hidden on md+ where the in-page header buttons are visible. Opens the task
 * creation dialog directly and respects the role-based 'create' permission.
 */
export default function MobileNewTaskButton() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { role, loading } = useCurrentRole();
  const navigate = useNavigate();

  // Only show once role is resolved and the user is permitted to create tasks.
  if (loading || !hasTaskPermission(role, 'create')) return null;

  const handleSave = async (data) => {
    setSaving(true);
    try {
      const response = await base44.functions.invoke('manageTask', {
        action: 'create',
        taskData: data,
      });
      if (response.data?.success) {
        toast.success('Task created: ' + (response.data.task?.task_number || ''));
        setOpen(false);
        if (response.data.task?.id) {
          navigate(`/tasks/detail/${response.data.task.id}`);
        }
      } else {
        toast.error(response.data?.error || 'Failed to create task');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        aria-label="New Task"
        className="md:hidden fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full shadow-lg bg-accent text-accent-foreground hover:bg-accent/90 pb-safe"
      >
        <Plus className="w-6 h-6" />
      </Button>
      <TaskFormDialog open={open} onOpenChange={setOpen} onSave={handleSave} />
    </>
  );
}