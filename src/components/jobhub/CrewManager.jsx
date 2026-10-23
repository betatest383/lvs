import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, UserPlus, X, Crown } from 'lucide-react';

export default function CrewManager({ workflow, crewMembers, onSetCrew, currentUserEmail, isLead }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Apprentice');

  const handleAdd = () => {
    if (!name.trim() || !email.trim()) return;
    const newCrew = [...(crewMembers || []), { name: name.trim(), email: email.trim(), role }];
    onSetCrew(newCrew);
    setName(''); setEmail(''); setRole('Apprentice');
    setShowAdd(false);
  };

  const handleRemove = (em) => {
    onSetCrew((crewMembers || []).filter(c => c.email !== em));
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> Today's Crew
          </CardTitle>
          {isLead && (
            <Button size="sm" variant="ghost" className="h-6 text-xs gap-1"
              onClick={() => setShowAdd(!showAdd)}>
              <UserPlus className="w-3 h-3" /> Add
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {showAdd && (
          <div className="space-y-1.5 p-2 rounded bg-muted/50 mb-1">
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Name" className="w-full px-2 py-1 text-xs rounded border bg-background" />
            <input value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email" className="w-full px-2 py-1 text-xs rounded border bg-background" />
            <select value={role} onChange={e => setRole(e.target.value)}
              className="w-full px-2 py-1 text-xs rounded border bg-background">
              <option>Lead Technician</option>
              <option>Apprentice</option>
              <option>Mason</option>
              <option>Helper</option>
            </select>
            <Button size="sm" className="w-full h-7 text-xs" onClick={handleAdd}>Add Member</Button>
          </div>
        )}
        {(crewMembers || []).map(c => (
          <div key={c.email} className="flex items-center gap-2 text-xs">
            <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
              {c.email === workflow?.lead_technician_email ? (
                <Crown className="w-3 h-3 text-accent" />
              ) : (
                <span className="text-[9px] font-medium text-accent">
                  {(c.name || '?')[0]}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium">{c.name}</p>
              <p className="text-[10px] text-muted-foreground">{c.role}</p>
            </div>
            {isLead && c.email !== workflow?.lead_technician_email && (
              <button onClick={() => handleRemove(c.email)} className="text-muted-foreground hover:text-red-500">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {(!crewMembers || crewMembers.length === 0) && (
          <p className="text-xs text-muted-foreground">No crew members added</p>
        )}
      </CardContent>
    </Card>
  );
}