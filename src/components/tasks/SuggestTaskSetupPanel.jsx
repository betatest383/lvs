import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, Check, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentRole } from '@/hooks/useCurrentRole';

export default function SuggestTaskSetupPanel({ onApply, department }) {
  const { role } = useCurrentRole();
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [acceptedFields, setAcceptedFields] = useState({});

  const isAuthorized = role === 'admin' || role === 'owner' || role === 'director_of_operations' || role === 'operations_manager';

  const handleSuggest = async () => {
    if (!description.trim()) return;
    setLoading(true);
    setSuggestions(null);
    setAcceptedFields({});
    try {
      const response = await base44.functions.invoke('suggestTaskSetup', {
        description,
        department,
      });
      if (response.data?.success) {
        setSuggestions(response.data.suggestions);
      } else {
        toast.error(response.data?.error || 'Failed to get suggestions');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to get suggestions');
    } finally {
      setLoading(false);
    }
  };

  const toggleField = (field, value) => {
    setAcceptedFields(prev => ({
      ...prev,
      [field]: prev[field] ? undefined : value,
    }));
  };

  const handleApply = () => {
    const applied = {};
    for (const [key, val] of Object.entries(acceptedFields)) {
      if (val !== undefined) applied[key] = val;
    }
    onApply?.(applied);
    toast.success('Suggestions applied to form');
    setDescription('');
    setSuggestions(null);
    setAcceptedFields({});
  };

  if (!isAuthorized) return null;

  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-semibold">Suggest Task Setup (Advisory AI)</h3>
        <Badge variant="outline" className="text-xs">Advisory Only</Badge>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Describe the task in natural language</Label>
        <Textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. We need to restock the overflow shelf in the main warehouse with stainless steel chimney caps"
          rows={3}
          className="text-sm"
        />
      </div>

      <Button type="button" size="sm" onClick={handleSuggest} disabled={loading || !description.trim()}>
        {loading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
        Get Suggestions
      </Button>

      {suggestions && (
        <div className="space-y-3 mt-2">
          {suggestions.suggested_template ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">Suggested Template:</span>
                <Badge variant="secondary" className="text-xs">{suggestions.suggested_template.template_name}</Badge>
                <span className="text-xs text-muted-foreground">{suggestions.suggested_template.template_number}</span>
              </div>
              <SuggestionRow label="Work Category" value={suggestions.work_category} field="work_category" accepted={acceptedFields} onToggle={toggleField} />
              <SuggestionRow label="Priority" value={suggestions.priority} field="priority" accepted={acceptedFields} onToggle={toggleField} />
              <SuggestionRow label="Assignment Mode" value={suggestions.assignment_mode} field="assignment_mode" accepted={acceptedFields} onToggle={toggleField} />
              <SuggestionRow label="Execution Mode" value={suggestions.execution_mode} field="execution_mode" accepted={acceptedFields} onToggle={toggleField} />
              {suggestions.acknowledgment_recommendation && (
                <SuggestionRow label="Requires Acknowledgment" value="Yes" field="requires_immediate_acknowledgment" accepted={acceptedFields} onToggle={toggleField} />
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-amber-600">
              <AlertTriangle className="w-3 h-3" />
              {suggestions.warning || 'No matching published template found.'}
            </div>
          )}

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{suggestions.explanation}</p>
            {suggestions.confidence !== undefined && (
              <p className="text-xs text-muted-foreground">Confidence: {suggestions.confidence}%</p>
            )}
            {suggestions.missing_information?.length > 0 && (
              <p className="text-xs text-muted-foreground">Missing info: {suggestions.missing_information.join(', ')}</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleApply} disabled={Object.values(acceptedFields).filter(v => v !== undefined).length === 0}>
              <Check className="w-3.5 h-3.5 mr-1" /> Apply Selected
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setSuggestions(null); setAcceptedFields({}); }}>
              <X className="w-3.5 h-3.5 mr-1" /> Dismiss
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground italic">
        AI suggestions are advisory only. No data is saved automatically. You must explicitly apply suggestions to use them. Orchestration remains in Preview mode.
      </p>
    </div>
  );
}

function SuggestionRow({ label, value, field, accepted, onToggle }) {
  const isAccepted = accepted[field] !== undefined;
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onToggle(field, value)}
          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isAccepted ? 'bg-accent border-accent text-accent-foreground' : 'border-input'}`}
        >
          {isAccepted && <Check className="w-3 h-3" />}
        </button>
        <span className="font-medium">{label}:</span>
        <span className="text-muted-foreground">{value}</span>
      </div>
    </div>
  );
}