import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Package, AlertTriangle, Trash2, MessageSquare } from 'lucide-react';
import PhotoUploadField from '@/components/warehouse/PhotoUploadField';

export default function ReturnItemEditor({ item, onChange }) {
  const update = (field, value) => {
    onChange({ ...item, [field]: value });
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-3 bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{item.item_name}</p>
            {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
          </div>
        </div>
        <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
          Transferred: <span className="font-semibold">{item.quantity_transferred}</span>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs text-green-600 flex items-center gap-1">
            <Package className="h-3 w-3" /> Returned
          </Label>
          <Input
            type="number"
            min="0"
            max={item.quantity_transferred}
            value={item.returned_quantity || ''}
            onChange={e => update('returned_quantity', parseInt(e.target.value) || 0)}
            placeholder="0"
            className="mt-1 h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-orange-600 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Damaged
          </Label>
          <Input
            type="number"
            min="0"
            max={item.quantity_transferred}
            value={item.damaged_quantity || ''}
            onChange={e => update('damaged_quantity', parseInt(e.target.value) || 0)}
            placeholder="0"
            className="mt-1 h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-red-600 flex items-center gap-1">
            <Trash2 className="h-3 w-3" /> Disposed
          </Label>
          <Input
            type="number"
            min="0"
            max={item.quantity_transferred}
            value={item.disposed_quantity || ''}
            onChange={e => update('disposed_quantity', parseInt(e.target.value) || 0)}
            placeholder="0"
            className="mt-1 h-8 text-sm"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          <MessageSquare className="h-3 w-3" /> Comments
        </Label>
        <Textarea
          value={item.comments || ''}
          onChange={e => update('comments', e.target.value)}
          placeholder="Optional notes about this item..."
          className="mt-1 text-sm min-h-[50px]"
          rows={2}
        />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Photo (Optional)</Label>
        <div className="mt-1">
          <PhotoUploadField value={item.photo_url || ''} onChange={url => update('photo_url', url)} />
        </div>
      </div>
    </div>
  );
}