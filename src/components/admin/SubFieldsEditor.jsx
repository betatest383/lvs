import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';

export default function SubFieldsEditor({ value, onChange }) {
  const [fields, setFields] = useState([]);

  useEffect(() => {
    try {
      setFields(JSON.parse(value || '[]'));
    } catch (e) {
      setFields([]);
    }
  }, [value]);

  const handleAddField = () => {
    const updated = [...fields, { name: '', type: 'text' }];
    setFields(updated);
    onChange(JSON.stringify(updated));
  };

  const handleUpdateField = (idx, key, val) => {
    const updated = [...fields];
    updated[idx][key] = val;
    setFields(updated);
    onChange(JSON.stringify(updated));
  };

  const handleRemoveField = (idx) => {
    const updated = fields.filter((_, i) => i !== idx);
    setFields(updated);
    onChange(JSON.stringify(updated));
  };

  return (
    <div className="space-y-3 border border-dashed border-blue-300 bg-blue-50 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold text-blue-900">Sub-Fields</Label>
        <Button type="button" variant="outline" size="sm" onClick={handleAddField} className="gap-1 border-blue-300 text-blue-700 hover:bg-blue-100">
          <Plus className="w-3 h-3" /> Add Field
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-xs text-blue-700">No sub-fields yet. Click "Add Field" to create nested measurement fields.</p>
      ) : (
        <div className="space-y-2">
          {fields.map((field, idx) => (
            <div key={idx} className="flex items-end gap-2 bg-white p-2 rounded border border-blue-200">
              <div className="flex-1 space-y-1">
                <Label className="text-xs font-medium text-blue-900">Name</Label>
                <Input
                  type="text"
                  value={field.name}
                  onChange={(e) => handleUpdateField(idx, 'name', e.target.value)}
                  placeholder="e.g. Front, Left, Back"
                  className="h-8 text-xs"
                />
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-xs font-medium text-blue-900">Type</Label>
                <Select value={field.type} onValueChange={(v) => handleUpdateField(idx, 'type', v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveField(idx)}
                className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}