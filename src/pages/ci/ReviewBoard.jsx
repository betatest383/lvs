import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { KanbanSquare } from 'lucide-react';
import ImprovementKanban from '@/components/ci/ImprovementKanban';
import ImprovementFormDialog from '@/components/ci/ImprovementFormDialog';
import { KANBAN_COLUMNS } from '@/lib/improvementConstants';

export default function ReviewBoard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setItems(await base44.entities.ImprovementRequest.list('-created_date', 500)); } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const col = KANBAN_COLUMNS.find((c) => c.id === destination.droppableId);
    if (!col) return;
    const newStatus = col.statuses[0];
    setItems((prev) => prev.map((i) => (i.id === draggableId ? { ...i, status: newStatus } : i)));
    try { await base44.entities.ImprovementRequest.update(draggableId, { status: newStatus }); }
    catch (e) { console.error(e); load(); }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <KanbanSquare className="w-6 h-6 text-accent" /> Review Board
        </h1>
        <p className="text-muted-foreground text-sm">Drag cards across columns to update status</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <ImprovementKanban items={items} onDragEnd={handleDragEnd} onCardClick={(item) => { setEditItem(item); setEditOpen(true); }} />
        </CardContent>
      </Card>

      <ImprovementFormDialog open={editOpen} onClose={() => setEditOpen(false)} improvement={editItem} onSaved={load} />
    </div>
  );
}