import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function PresentationCustomerNotes({
  notes, onNotesChange,
}) {
  const fields = [
    { key: 'customer_questions', label: 'Questions Asked', placeholder: 'What questions did the customer ask?' },
    { key: 'customer_concerns', label: 'Customer Concerns', placeholder: 'Any concerns expressed by the customer?' },
    { key: 'requested_changes', label: 'Requested Changes', placeholder: 'Did the customer request any changes to the proposal?' },
    { key: 'office_follow_up_notes', label: 'Office Follow-Up Notes', placeholder: 'Anything the office team needs to follow up on?' },
  ];

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {fields.map(f => (
          <div key={f.key} className="space-y-1">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {f.label}
            </Label>
            <Textarea
              value={notes[f.key] || ''}
              onChange={e => onNotesChange(f.key, e.target.value)}
              placeholder={f.placeholder}
              rows={2}
              className="text-sm"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}