import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Network, FileText } from 'lucide-react';
import {
  TRAINING_REGISTRY_LINK_CONFIG, TRAINING_STATUS_COLORS, TRAINING_TYPE_COLORS
} from '@/lib/trainingRegistryConstants';

export default function TrainingRelationships() {
  const [trainings, setTrainings] = useState([]);
  const [registryData, setRegistryData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await base44.functions.invoke('manageTraining', { action: 'list' });
        const trainingRecs = res.data?.guides || [];
        setTrainings(trainingRecs);

        const entries = await Promise.all(
          TRAINING_REGISTRY_LINK_CONFIG.map(async (cfg) => {
            try {
              const recs = await base44.entities[cfg.entity].list('-created_date', 200);
              return [cfg.field, recs || []];
            } catch {
              return [cfg.field, []];
            }
          })
        );
        setRegistryData(Object.fromEntries(entries));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  // Reverse maps: for each registry item, which trainings reference it
  const reverseMaps = {};
  TRAINING_REGISTRY_LINK_CONFIG.forEach(cfg => {
    reverseMaps[cfg.field] = {};
    trainings.forEach(t => {
      const links = t[cfg.field] || [];
      links.forEach(id => {
        if (!reverseMaps[cfg.field][id]) reverseMaps[cfg.field][id] = [];
        reverseMaps[cfg.field][id].push(t);
      });
    });
  });

  const findLabel = (cfg, id) => {
    const recs = registryData[cfg.field] || [];
    const rec = recs.find(r => r[cfg.idField] === id);
    return rec ? rec[cfg.labelField] : id;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Training Relationships</h1>
        <p className="text-muted-foreground text-sm">Cross-references between trainings and roles, SOPs, policies, workflows, forms, KPIs, and audits</p>
      </div>

      {trainings.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-xl">
          <Network className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No trainings yet.
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Trainings and Their Links</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {trainings.map(t => {
                const totalLinks = TRAINING_REGISTRY_LINK_CONFIG.reduce((s, cfg) => s + (t[cfg.field]?.length || 0), 0) + (t.related_certifications?.length || 0);
                return (
                  <div key={t.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Link to={`/lvcos/training/detail/${t.id}`} className="font-medium text-sm hover:text-accent">{t.training_name}</Link>
                      <div className="flex items-center gap-1.5">
                        {t.training_type && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${TRAINING_TYPE_COLORS[t.training_type]}`}>{t.training_type}</span>}
                        {t.status && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${TRAINING_STATUS_COLORS[t.status]}`}>{t.status}</span>}
                        <span className="text-xs text-muted-foreground">{totalLinks} link{totalLinks !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {TRAINING_REGISTRY_LINK_CONFIG.map(cfg => {
                        const count = t[cfg.field]?.length || 0;
                        if (count === 0) return null;
                        return <span key={cfg.field} className="px-2 py-0.5 rounded-full bg-muted text-xs">{cfg.label}: {count}</span>;
                      })}
                      {t.related_certifications?.length > 0 && <span className="px-2 py-0.5 rounded-full bg-muted text-xs">Certifications: {t.related_certifications.length}</span>}
                      {totalLinks === 0 && <span className="text-xs text-muted-foreground">No relationships linked</span>}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {TRAINING_REGISTRY_LINK_CONFIG.map(cfg => {
            const reverseMap = reverseMaps[cfg.field] || {};
            const linkedIds = Object.keys(reverseMap);
            if (linkedIds.length === 0) return null;
            return (
              <Card key={cfg.field}>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Network className="w-4 h-4" /> {cfg.label} → Trainings</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {linkedIds.map(id => (
                    <div key={id} className="flex flex-col gap-1 border-b last:border-0 pb-2 last:pb-0">
                      <p className="text-sm font-medium">{findLabel(cfg, id)} <span className="text-xs text-muted-foreground font-mono">({id})</span></p>
                      <div className="flex flex-wrap gap-1">
                        {reverseMap[id].map(t => (
                          <Link key={t.id} to={`/lvcos/training/detail/${t.id}`} className="px-2 py-0.5 rounded-full bg-muted text-xs hover:bg-muted/70 transition-colors">
                            {t.training_name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}