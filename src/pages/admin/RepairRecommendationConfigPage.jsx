import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Pencil, Trash2, FlaskConical, Search, Power, Beaker, BookOpen, Network, AlertCircle, PackageX, Boxes } from 'lucide-react';
import { toast } from 'sonner';
import RepairRecommendationTemplateDialog from '@/components/admin/RepairRecommendationTemplateDialog';
import TemplateRelationshipViewer from '@/components/admin/TemplateRelationshipViewer';
import TestAutoEstimateDialog from '@/components/admin/TestAutoEstimateDialog';
import ManualTemplateTestDialog from '@/components/admin/ManualTemplateTestDialog';
import { useAuth } from '@/lib/AuthContext';

const STATUS_BADGES = {
  draft: 'bg-gray-100 text-gray-700',
  testing: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  archived: 'bg-zinc-200 text-zinc-600',
  inactive: 'bg-red-100 text-red-700',
  needs_review: 'bg-amber-100 text-amber-700',
};

export default function RepairRecommendationConfigPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [serviceCatalog, setServiceCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSection, setFilterSection] = useState('all');
  const [filterDeficiency, setFilterDeficiency] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [testOpen, setTestOpen] = useState(false);
  const [manualTestOpen, setManualTestOpen] = useState(false);
  const [relationshipViewer, setRelationshipViewer] = useState(null);
  const [capMatrixCount, setCapMatrixCount] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tpls, svcs, capProducts] = await Promise.all([
        base44.entities.RepairRecommendationTemplate.list('-updated_date', 200),
        base44.entities.ServiceCatalog.filter({ is_active: true }),
        base44.entities.CapSizingMatrix.list('-updated_date', 500),
      ]);
      setTemplates(tpls);
      setServiceCatalog(svcs);
      setCapMatrixCount(capProducts.filter(p => p.is_active !== false).length);
    } catch (e) {
      toast.error('Failed to load templates: ' + e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build filter options from templates
  const categories = [...new Set(templates.map(t => t.inspection_category).filter(Boolean))].sort();
  const sections = [...new Set(templates.map(t => t.inspection_section).filter(Boolean))].sort();
  const deficiencies = [...new Set(templates.map(t => t.deficiency_type).filter(Boolean))].sort();

  const filtered = templates.filter(t => {
    if (filterStatus !== 'all' && (t.template_status || 'draft') !== filterStatus) return false;
    if (filterCategory !== 'all' && t.inspection_category !== filterCategory) return false;
    if (filterSection !== 'all' && t.inspection_section !== filterSection) return false;
    if (filterDeficiency !== 'all' && t.deficiency_type !== filterDeficiency) return false;
    if (filterSeverity !== 'all' && (t.severity || '') !== filterSeverity) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.template_name?.toLowerCase().includes(q) ||
      t.deficiency_type?.toLowerCase().includes(q) ||
      t.service_name?.toLowerCase().includes(q) ||
      t.inspection_category?.toLowerCase().includes(q) ||
      t.finding_keywords?.toLowerCase().includes(q)
    );
  });

  const handleDelete = async (id) => {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    try {
      await base44.entities.RepairRecommendationTemplate.delete(id);
      toast.success('Template deleted');
      load();
    } catch (e) {
      toast.error('Failed to delete: ' + e.message);
    }
  };

  const handleStatusCycle = async (tpl) => {
    const cycle = { draft: 'testing', testing: 'active', active: 'archived', archived: 'draft', inactive: 'draft', needs_review: 'testing' };
    const next = cycle[tpl.template_status || 'draft'] || 'draft';
    try {
      await base44.entities.RepairRecommendationTemplate.update(tpl.id, {
        template_status: next,
        is_active: next === 'active',
        updated_by: user?.email || '',
      });
      toast.success(`Status → ${next}`);
      load();
    } catch (e) {
      toast.error('Failed to update status: ' + e.message);
    }
  };

  const handleEdit = (tpl) => {
    setEditTemplate(tpl);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditTemplate(null);
    setDialogOpen(true);
  };

  const activeCount = templates.filter(t => t.template_status === 'active').length;
  const draftCount = templates.filter(t => t.template_status === 'draft').length;
  const testingCount = templates.filter(t => t.template_status === 'testing').length;
  const archivedCount = templates.filter(t => t.template_status === 'archived').length;
  const missingServiceCount = templates.filter(t => !t.service_catalog_id).length;
  const missingMaterialsCount = templates.filter(t => t.material_resolution_mode !== 'measurement_lookup' && !t.default_materials).length;
  const unusedCount = templates.filter(t => !t.service_catalog_id && t.material_resolution_mode !== 'measurement_lookup' && !t.default_materials).length;

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Repair Recommendation Configuration
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs gap-1">
              <BookOpen className="w-3 h-3" /> Repair Knowledge Base
            </Badge>
            <button onClick={() => navigate('/admin/cap-sizing-matrix')} className="text-xs text-accent hover:underline flex items-center gap-1">
              <Boxes className="w-3 h-3" /> Cap Sizing Matrix →
            </button>
            <p className="text-sm text-muted-foreground">
              Configure how inspection deficiencies map to repair recommendations, services, materials, and draft estimates.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setManualTestOpen(true)}>
            <Beaker className="w-4 h-4" /> Test Template Match
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setTestOpen(true)}>
            <FlaskConical className="w-4 h-4" /> Test Auto Estimate
          </Button>
          <Button className="gap-1.5" onClick={handleNew}>
            <Plus className="w-4 h-4" /> New Template
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold">{templates.length}</p>
          <p className="text-xs text-muted-foreground">Total Templates</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-gray-600">{draftCount}</p>
          <p className="text-xs text-muted-foreground">Draft</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-blue-600">{testingCount}</p>
          <p className="text-xs text-muted-foreground">Testing</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-green-600">{activeCount}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </CardContent></Card>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-zinc-500">{archivedCount}</p>
          <p className="text-xs text-muted-foreground">Archived</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500" />
          <div>
            <p className="text-2xl font-bold text-amber-600">{missingServiceCount}</p>
            <p className="text-xs text-muted-foreground">Missing Service Links</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <PackageX className="w-5 h-5 text-orange-500" />
          <div>
            <p className="text-2xl font-bold text-orange-600">{missingMaterialsCount}</p>
            <p className="text-xs text-muted-foreground">Missing Material Lists</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Boxes className="w-5 h-5 text-red-500" />
          <div>
            <p className="text-2xl font-bold text-red-600">{unusedCount}</p>
            <p className="text-xs text-muted-foreground">Unused Templates</p>
          </div>
        </CardContent></Card>
      </div>

      {/* Cap Sizing Matrix warning */}
      {capMatrixCount === 0 && (
        <Card className="border-amber-300 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors" onClick={() => navigate('/admin/cap-sizing-matrix')}>
          <CardContent className="p-4 flex items-center gap-3">
            <Boxes className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-amber-800 text-sm">Cap Sizing Matrix Has No Products</p>
              <p className="text-xs text-amber-700">Add real manufacturer cap products with fitting ranges to enable measurement-driven cap resolution. Click to configure.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, keyword, service, deficiency..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="testing">Testing</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSection} onValueChange={setFilterSection}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sections</SelectItem>
            {sections.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDeficiency} onValueChange={setFilterDeficiency}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Deficiencies</SelectItem>
            {deficiencies.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="minor">Minor</SelectItem>
            <SelectItem value="moderate">Moderate</SelectItem>
            <SelectItem value="major">Major</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Template List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          {templates.length === 0
            ? 'No templates yet. Click "New Template" to configure how deficiencies become estimates.'
            : 'No templates match your filters.'}
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map(tpl => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              onEdit={() => handleEdit(tpl)}
              onDelete={() => handleDelete(tpl.id)}
              onStatusCycle={() => handleStatusCycle(tpl)}
              onRelationships={() => setRelationshipViewer({ id: tpl.id, name: tpl.template_name })}
            />
          ))}
        </div>
      )}

      <RepairRecommendationTemplateDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditTemplate(null); }}
        onSaved={load}
        template={editTemplate}
        serviceCatalog={serviceCatalog}
        currentUserEmail={user?.email}
      />

      <TestAutoEstimateDialog open={testOpen} onClose={() => setTestOpen(false)} />
      <ManualTemplateTestDialog open={manualTestOpen} onClose={() => setManualTestOpen(false)} />
      <TemplateRelationshipViewer
        templateId={relationshipViewer?.id}
        templateName={relationshipViewer?.name}
        open={!!relationshipViewer}
        onClose={() => setRelationshipViewer(null)}
      />
    </div>
  );
}

