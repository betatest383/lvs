import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BookOpen, Search } from 'lucide-react';
import {
  NOTIFICATION_RULES, NOTIFICATION_TYPE_COLORS, PRIORITY_COLORS,
} from '@/lib/notificationConstants';

export default function NotificationRules() {
  const [search, setSearch] = useState('');

  const filtered = NOTIFICATION_RULES.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.module.toLowerCase().includes(q) || r.trigger.toLowerCase().includes(q) || r.recipients.toLowerCase().includes(q);
  });

  const byModule = {};
  filtered.forEach(r => {
    if (!byModule[r.module]) byModule[r.module] = [];
    byModule[r.module].push(r);
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notification Rules</h1>
        <p className="text-muted-foreground text-sm">Automatic notification routing rules for every LVC OS module.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search rules by module, trigger, or recipient..." className="pl-9 max-w-md" />
      </div>

      <div className="space-y-4">
        {Object.entries(byModule).map(([module, rules]) => (
          <Card key={module}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><BookOpen className="w-4 h-4 text-accent" /> {module} ({rules.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {rules.map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{r.trigger}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Recipients: {r.recipients}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${NOTIFICATION_TYPE_COLORS[r.type] || ''}`}>{r.type}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${PRIORITY_COLORS[r.priority] || ''}`}>{r.priority}</span>
                    {r.requiresAck && <span className="px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700 font-medium">Ack Required</span>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No rules match your search.</CardContent></Card>
      )}
    </div>
  );
}