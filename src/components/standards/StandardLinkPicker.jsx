import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Link2, Unlink, FileCheck2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  STANDARD_STATUSES, getCategoryColor, getAuthorityColor, formatAuthorityRef,
} from '@/lib/inspectionStandardConstants';

export default function StandardLinkPicker({ selectedIds = [], onChange }) {
  const [standards, setStandards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    base44.entities.InspectionStandard.filter({ status: 'approved' }, '-updated_date', 200)
      .then(data => setStandards(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selected = useMemo(() => standards.filter(s => selectedIds.includes(s.id)), [standards, selectedIds]);

  const filtered = useMemo(() => {
    if (!search) return standards;
    const q = search.toLowerCase();
    return standards.filter(s =>
      s.standard_name?.toLowerCase().includes(q) ||
      s.standard_number?.toLowerCase().includes(q) ||
      s.category?.toLowerCase().includes(q)
    );
  }, [standards, search]);

  const toggle = (id) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(x => x !== id));
    else onChange([...selectedIds, id]);
  };

  return (
    <div className="space-y-3">
      {/* Linked Standards */}
      {selected.length > 0 && (
        <div className="space-y-1.5">
          {selected.map(std => (
            <div key={std.id} className="flex items-start gap-2 p-2 border rounded-lg bg-green-50 border-green-200">
              <FileCheck2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium line-clamp-1">{std.standard_name}</p>
                <div className="flex items-center gap-1 flex-wrap mt-0.5">
                  {std.standard_number && <Badge variant="outline" className="text-[10px]">{std.standard_number}</Badge>}
                  {std.category && <Badge className={`text-[10px] ${getCategoryColor(std.category)}`}>{std.category}</Badge>}
                  {(std.authority_level || []).map(a => <Badge key={a} className={`text-[10px] ${getAuthorityColor(a)}`}>{a}</Badge>)}
                </div>
                {std.pass_criteria && <p className="text-xs text-muted-foreground mt-1 line-clamp-2"><strong>Pass:</strong> {std.pass_criteria}</p>}
                {std.fail_criteria && <p className="text-xs text-muted-foreground line-clamp-2"><strong>Fail:</strong> {std.fail_criteria}</p>}
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => toggle(std.id)}>
                <Unlink className="w-3 h-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Search & Link */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search approved standards..."
            value={search}
            onChange={e => { setSearch(e.target.value); setExpanded(true); }}
            onFocus={() => setExpanded(true)}
            className="h-9 text-sm pl-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)} className="gap-1">
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Hide' : 'Browse'}
        </Button>
      </div>

      {/* Browse List */}
      {expanded && (
        <div className="border rounded-lg max-h-64 overflow-y-auto divide-y">
          {loading && <div className="p-4 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" /></div>}
          {!loading && filtered.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No approved standards found</p>}
          {!loading && filtered.map(std => {
            const isLinked = selectedIds.includes(std.id);
            return (
              <button
                key={std.id}
                type="button"
                onClick={() => toggle(std.id)}
                className={`w-full text-left p-2 hover:bg-muted/30 transition-colors flex items-start gap-2 ${isLinked ? 'bg-green-50/50' : ''}`}
              >
                <Link2 className={`w-4 h-4 mt-0.5 shrink-0 ${isLinked ? 'text-green-600' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">{std.standard_name}</p>
                  <div className="flex items-center gap-1 flex-wrap mt-0.5">
                    {std.standard_number && <Badge variant="outline" className="text-[10px]">{std.standard_number}</Badge>}
                    {std.category && <Badge className={`text-[10px] ${getCategoryColor(std.category)}`}>{std.category}</Badge>}
                    {formatAuthorityRef(std) && <Badge variant="outline" className="text-[10px]">{formatAuthorityRef(std)}</Badge>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}