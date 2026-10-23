import { useState, useEffect, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, Search, X, Mail, Building2, Briefcase, IdCard } from 'lucide-react';

const STATUS_COLORS = {
  Active: 'bg-green-100 text-green-700',
  Inactive: 'bg-slate-100 text-slate-600',
  'On Leave': 'bg-amber-100 text-amber-700',
  Terminated: 'bg-red-100 text-red-700',
  Pending: 'bg-blue-100 text-blue-700',
  Disabled: 'bg-red-100 text-red-700',
  Suspended: 'bg-orange-100 text-orange-700',
};

/**
 * EmployeePicker — canonical searchable employee selector for LVC OS.
 *
 * All person-specific assignments must use this component so that every
 * assignment resolves through EmployeeRegistry as the single source of truth.
 *
 * Props:
 *   value              — currently selected employee_registry_id (string)
 *   onChange           — (selection | null) => void
 *   label              — field label (default "Select Employee")
 *   placeholder        — search input placeholder
 *   includeInactive    — initial state of the "include inactive" toggle (default false)
 *   allowInactiveToggle — show the include-inactive toggle (default true)
 *   clearable          — show a clear button when an employee is selected (default true)
 *   filterDepartment   — optional department filter to restrict results
 *   filterRole         — optional role filter to restrict results
 *
 * On select, onChange receives:
 *   { employee_registry_id, employee_id, employee_name, employee_email,
 *     linked_user_id, primary_role, department, employment_status }
 *
 * When cleared, onChange receives null.
 */
export default function EmployeePicker({
  value,
  onChange,
  label = 'Select Employee',
  placeholder = 'Search by name, ID, email, role, or department…',
  includeInactive = false,
  allowInactiveToggle = true,
  clearable = true,
  filterDepartment = null,
  filterRole = null,
  filterAssignedTruck = null,
}) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(includeInactive);
  const [selected, setSelected] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const filter = {};
    if (!showInactive) filter.employment_status = 'Active';
    if (filterDepartment) filter.department = filterDepartment;
    if (filterRole) filter.primary_role = filterRole;
    if (filterAssignedTruck) filter.assigned_truck = filterAssignedTruck;
    base44.entities.EmployeeRegistry.filter(filter, '-created_date', 500)
      .then(records => {
        if (!cancelled) {
          setEmployees(records || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [showInactive, filterDepartment, filterRole, filterAssignedTruck]);

  // Resolve the selected employee object when value changes
  useEffect(() => {
    if (value && employees.length > 0) {
      const match = employees.find(e => e.id === value || e.employee_id === value);
      setSelected(match || null);
    } else if (!value) {
      setSelected(null);
    }
  }, [value, employees]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return employees.slice(0, 50);
    const q = query.toLowerCase();
    return employees.filter(e => {
      const name = `${e.first_name} ${e.last_name}`.toLowerCase();
      const preferred = `${e.preferred_name || e.first_name || ''} ${e.last_name || ''}`.trim().toLowerCase();
      return (
        name.includes(q) ||
        preferred.includes(q) ||
        (e.employee_id || '').toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q) ||
        (e.login_email || '').toLowerCase().includes(q) ||
        (e.primary_role || '').toLowerCase().includes(q) ||
        (e.department || '').toLowerCase().includes(q)
      );
    }).slice(0, 50);
  }, [query, employees]);

  const handleSelect = (emp) => {
    const name = `${emp.preferred_name || emp.first_name} ${emp.last_name}`.trim();
    setSelected(emp);
    setOpen(false);
    setQuery('');
    onChange({
      employee_registry_id: emp.id,
      employee_id: emp.employee_id,
      employee_name: name,
      employee_email: emp.login_email || emp.email || '',
      linked_user_id: emp.linked_user_id || '',
      primary_role: emp.primary_role || '',
      department: emp.department || '',
      employment_status: emp.employment_status || 'Active',
    });
  };

  const handleClear = () => {
    setSelected(null);
    onChange(null);
  };

  return (
    <div className="space-y-1.5" ref={containerRef}>
      {label && <Label className="text-sm font-medium">{label}</Label>}
      <div className="relative">
        {selected ? (
          <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/30">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {selected.first_name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {selected.preferred_name || selected.first_name} {selected.last_name}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                  <span className="flex items-center gap-0.5"><IdCard className="w-3 h-3" />{selected.employee_id}</span>
                  <span className="flex items-center gap-0.5"><Briefcase className="w-3 h-3" />{selected.primary_role || '—'}</span>
                  <span className="flex items-center gap-0.5"><Building2 className="w-3 h-3" />{selected.department || '—'}</span>
                </div>
              </div>
            </div>
            {clearable && (
              <button
                type="button"
                onClick={handleClear}
                className="ml-2 p-1 rounded hover:bg-muted transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder={placeholder}
              className="pl-9"
            />
            {loading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
        )}
        {open && !selected && (
          <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-80 overflow-y-auto">
            {allowInactiveToggle && (
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                <span className="text-xs text-muted-foreground">Include inactive employees</span>
                <Switch checked={showInactive} onCheckedChange={setShowInactive} className="scale-75" />
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {loading ? 'Loading employees…' : 'No employees found'}
              </div>
            ) : (
              filtered.map(emp => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => handleSelect(emp)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/60 transition-colors border-b last:border-b-0"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {emp.first_name?.charAt(0) || 'U'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {emp.preferred_name || emp.first_name} {emp.last_name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                      <span className="flex items-center gap-0.5"><IdCard className="w-3 h-3" />{emp.employee_id}</span>
                      <span className="flex items-center gap-0.5"><Briefcase className="w-3 h-3" />{emp.primary_role || '—'}</span>
                      <span className="flex items-center gap-0.5"><Building2 className="w-3 h-3" />{emp.department || '—'}</span>
                      <span className="flex items-center gap-0.5 truncate"><Mail className="w-3 h-3" />{(emp.login_email || emp.email || '—')}</span>
                    </div>
                  </div>
                  <Badge className={STATUS_COLORS[emp.employment_status] || STATUS_COLORS.Active}>
                    {emp.employment_status}
                  </Badge>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}