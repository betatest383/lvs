import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Send, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { base44 } from '@/api/base44Client';

const QUICK_PROMPTS = [
  'Suggest the best resource type and tags for this resource',
  'What services or repair templates should this be linked to?',
  'Summarize what this resource covers',
];

export default function AIAssistPanel({ resourceId }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  const askAI = async (q) => {
    const query = q || question;
    if (!query.trim()) return;
    setLoading(true);
    setAnswer('');
    try {
      const response = await base44.functions.invoke('manageProductResource', {
        action: 'ai_assist',
        question: query,
        resource_id: resourceId,
      });
      if (response.data?.success) {
        setAnswer(response.data.answer);
      } else {
        setAnswer('Sorry, I could not process your request.');
      }
    } catch (e) {
      setAnswer('Error: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="rounded-lg bg-primary/10 p-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">AI Assistant</h3>
          <p className="text-xs text-muted-foreground">Ask about classification, linking, or content</p>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask the AI assistant..."
          rows={2}
          className="text-sm"
        />
        <Button
          size="icon"
          onClick={() => askAI()}
          disabled={loading || !question.trim()}
          className="shrink-0"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => {
              setQuestion(prompt);
              askAI(prompt);
            }}
            disabled={loading}
            className="text-xs bg-muted hover:bg-muted/80 text-muted-foreground px-2 py-1 rounded-full transition-colors disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {answer && (
        <div className="prose prose-sm max-w-none text-sm bg-muted/50 rounded-md p-3">
          <ReactMarkdown>{answer}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}