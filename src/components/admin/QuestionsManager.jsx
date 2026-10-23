import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { stableSortQuestions, computeNextSortOrder } from '@/lib/inspectionQuestionOrdering';
import DataTable from '../shared/DataTable';
import { toast } from 'sonner';
import { GitBranch, Copy, Trash } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import QuestionEditorDialog from './questions/QuestionEditorDialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

export default function QuestionsManager() {
  const [questions, setQuestions] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = () => base44.entities.InspectionQuestion.list('sort_order', 500).then(qs => setQuestions(stableSortQuestions(qs)));
  useEffect(() => { load(); }, []);

  const columns = [
    { key: 'id', label: 'ID', render: r => (
      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded cursor-pointer hover:bg-accent/20 select-all"
        title="Click to copy"
        onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(r.id); toast.success('ID copied!'); }}>
        {r.id}
      </span>
    )},
    { key: 'question_text', label: 'Question', render: r => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{r.question_text}</span>
        {r.question_role && (
          <span className="text-[10px] text-muted-foreground capitalize">{r.question_role.replace(/_/g, ' ')}</span>
        )}
      </div>
    )},
    { key: 'question_type', label: 'Type', render: r => <span className="capitalize">{r.question_type?.replace(/_/g, ' ')}</span> },
    { key: 'inspection_type', label: 'Form', render: r => {
      const t = r.inspection_type || 'interior';
      const styles = { interior: 'bg-amber-100 text-amber-700', exterior: 'bg-sky-100 text-sky-700', both: 'bg-green-100 text-green-700' };
      return <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${styles[t] || styles.interior}`}>{t}</span>;
    }},
    { key: 'question_category', label: 'Category', render: r => r.question_category ? (
      <Badge variant="outline" className="text-[10px]">{r.question_category}</Badge>
    ) : <span className="text-xs text-muted-foreground italic">auto</span> },
    { key: 'visibility_rule', label: 'Conditional', render: r => r.visibility_rule ? (
      <span className="flex items-center gap-1 text-xs text-amber-700 font-medium">
        <GitBranch className="w-3 h-3" /> Has rule
      </span>
    ) : null },
    { key: 'is_active', label: 'Status', render: r => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {r.is_active !== false ? 'Active' : 'Inactive'}
      </span>
    )},
    { key: '_actions', label: '', render: r => (
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => handleDuplicate(r, e)}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Duplicate question"
        >
          <Copy className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => handleDelete(r, e)}
          className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
          title="Delete question"
        >
          <Trash className="w-4 h-4" />
        </button>
      </div>
    )},
  ];

  const handleSave = async (data) => {
    let payload = { ...data };
    if (!editing) {
      // Auto-assign sort_order if not explicitly set by the admin
      if (!payload.sort_order || payload.sort_order === 0) {
        payload.sort_order = computeNextSortOrder(questions, payload.inspection_type, payload.category);
      }
    }
    if (editing) {
      await base44.entities.InspectionQuestion.update(editing.id, payload);
    } else {
      await base44.entities.InspectionQuestion.create(payload);
    }
    toast.success(editing ? 'Question updated' : `Question created (sort order: ${payload.sort_order})`);
    setEditing(null);
    load();
  };

  const handleDelete = (row, e) => {
    e.stopPropagation();
    setDeleteTarget(row);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.InspectionQuestion.delete(deleteTarget.id);
    toast.success('Question deleted');
    setDeleteTarget(null);
    load();
  };

  const handleDuplicate = async (row, e) => {
    e.stopPropagation();
    const { id, created_date, updated_date, created_by_id, sort_order, ...rest } = row;
    const nextOrder = computeNextSortOrder(questions, rest.inspection_type, rest.category);
    await base44.entities.InspectionQuestion.create({ ...rest, question_text: `Copy of ${rest.question_text}`, sort_order: nextOrder });
    toast.success(`Question duplicated (sort order: ${nextOrder})`);
    load();
  };

  return (
    <>
      <DataTable
        title="Inspection Questions"
        subtitle={`${questions.length} questions configured`}
        columns={columns}
        data={questions}
        searchFields={['question_text']}
        onAdd={() => { setEditing(null); setDialogOpen(true); }}
        addLabel="Add Question"
        onRowClick={(row) => { setEditing(row); setDialogOpen(true); }}
      />
      <QuestionEditorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        questions={questions}
        onSave={handleSave}
      />
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Question</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{deleteTarget?.question_text}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}