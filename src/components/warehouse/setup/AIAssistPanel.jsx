import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Loader2, BookOpen, Search, MapPin, TrendingDown, Lightbulb, HelpCircle, Lock, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AIResultRenderer from '@/components/warehouse/setup/AIResultRenderer';
import AIPhotoUpload from '@/components/warehouse/setup/AIPhotoUpload';

const ACTIONS = [
  { key: 'explain_step', label: 'Explain This Step', icon: BookOpen },
  { key: 'review_work', label: 'Review My Work', icon: Search },
  { key: 'suggest_bin', label: 'Suggest Bin', icon: MapPin },
  { key: 'explain_discrepancy', label: 'Explain This Discrepancy', icon: TrendingDown },
  { key: 'what_am_i_missing', label: 'What Am I Missing?', icon: Lightbulb },
  { key: 'ask_question', label: 'Ask a Question', icon: HelpCircle },
];

export default function AIAssistPanel({ stepIndex, stepName, session, user, permissions }) {
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [question, setQuestion] = useState('');
  const [showQuestionInput, setShowQuestionInput] = useState(false);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [sessionItems, setSessionItems] = useState([]);

  const sessionId = session?.id || session?.session_id || null;

  const callAI = async (actionKey, itemId = null) => {
    setLoading(true);
    setError(null);
    setActiveAction(actionKey);
    setResult(null);

    if (actionKey === 'ask_question' && !question.trim()) {
      setShowQuestionInput(true);
      setLoading(false);
      return;
    }

    try {
      const payload = {
        action: actionKey,
        session_id: sessionId,
        step_index: stepIndex,
        step_name: stepName,
        inventory_master_id: itemId || selectedItemId || null,
        question: actionKey === 'ask_question' ? question : null,
      };
      const res = await base44.functions.invoke('getWarehouseSetupAI', payload);
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Failed to get AI guidance';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Load session-assigned items for the item picker
  const loadSessionItems = async () => {
    if (!session?.assigned_item_ids?.length) return;
    try {
      const items = await Promise.all(
        session.assigned_item_ids.slice(0, 50).map(id =>
          base44.entities.InventoryMaster.get(id).catch(() => null)
        )
      );
      setSessionItems(items.filter(Boolean));
    } catch (e) {
      console.error('Failed to load session items:', e);
    }
  };

  const handleSuggestBin = async () => {
    setShowItemPicker(true);
    if (sessionItems.length === 0) {
      await loadSessionItems();
    }
  };

  const handleItemSelect = (itemId) => {
    setShowItemPicker(false);
    callAI('suggest_bin', itemId);
  };

  if (permissions && !permissions.can_use_ai) {
    return (
      <div className="bg-card border rounded-lg overflow-hidden opacity-60">
        <div className="flex items-center gap-2 px-4 py-3 bg-muted/30">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-sm text-muted-foreground">AI Warehouse Assistant — {stepName}</span>
        </div>
        <div className="p-4 text-sm text-muted-foreground">
          You do not have permission to use the Warehouse Setup Assistant.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-accent/10 hover:bg-accent/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="font-medium text-sm">AI Warehouse Assistant — {stepName}</span>
          {result?.guide_mode === 'draft_preview' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">Draft</span>
          )}
          {result?.guide_mode === 'general_fallback' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">General</span>
          )}
          {result?.guide_mode === 'published' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300">Published</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          {/* Action buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ACTIONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => {
                  if (key === 'ask_question') {
                    setShowQuestionInput(true);
                    setActiveAction(key);
                  } else if (key === 'suggest_bin') {
                    handleSuggestBin();
                  } else {
                    setShowQuestionInput(false);
                    callAI(key);
                  }
                }}
                disabled={loading}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
                  activeAction === key && !loading
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-muted hover:bg-accent/20 text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Item picker for Suggest Bin */}
          {showItemPicker && sessionItems.length > 0 && (
            <div className="p-3 rounded-md border bg-muted/30 space-y-2">
              <p className="text-xs font-medium">Select an item to suggest a bin for:</p>
              <select
                onChange={(e) => e.target.value && handleItemSelect(e.target.value)}
                defaultValue=""
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Choose an item...</option>
                {sessionItems.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.item_name}{item.sku ? ` (${item.sku})` : ''}{!item.bin_location_id ? ' — No bin' : ` — ${item.bin_location}`}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowItemPicker(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Question input */}
          {showQuestionInput && (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type your question..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') callAI('ask_question'); }}
                className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                onClick={() => callAI('ask_question')}
                disabled={loading || !question.trim()}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Ask
              </button>
            </div>
          )}

          {/* Photo upload toggle — on awaiting_review, framed as post-submission evidence */}
          <button
            onClick={() => setShowPhotoUpload(!showPhotoUpload)}
            className="text-xs text-accent hover:underline"
          >
            {session?.status === 'awaiting_review'
              ? (showPhotoUpload ? 'Hide' : 'Add Post-Submission Evidence')
              : (showPhotoUpload ? 'Hide' : 'Show') + ' Photo Upload'}
          </button>
          {showPhotoUpload && (
            <AIPhotoUpload
              sessionId={sessionId}
              stepName={stepName}
              warehouseName={session?.warehouse_location_name}
              selectedItemId={selectedItemId}
              selectedItemName={selectedItemId ? sessionItems.find(i => i.id === selectedItemId)?.item_name : null}
              selectedItemBin={selectedItemId ? sessionItems.find(i => i.id === selectedItemId)?.bin_location : null}
              selectedItemBinId={selectedItemId ? sessionItems.find(i => i.id === selectedItemId)?.bin_location_id : null}
              onUploaded={() => {
                setResult(null);
              }}
            />
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing session data...
            </div>
          )}

          {/* Error */}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Result */}
          {result && <AIResultRenderer result={result} />}

          {/* Session metrics summary (from server) */}
          {result?.session_context_summary && (
            <div className="p-3 rounded-md bg-muted/30 border text-xs space-y-1">
              <p className="font-medium text-muted-foreground uppercase">Session Snapshot (server-loaded)</p>
              <div className="grid grid-cols-2 gap-1">
                <div>Assigned: <span className="font-medium">{result.session_context_summary.assigned_count}</span></div>
                <div>Counted: <span className="font-medium">{result.session_context_summary.counted_count}</span></div>
                <div>Missing Counts: <span className="font-medium">{result.session_context_summary.missing_count_count}</span></div>
                <div>Missing Bins: <span className="font-medium">{result.session_context_summary.missing_bin_count}</span></div>
                <div>Zero-Count: <span className="font-medium">{result.session_context_summary.zero_count_count}</span></div>
                <div>Cross-Warehouse: <span className="font-medium">{result.session_context_summary.cross_warehouse_count}</span></div>
                <div>Total Qty: <span className="font-medium">{result.session_context_summary.total_quantity}</span></div>
                <div>Evidence: <span className="font-medium">{result.session_context_summary.evidence_count}</span></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}