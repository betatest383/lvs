import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Package, AlertTriangle, Trash2, MessageSquare, Plus, X } from 'lucide-react';
import PhotoUploadField from '@/components/warehouse/PhotoUploadField';
import { EQUIPMENT_CATALOG, EQUIPMENT_STATUS_OPTIONS } from '@/lib/wh201Constants';

export default function EquipmentReturnEditor({ items, onChange }) {
  const addItem = () => {
    onChange([...items, {
      item_name: '',
      quantity: 1,
      status: 'Good',
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
        <p className="text-sm text-muted-foreground text-center py-3">No equipment being returned. Tap below to add items.</p>
      )}
      {items.map((item, idx) => (
        <div key={idx} className="border border-border rounded-lg p-3 space-y-3 bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <p className="text-sm font-medium">Equipment #{idx + 1}</p>
            </div>
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
              <Label className="text-xs text-muted-foreground">Equipment</Label>
              <select
                value={item.item_name}
                onChange={e => updateItem(idx, 'item_name', e.target.value)}
                className="mt-1 w-full h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">Select equipment...</option>
                {EQUIPMENT_CATALOG.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Quantity</Label>
              <Input
                type="number"
                min="1"
                value={item.quantity || ''}
                onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                placeholder="1"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {EQUIPMENT_STATUS_OPTIONS.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => updateItem(idx, 'status', opt)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    item.status === opt
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted/30'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
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
        <Plus className="h-4 w-4 mr-1" /> Add Equipment
      </Button>
    </div>
  );
}