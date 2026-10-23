import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { GitBranch, ArrowRight } from 'lucide-react';

const STAGES = [
  { key: 'Planned', label: 'Planned', desc: 'Identified but not started', color: 'border-t-slate-400', badge: 'bg-slate-100 text-slate-600' },
  { key: 'Draft', label: 'Draft', desc: 'Trainual content being written', color: 'border-t-amber-400', badge: 'bg-amber-100 text-amber-700' },
  { key: 'Review', label: 'Review', desc: 'Operations review', color: 'border-t-blue-400', badge: 'bg-blue-100 text-blue-700' },
  { key: 'Approved', label: 'Approved', desc: 'Official company process', color: 'border-t-green-400', badge: 'bg-green-100 text-green-700' },
  { key: 'Base44 Build', label: 'Base44 Build', desc: 'Workflow under development', color: 'border-t-indigo-400', badge: 'bg-indigo-100 text-indigo-700' },
  { key: 'Testing', label: 'Testing', desc: 'Employees testing the workflow', color: 'border-t-purple-400', badge: 'bg-purple-100 text-purple-700' },
  { key: 'Live', label: 'Live', desc: 'Active in production', color: 'border-t-teal-400', badge: 'bg-teal-100 text-teal-700' },
  { key: 'Continuous Improvement', label: 'Continuous Improvement', desc: 'Monitoring and refining', color: 'border-t-pink-400', badge: 'bg-pink-100 text-pink-700' },
];

export default function WorkflowStatusBoard() {
  const [sops, setSops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState('__all');

  useEffect(() => {
    const load = async () => {
      try {
        const recs = await base44.entities.SopRegistry.list('-created_date', 500);
        setSops(recs);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const departments = useMemo(() => {
    const set = new Set(sops.map(s => s.department).filter(Boolean));
    return Array.from(set).sort();
  }, [sops]);

  const filtered = useMemo(() => {
    if (deptFilter === '__all') return sops;
    return sops.filter(s => s.department === deptFilter);
  }, [sops, deptFilter]);

  const byStage = useMemo(() => {
    const map = {};
    STAGES.forEach(s => { map[s.key] = []; });
    filtered.forEach(sop => {
      const stage = sop.lifecycle_stage || 'Planned';
      if (map[stage]) map[stage].push(sop);
    });
    return map;
  }, [filtered]);

  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    const newStage = destination.droppableId;
    const sop = sops.find(s => s.id === draggableId);
    if (!sop) return;

    // Optimistic update
    setSops(prev => prev.map(s => s.id === sop.id ? { ...s, lifecycle_stage: newStage } : s));

    try {
      await base44.functions.invoke('manageSop', { action: 'update', record_id: sop.id, data: { lifecycle_stage: newStage } });
      toast.success(`${sop.sop_id} moved to ${newStage}`);
    } catch {
      toast.error('Failed to update stage');
      setSops(prev => prev.map(s => s.id === sop.id ? { ...s, lifecycle_stage: sop.lifecycle_stage || 'Planned' } : s));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workflow Status Board</h1>
          <p className="text-muted-foreground text-sm">Drag SOPs across stages to track their lifecycle.</p>
        </div>
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-muted-foreground" />
          <Select value={deptFilter} onValueChange={v => setDeptFilter(v)}>
            <SelectTrigger className="w-48 h-9 text-sm">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All Departments</SelectItem>
              {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 snap-x">
          {STAGES.map(stage => {
            const items = byStage[stage.key] || [];
            return (
              <div key={stage.key} className="flex-shrink-0 w-72 snap-start">
                <Card className={`border-t-4 ${stage.color} shadow-sm h-full`}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-semibold">{stage.label}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stage.badge}`}>{items.length}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{stage.desc}</p>

                    <Droppable droppableId={stage.key}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`space-y-2 min-h-[200px] rounded-lg p-1 transition-colors ${snapshot.isDraggingOver ? 'bg-accent/10' : ''}`}
                        >
                          {items.map((sop, index) => (
                            <Draggable key={sop.id} draggableId={sop.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={`rounded-lg border border-border bg-card p-2.5 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${snapshot.isDragging ? 'shadow-md ring-2 ring-accent/40' : ''}`}
                                >
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className="font-mono text-xs font-medium text-muted-foreground">{sop.sop_id || '—'}</span>
                                    {sop.business_impact && (
                                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                        {sop.business_impact}
                                      </Badge>
                                    )}
                                  </div>
                                  <Link to="/lvcos/sop-registry" className="block">
                                    <p className="text-sm font-medium leading-snug hover:text-accent transition-colors">{sop.title}</p>
                                  </Link>
                                  {sop.department && (
                                    <p className="text-xs text-muted-foreground mt-1">{sop.department}</p>
                                  )}
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Stage legend for mobile */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground md:hidden">
        <span>Swipe sideways to see all stages</span>
        <ArrowRight className="w-3 h-3" />
      </div>
    </div>
  );
}