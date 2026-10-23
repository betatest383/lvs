import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, X, MessageSquare } from 'lucide-react';
import PhotoUploadField from '@/components/warehouse/PhotoUploadField';

export default function RentalReturnEditor({ items, onChange }) {
  const addItem = () => {
    onChange([...items, {
      item_name: '',
      vendor: '',
      condition: '',
      comments: '',
      photo_url: '',
    }]);
  };

  const updateItem = (idx, field, value) => {
    onChange(items.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const removeItem = (idx) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-3">No rental equipment being returned.</p>
      )}
      {items.map((item, idx) => (
        <div key={idx} className="border border-border rounded-lg p-3 space-y-3 bg-card">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Rental #{idx + 1}</p>
            <button
              type="button"
              onClick={() => removeItem(idx)}
              className="text-red-500 hover:text-red-700 p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Equipment / Item</Label>
              <Input
                value={item.item_name || ''}
                onChange={e => updateItem(idx, 'item_name', e.target.value)}
                placeholder="e.g. Boom Lift"
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Vendor</Label>
              <Input
                value={item.vendor || ''}
                onChange={e => updateItem(idx, 'vendor', e.target.value)}
                placeholder="Rental company"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Condition</Label>
            <Input
              value={item.condition || ''}
              onChange={e => updateItem(idx, 'condition', e.target.value)}
              placeholder="Describe condition on return"
              className="mt-1 h-8 text-sm"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> Comments
            </Label>
            <Textarea
              value={item.comments || ''}
              onChange={e => updateItem(idx, 'comments', e.target.value)}
              placeholder="Optional notes..."
              className="mt-1 text-sm min-h-[50px]"
              rows={2}
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Photo (Optional)</Label>
            <div className="mt-1">
              <PhotoUploadField value={item.photo_url || ''} onChange={url => updateItem(idx, 'photo_url', url)} />
            </div>
          </div>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addItem} className="w-full">
        <Plus className="h-4 w-4 mr-1" /> Add Rental
      </Button>
    </div>
  );
}