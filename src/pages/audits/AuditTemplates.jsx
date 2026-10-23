import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { FileStack, Plus, Search } from 'lucide-react';
import AuditTemplateFormDialog from '@/components/audits/AuditTemplateFormDialog';
import { parseSections } from '@/lib/auditConstants';

export default function AuditTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editTemplate, setEditTemplate] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setTemplates(await base44.entities.AuditTemplate.list('-created_date', 500)); } catch (e) { console.error(e); }
    setLoading(false);
  };

  const filtered = templates.filter((t) =>
    !search || t.audit_name?.toLowerCase().includes(search.toLowerCase()) || t.audit_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileStack className="w-6 h-6 text-accent" /> Audit Templates
          </h1>
          <p className="text-muted-foreground text-sm">Create and manage audit templates linked to SOPs</p>
        </div>
        <Button onClick={() => { setEditTemplate(null); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> New Template
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search templates..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No templates found. Create one to get started.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t) => {
            const sections = parseSections(t.sections);
            const itemCount = sections.reduce((s, sec) => s + (sec.items?.length || 0), 0);
            return (
              <Card key={t.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setEditTemplate(t); setCreateOpen(true); }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-muted-foreground">{t.audit_id || '—'}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${t.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-700'}`}>{t.status}</span>
                  </div>
                  <p className="text-sm font-semibold mb-1">{t.audit_name}</p>
                  {t.related_sop && <p className="text-xs text-muted-foreground">SOP: {t.related_sop}</p>}
                  {t.department && <p className="text-xs text-muted-foreground">{t.department}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>{sections.length} sections</span>
                    <span>{itemCount} items</span>
                    <span>{t.audit_frequency}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AuditTemplateFormDialog open={createOpen} onClose={() => setCreateOpen(false)} template={editTemplate} onSaved={load} />
    </div>
  );
}