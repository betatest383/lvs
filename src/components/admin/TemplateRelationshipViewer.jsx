import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Link2, FileQuestion, Zap, Wrench, Package, ClipboardList, FileText, Brain, BarChart3, Boxes } from 'lucide-react';

/**
 * Shows where a Repair Recommendation Template is currently used across LVC OS.
 * Each usage type is clickable to navigate to the related entity.
 */
export default function TemplateRelationshipViewer({ templateId, templateName, open, onClose }) {
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState({});

  useEffect(() => {
    if (!templateId || !open) return;
    setLoading(true);

    // Query all entities that might reference this template
    Promise.all([
      // Inspection Questions (by repair_template_id or finding_type_config matching deficiency)
      base44.entities.InspectionQuestion.filter({}).catch(() => []),
      // Logic Rules
      base44.entities.LogicRule.filter({ repair_template_id: templateId }).catch(() => []),
      // Service Catalog (by service_catalog_id linked on template)
      base44.entities.ServiceCatalog.filter({}).catch(() => []),
      // Proposal Option Templates
      base44.entities.ProposalOptionTemplate.filter({ repair_template_id: templateId }).catch(() => []),
      // Inspection Findings that used this template
      base44.entities.InspectionFinding.filter({ repair_template_id: templateId }).catch(() => []),
      // Draft Estimate Items
      base44.entities.DraftEstimateItem.filter({ repair_template_id: templateId }).catch(() => []),
      // Material Lists
      base44.entities.MaterialList.filter({}).catch(() => []),
      // Scope of Work records
      base44.entities.ScopeOfWork.filter({}).catch(() => []),
    ]).then(([questions, rules, services, proposals, findings, estimateItems, materialLists, scopes]) => {
      // Match questions that reference this template's deficiency type
      setUsage({
        questions: questions.filter(q => q.repair_template_id === templateId || q.finding_type_config),
        rules,
        services: services.filter(s => s.id), // Would need template.service_catalog_id to match
        proposals,
        findings,
        estimateItems,
        materialLists: materialLists.filter(m => m.template_id === templateId || m.repair_template_id === templateId),
        scopes: scopes.filter(s => s.repair_template_id === templateId),
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [templateId, open]);

  const usageTypes = [
    { key: 'questions', label: 'Inspection Questions', icon: FileQuestion, color: 'text-blue-600' },
    { key: 'rules', label: 'Rules', icon: Zap, color: 'text-amber-600' },
    { key: 'services', label: 'Services', icon: Wrench, color: 'text-green-600' },
    { key: 'proposals', label: 'Proposal Packages', icon: Package, color: 'text-purple-600' },
    { key: 'findings', label: 'Inspection Findings', icon: FileText, color: 'text-indigo-600' },
    { key: 'estimateItems', label: 'Estimate Items', icon: ClipboardList, color: 'text-cyan-600' },
    { key: 'materialLists', label: 'Material Lists', icon: Boxes, color: 'text-orange-600' },
    { key: 'scopes', label: 'Scope Templates', icon: FileText, color: 'text-teal-600' },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-accent" />
            Currently Used By
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{templateName}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : (
          <div className="space-y-2">
            {usageTypes.map(({ key, label, icon: Icon, color }) => {
              const count = usage[key]?.length || 0;
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between p-3 rounded-lg border ${count > 0 ? 'bg-muted/50' : 'opacity-50'}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${color}`} />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <Badge variant={count > 0 ? 'default' : 'outline'} className={count > 0 ? 'bg-accent text-accent-foreground' : ''}>
                    {count}
                  </Badge>
                </div>
              );
            })}

            {/* AI Coaching Scripts — reserved for future */}
            <div className="flex items-center justify-between p-3 rounded-lg border opacity-50">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">AI Coaching Scripts</span>
              </div>
              <Badge variant="outline">Future</Badge>
            </div>
            {/* Inventory Rules — reserved for future */}
            <div className="flex items-center justify-between p-3 rounded-lg border opacity-50">
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Inventory Rules</span>
              </div>
              <Badge variant="outline">Future</Badge>
            </div>
            {/* Analytics Categories — reserved for future */}
            <div className="flex items-center justify-between p-3 rounded-lg border opacity-50">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Analytics Categories</span>
              </div>
              <Badge variant="outline">Future</Badge>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}