import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Filter } from 'lucide-react';
import { GAP_STATUSES, STATUS_ORDER, CONFIDENCE_LEVELS, CONFIDENCE_ORDER, DEPARTMENTS } from '@/lib/inspectionGapConfig';
import { QUESTION_ROLES, PRIORITY_META, CATEGORY_META, CATEGORY_ORDER } from '@/lib/inspectionMatrixGapClassifier';
import { QUESTION_PURPOSES, PURPOSE_ORDER, QUESTION_CATEGORIES } from '@/lib/inspectionMetadataConfig';
import { INSPECTION_MODULES } from '@/lib/inspectionModules';

const ROLE_ORDER = ['observation', 'measurement', 'photo', 'calculation_input', 'derived_result', 'customer_information', 'administrative', 'verification'];

function FilterToggle({ active, onClick, label }) {
  const base = 'px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors border whitespace-nowrap';
  const styles = active
    ? 'bg-accent text-accent-foreground border-accent'
    : 'bg-muted text-muted-foreground border-border hover:bg-muted/80';
  return <button onClick={onClick} className={`${base} ${styles}`}>{label}</button>;
}

export default function GapFilters({ filters, setFilters, assignees }) {
  const update = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  const toggle = (key) => update(key, !filters[key]);

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          {/* Status */}
          <Select value={filters.status} onValueChange={v => update('status', v)}>
            <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{GAP_STATUSES[s].label}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Assigned To */}
          <Select value={filters.assignedTo} onValueChange={v => update('assignedTo', v)}>
            <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {assignees.filter(Boolean).map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Priority */}
          <Select value={filters.priority} onValueChange={v => update('priority', v)}>
            <SelectTrigger className="w-[120px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              {Object.keys(PRIORITY_META).map(p => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Confidence */}
          <Select value={filters.confidence} onValueChange={v => update('confidence', v)}>
            <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Confidence</SelectItem>
              {CONFIDENCE_ORDER.map(c => <SelectItem key={c} value={c}>{CONFIDENCE_LEVELS[c].label}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Role */}
          <Select value={filters.role} onValueChange={v => update('role', v)}>
            <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {ROLE_ORDER.map(r => <SelectItem key={r} value={r}>{QUESTION_ROLES[r].label}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Purpose */}
          <Select value={filters.purpose} onValueChange={v => update('purpose', v)}>
            <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Purposes</SelectItem>
              {PURPOSE_ORDER.map(p => <SelectItem key={p} value={p}>{QUESTION_PURPOSES[p].label}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Category */}
          <Select value={filters.category} onValueChange={v => update('category', v)}>
            <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {QUESTION_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Repair System */}
          <Select value={filters.repairSystem} onValueChange={v => update('repairSystem', v)}>
            <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Repair Systems</SelectItem>
              <SelectItem value="crown">Crown</SelectItem>
              <SelectItem value="masonry">Masonry</SelectItem>
              <SelectItem value="liner">Liner</SelectItem>
              <SelectItem value="smoke_chamber">Smoke Chamber</SelectItem>
              <SelectItem value="cap_chase">Cap / Chase</SelectItem>
              <SelectItem value="other">Other</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
          {/* Section */}
          <Select value={filters.section} onValueChange={v => update('section', v)}>
            <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              <SelectItem value="General Info">General Info</SelectItem>
              <SelectItem value="Exterior">Exterior</SelectItem>
              <SelectItem value="Interior">Interior</SelectItem>
              <SelectItem value="Safety">Safety</SelectItem>
            </SelectContent>
          </Select>
          {/* Form */}
          <Select value={filters.form} onValueChange={v => update('form', v)}>
            <SelectTrigger className="w-[120px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Forms</SelectItem>
              <SelectItem value="interior">Interior</SelectItem>
              <SelectItem value="exterior">Exterior</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
          {/* Inspection Module */}
          <Select value={filters.inspectionModule} onValueChange={v => update('inspectionModule', v)}>
            <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modules</SelectItem>
              {INSPECTION_MODULES.map(m => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Department */}
          <Select value={filters.department} onValueChange={v => update('department', v)}>
            <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="w-px h-6 bg-border" />
          {/* Toggle filters */}
          <FilterToggle active={filters.nfpaOnly} onClick={() => toggle('nfpaOnly')} label="NFPA" />
          <FilterToggle active={filters.estimateOnly} onClick={() => toggle('estimateOnly')} label="Estimate" />
          <FilterToggle active={filters.warehouseOnly} onClick={() => toggle('warehouseOnly')} label="Warehouse" />
          <FilterToggle active={filters.materialCalcOnly} onClick={() => toggle('materialCalcOnly')} label="Material Calc" />
          <FilterToggle active={filters.pdfOnly} onClick={() => toggle('pdfOnly')} label="PDF" />
          <FilterToggle active={filters.analyticsOnly} onClick={() => toggle('analyticsOnly')} label="Analytics" />
        </div>
      </CardContent>
    </Card>
  );
}