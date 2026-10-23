import { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { GripVertical, Pencil, Archive, RotateCcw, Network, Loader2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ClassificationGroup({
  typeKey,
  typeLabel,
  records,
  onEdit,
  onArchive,
  onRestore,
  onReorder,
  usageMap,
}) {
  const [expanded, setExpanded] = useState(true);
  const activeCount = records.filter(r => r.is_active !== false).length;
  const archivedCount = records.filter(r => r.is_active === false).length;

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    onReorder(typeKey, records, result.source.index, result.destination.index);
  };

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
          <span className="font-semibold text-sm">{typeLabel}</span>
          <Badge variant="secondary" className="text-[10px]">{records.length}</Badge>
          {archivedCount > 0 && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">{archivedCount} archived</Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{activeCount} active</span>
      </button>

      {expanded && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId={typeKey}>
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="divide-y border-t">
                {records.map((rec, idx) => {
                  const isArchived = rec.is_active === false;
                  const usage = usageMap[rec.id] || 0;
                  return (
                    <Draggable key={rec.id} draggableId={rec.id} index={idx}>
                      {(prov, snapshot) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2 group',
                            snapshot.isDragging && 'bg-accent/10 shadow-md z-50',
                            isArchived && 'opacity-50'
                          )}
                        >
                          <span {...prov.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground">
                            <GripVertical className="w-4 h-4" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{rec.label || rec.value}</span>
                              {rec.value !== rec.label && (
                                <span className="text-xs text-muted-foreground font-mono">{rec.value}</span>
                              )}
                              {rec.parent_value && (
                                <Badge variant="outline" className="text-[10px]">{rec.parent_value}</Badge>
                              )}
                            </div>
                            {rec.description && (
                              <p className="text-xs text-muted-foreground truncate">{rec.description}</p>
                            )}
                          </div>
                          {usage > 0 && (
                            <Badge variant="outline" className="text-[10px] text-blue-700 border-blue-300">
                              {usage} uses
                            </Badge>
                          )}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(rec)} title="Edit">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onArchive(rec)} title="View usage / Archive">
                              <Network className="w-3.5 h-3.5" />
                            </Button>
                            {isArchived ? (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => onRestore(rec)} title="Restore">
                                <RotateCcw className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" onClick={() => onArchive(rec)} title="Archive">
                                <Archive className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
}