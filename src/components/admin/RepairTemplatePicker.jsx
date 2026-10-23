import { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RefreshCw, AlertCircle, Inbox } from 'lucide-react';

/**
 * Reusable Repair Template picker.
 * Loads active records from RepairRecommendationTemplate (NOT MasterClassification).
 * Displays template_name, saves the template record ID.
 * Includes refresh button and empty-state messaging.
 *
 * @param {string} value - Selected template ID
 * @param {(templateId: string, template: object) => void} onChange
 * @param {(templates: array) => void} [onTemplatesLoaded] - Exposes loaded templates to parent
 * @param {string} [label]
 * @param {string} [placeholder]
 * @param {string} [className] - Applied to SelectTrigger
 */
export default function RepairTemplatePicker({ value, onChange, onTemplatesLoaded, label, placeholder, className }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const onLoadedRef = useRef(onTemplatesLoaded);
  onLoadedRef.current = onTemplatesLoaded;

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const records = await base44.entities.RepairRecommendationTemplate.filter(
        { is_active: true, template_status: 'active' },
        'template_name',
        200
      );
      setTemplates(records);
      onLoadedRef.current?.(records);
    } catch (e) {
      setError(true);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleChange = (templateId) => {
    const tmpl = templates.find(t => t.id === templateId);
    onChange?.(templateId, tmpl);
  };

  return (
    <div className="space-y-1 w-full">
      {label && <Label className="text-xs">{label}</Label>}
      <div className="flex items-center gap-1 w-full">
        <Select value={value || ''} onValueChange={handleChange} disabled={loading && templates.length === 0}>
          <SelectTrigger className={`flex-1 ${className || ''}`}>
            <SelectValue placeholder={loading ? 'Loading templates...' : (placeholder || 'Select a repair template...')} />
          </SelectTrigger>
          <SelectContent>
            {templates.map(t => (
              <SelectItem key={t.id} value={t.id}>
                <span className="flex items-center gap-2">
                  <span>{t.template_name}</span>
                  {t.deficiency_type && <code className="text-[10px] text-muted-foreground">{t.deficiency_type}</code>}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={loadTemplates}
          title="Refresh templates"
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      {!loading && !error && templates.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Inbox className="w-3.5 h-3.5 shrink-0" />
          No active repair templates found. Create one in Repair Recommendation Config.
        </p>
      )}
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          Failed to load repair templates. Click refresh to retry.
        </p>
      )}
    </div>
  );
}