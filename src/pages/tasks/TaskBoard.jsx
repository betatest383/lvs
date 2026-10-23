import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { KANBAN_COLUMNS, TASK_STATUS_COLORS, PRIORITY_COLORS } from '@/lib/enterpriseTaskConstants';

export default function TaskBoard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const all = await base44.entities.EnterpriseTask.list('-created_date', 500);
      setTasks(all.filter(t => t.status !== 'Cancelled'));
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const taskId = result.draggableId;
    const newStatus = result.destination.droppableId;
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    try {
      // When moving TO "In Progress", use the canonical start_assigned_task action.
      // This creates a WorkSession, handles interruption detection, creates
      // checkpoints, and sets bidirectional interrupted_task_id links — all
      // required for the resume workflow to fire when the interrupting task
      // completes. Using plain 'transition' bypasses all of this.
      if (newStatus === 'In Progress' && task.status !== 'In Progress') {
        const response = await base44.functions.invoke('manageTask', {
          action: 'start_assigned_task',
          taskId,
          expectedAssignmentVersion: task.assignment_version,
          sourceContext: 'task_board',
        });
        if (!response.data?.success) {
          if (response.data?.start_conflict) {
            toast.error(response.data.start_conflict.message || 'Cannot start — current work is non-interruptible');
          } else {
            toast.error(response.data?.error || 'Only the assigned employee can start this task. Open the task and use the Start button.');
          }
          load(); // revert position
        }
      } else {
        const response = await base44.functions.invoke('manageTask', {
          action: 'transition',
          taskId,
          newStatus,
        });
        if (!response.data?.success) {
          toast.error(response.data?.error || 'Failed to update status');
          load();
        }
      }
    } catch {
      toast.error('Failed to update status');
      load();
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const columns = KANBAN_COLUMNS.map(status => ({
    status,
    tasks: tasks.filter(t => t.status === status || (status === 'New' && !t.status)),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Task Board</h1>
        <p className="text-muted-foreground text-sm">Drag and drop tasks to update status.</p>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {columns.map(col => (
            <div key={col.status} className="min-w-[260px] w-[260px] shrink-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${TASK_STATUS_COLORS[col.status] || ''}`}>{col.status}</span>
                <span className="text-xs text-muted-foreground">{col.tasks.length}</span>
              </div>
              <Droppable droppableId={col.status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`space-y-2 min-h-[200px] p-2 rounded-lg transition-colors ${snapshot.isDraggingOver ? 'bg-accent/5' : 'bg-muted/30'}`}
                  >
                    {col.tasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(prov, snap) => (
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            {...prov.dragHandleProps}
                            className={`bg-card border rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing transition-shadow ${snap.isDragging ? 'shadow-lg opacity-80' : 'hover:shadow-md'}`}
                            style={{ ...prov.draggableProps.style, borderLeftWidth: '4px', borderLeftColor: task.priority === 'Critical' ? '#dc2626' : task.priority === 'High' ? '#ea580c' : task.priority === 'Medium' ? '#ca8a04' : '#16a34a' }}
                          >
                            <p className="text-sm font-medium line-clamp-2">{task.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">{task.task_number || task.task_id}</p>
                            <div className="flex items-center justify-between mt-2">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
                              {task.assigned_to && <span className="text-xs text-muted-foreground truncate ml-1">{task.assigned_to}</span>}
                            </div>
                            {task.due_date && <p className="text-xs text-muted-foreground mt-1">📅 {task.due_date}</p>}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {col.tasks.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">No tasks</p>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}