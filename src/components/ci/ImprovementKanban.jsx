import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { KANBAN_COLUMNS } from '@/lib/improvementConstants';
import ImprovementCard from './ImprovementCard';

export default function ImprovementKanban({ items, onDragEnd, onCardClick }) {
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map((col) => {
          const colItems = items.filter((i) => col.statuses.includes(i.status));
          return (
            <div key={col.id} className="w-72 shrink-0">
              <div className={`rounded-lg bg-muted/30 border-t-4 ${col.color} p-3 h-full`}>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-sm font-semibold">{col.title}</h3>
                  <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {colItems.length}
                  </span>
                </div>
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`space-y-2 min-h-[120px] rounded-lg transition-colors ${
                        snapshot.isDraggingOver ? 'bg-accent/10' : ''
                      }`}
                    >
                      {colItems.map((item, index) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(prov) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              style={prov.draggableProps.style}
                            >
                              <ImprovementCard item={item} onClick={() => onCardClick?.(item)} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}