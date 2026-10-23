import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { stableSortQuestions } from '@/lib/inspectionQuestionOrdering';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Check, AlertCircle } from 'lucide-react';

const FORM_OPTIONS = [
  { value: 'inspection_setup', label: 'Inspection Setup' },
  { value: 'interior', label: 'Interior' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'attic', label: 'Attic' },
  { value: 'roof', label: 'Roof' },
  { value: 'crawl_space', label: 'Crawl Space' },
  { value: 'appliance', label: 'Appliance' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'commercial', label: 'Commercial' },
];

const SECTION_OPTIONS = [
  'general_info', 'exterior', 'interior', 'firebox', 'damper', 'flue',
  'chimney_cap', 'crown', 'flashing', 'smoke_chamber', 'liner', 'hearth',
  'clearances', 'carbon_monoxide', 'water_damage', 'structural', 'other',
];

const TYPE_OPTIONS = [
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'select', label: 'Select' },
  { value: 'multi_select', label: 'Multi-Select' },
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'photo', label: 'Photo' },
  { value: 'rating', label: 'Rating' },
];

const prettify = (s) => s ? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';

export default function InspectionQuestionPicker({ value, onChange }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterForm, setFilterForm] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    base44.entities.InspectionQuestion.list('sort_order', 500)
      .then(qs => setQuestions(stableSortQuestions(qs)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return questions.filter(q => {
      if (filterForm && q.inspection_module !== filterForm) return false;
      if (filterSection && q.category !== filterSection) return false;
      if (filterType && q.question_type !== filterType) return false;
      if (filterStatus === 'active' && q.is_active === false) return false;
      if (filterStatus === 'inactive' && q.is_active !== false) return false;
      if (search) {
        const s = search.toLowerCase();
        return (q.question_text || '').toLowerCase().includes(s) ||
               (q.category || '').toLowerCase().includes(s) ||
               (q.inspection_module || '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [questions, filterForm, filterSection, filterType, filterStatus, search]);

  const selectedQuestion = useMemo(
    () => questions.find(q => q.id === value?.inspection_question_id),
    [questions, value]
  );

  const handleSelect = (q) => {
    onChange({
      inspection_question_id: q.id,
      inspection_question_text: q.question_text,
      inspection_form_id: q.inspection_module || '',
      inspection_section_id: q.category || '',
      question_type: q.question_type,
    });
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1">
        Inspection Question <span className="text-destructive">*</span>
      </Label>

      {selectedQuestion ? (
        <div className="flex items-start justify-between gap-2 p-3 bg-accent/5 border border-accent/30 rounded-lg">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{selectedQuestion.question_text}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {selectedQuestion.inspection_module && <Badge variant="outline" className="text-[10px]">{prettify(selectedQuestion.inspection_module)}</Badge>}
              {selectedQuestion.category && <Badge variant="outline" className="text-[10px]">{prettify(selectedQuestion.category)}</Badge>}
              {selectedQuestion.question_type && <Badge variant="outline" className="text-[10px]">{prettify(selectedQuestion.question_type)}</Badge>}
            </div>
          </div>
          <button type="button" onClick={() => { onChange(null); setOpen(true); }} className="text-xs text-accent hover:underline shrink-0">Change</button>
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="w-full flex items-center gap-2 px-3 py-2 border rounded-lg text-sm text-muted-foreground hover:border-accent/50 bg-background"
          >
            <Search className="w-4 h-4" />
            {loading ? 'Loading questions...' : 'Search for an inspection question...'}
          </button>

          {open && (
            <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-[400px] flex flex-col">
              {/* Filters */}
              <div className="p-2 border-b space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    className="h-8 text-xs pl-8"
                    placeholder="Search question text..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Select value={filterForm} onValueChange={setFilterForm}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All Forms" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>All Forms</SelectItem>
                      {FORM_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterSection} onValueChange={setFilterSection}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All Sections" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>All Sections</SelectItem>
                      {SECTION_OPTIONS.map(s => <SelectItem key={s} value={s}>{prettify(s)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All Types" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>All Types</SelectItem>
                      {TYPE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active Only</SelectItem>
                      <SelectItem value="inactive">Inactive Only</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Results */}
              <div className="overflow-y-auto flex-1 max-h-[250px]">
                {filtered.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    <AlertCircle className="w-4 h-4 mx-auto mb-1 opacity-40" />
                    No questions match your filters.
                  </div>
                ) : (
                  filtered.slice(0, 100).map(q => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => handleSelect(q)}
                      className="w-full text-left px-3 py-2 hover:bg-accent/10 border-b last:border-0 transition-colors"
                    >
                      <p className="text-xs font-medium line-clamp-2">{q.question_text}</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {q.inspection_module && <span className="text-[10px] text-muted-foreground">{prettify(q.inspection_module)}</span>}
                        {q.category && <span className="text-[10px] text-muted-foreground">· {prettify(q.category)}</span>}
                        {q.question_type && <span className="text-[10px] text-muted-foreground">· {prettify(q.question_type)}</span>}
                        {q.is_active === false && <span className="text-[10px] text-red-500">· Inactive</span>}
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="px-3 py-1.5 border-t text-[10px] text-muted-foreground">
                {filtered.length} question{filtered.length !== 1 ? 's' : ''} found
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}