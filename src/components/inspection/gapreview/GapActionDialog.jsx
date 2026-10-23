import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DEPARTMENTS } from '@/lib/inspectionGapConfig';
import { PRIORITY_META } from '@/lib/inspectionMatrixGapClassifier';

export default function GapActionDialog({ dialog, gap, onClose, onSave }) {
  const [assignedTo, setAssignedTo] = useState('');
  const [department, setDepartment] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [priorityOverride, setPriorityOverride] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (gap) {
      setAssignedTo(gap.assigned_to || '');
      setDepartment(gap.department || '');
      setTargetDate(gap.target_date || '');
      setPriorityOverride(gap.priority_override || '');
      setNote('');
    }
  }, [gap, dialog]);

  if (!dialog || !gap) return null;

  const isAssign = dialog.type === 'assign';

  const handleSave = () => {
    if (isAssign) {
      onSave({ assigned_to: assignedTo, department, target_date: targetDate, priority_override: priorityOverride });
    } else {
      onSave({ resolution_notes: note });
    }
  };

  return (
    <Dialog open={!!dialog} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isAssign ? 'Assign Gap' : 'Add Note'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{gap.gap_type}</p>
            <p className="text-sm font-medium line-clamp-2">{gap.question_text}</p>
          </div>

          {isAssign ? (
            <>
              <div>
                <Label className="text-xs">Assigned To</Label>
                <Input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} placeholder="Name or email" className="h-9 mt-1" />
              </div>
              <div>
                <Label className="text-xs">Department</Label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Target Date</Label>
                <Input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="h-9 mt-1" />
              </div>
              <div>
                <Label className="text-xs">Priority Override</Label>
                <Select value={priorityOverride} onValueChange={setPriorityOverride}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="No override" /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(PRIORITY_META).map(p => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div>
              <Label className="text-xs">Resolution Note</Label>
              <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add context about this gap..." className="mt-1 min-h-[100px]" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>{isAssign ? 'Assign' : 'Save Note'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}