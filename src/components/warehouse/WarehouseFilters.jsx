import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function WarehouseFilters({ filters, values, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map(f => {
        if (f.type === 'text') {
          return (
            <Input
              key={f.key}
              placeholder={f.label}
              value={values[f.key] || ''}
              onChange={e => onChange({ ...values, [f.key]: e.target.value })}
              className="h-9 max-w-[160px]"
            />
          );
        }
        if (f.type === 'date') {
          return (
            <Input
              key={f.key}
              type="date"
              value={values[f.key] || ''}
              onChange={e => onChange({ ...values, [f.key]: e.target.value })}
              className="h-9 max-w-[160px]"
            />
          );
        }
        if (f.type === 'select') {
          return (
            <Select
              key={f.key}
              value={values[f.key] || 'all'}
              onValueChange={v => onChange({ ...values, [f.key]: v === 'all' ? '' : v })}
            >
              <SelectTrigger className="h-9 max-w-[170px]">
                <SelectValue placeholder={f.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {f.label}</SelectItem>
                {f.options?.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
        return null;
      })}
    </div>
  );
}