function TemplateCard({ template, onEdit, onDelete, onStatusCycle, onRelationships }) {
  const status = template.template_status || (template.is_active ? 'active' : 'inactive');
  const hasService = !!(template.service_catalog_id || template.service_name);
  const hasMaterials = !!(template.default_materials || template.internal_materials);

  return (
    <Card className={status === 'inactive' ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base">{template.template_name}</h3>
              <Badge className={STATUS_BADGES[status] || 'bg-gray-100'} variant="secondary">
                {status.replace(/_/g, ' ')}
              </Badge>
              {template.priority && template.priority !== 'medium' && (
                <Badge variant="outline" className="text-[10px] capitalize">{template.priority}</Badge>
              )}
              {hasService && (
                <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">
                  Service Linked
                </Badge>
              )}
              {hasMaterials && (
                <Badge variant="outline" className="text-[10px] text-blue-700 border-blue-300">
                  Materials
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
              {template.deficiency_type && (
                <span><strong className="text-foreground">Deficiency:</strong> {template.deficiency_type}</span>
              )}
              {template.inspection_category && (
                <span><strong className="text-foreground">Category:</strong> {template.inspection_category}</span>
              )}
              {template.inspection_section && (
                <span><strong className="text-foreground">Section:</strong> {template.inspection_section}</span>
              )}
              {template.severity && (
                <span><strong className="text-foreground">Severity:</strong> {template.severity}</span>
              )}
              {template.finding_keywords && (
                <span><strong className="text-foreground">Keywords:</strong> {template.finding_keywords}</span>
              )}
            </div>

            {template.service_name && (
              <div className="mt-2 text-sm">
                <span className="text-muted-foreground">Service: </span>
                <span className="font-medium">{template.service_name}</span>
                {template.default_selling_price > 0 && (
                  <span className="text-muted-foreground ml-2">${template.default_selling_price.toFixed(2)}</span>
                )}
                {template.pricing_mode && template.pricing_mode !== 'service_catalog_price' && (
                  <span className="text-xs text-amber-700 ml-2">({template.pricing_mode.replace(/_/g, ' ')})</span>
                )}
              </div>
            )}

            {template.customer_summary && (
              <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                {template.customer_summary}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Button size="icon" variant="ghost" onClick={onEdit} title="Edit">
              <Pencil className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onRelationships} title="View relationships">
              <Network className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onStatusCycle} title="Cycle status">
              <Power className={`w-4 h-4 ${status === 'active' ? 'text-green-600' : 'text-muted-foreground'}`} />
            </Button>
            <Button size="icon" variant="ghost" className="text-red-600" onClick={onDelete} title="Delete">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}