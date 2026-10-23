import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Network, FileText } from 'lucide-react';
import {
  CERTIFICATION_REGISTRY_LINK_CONFIG, CERTIFICATION_STATUS_COLORS, CERTIFICATION_TYPE_COLORS
} from '@/lib/certificationRegistryConstants';

export default function CertificationRelationships() {
  const [certifications, setCertifications] = useState([]);
  const [registryData, setRegistryData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const certRecs = await base44.entities.CertificationRegistry.list('-created_date', 500);
        setCertifications(certRecs);

        const entries = await Promise.all(
          CERTIFICATION_REGISTRY_LINK_CONFIG.map(async (cfg) => {
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

  const reverseMaps = {};
  CERTIFICATION_REGISTRY_LINK_CONFIG.forEach(cfg => {
    reverseMaps[cfg.field] = {};
    certifications.forEach(c => {
      const links = c[cfg.field] || [];
      links.forEach(id => {
        if (!reverseMaps[cfg.field][id]) reverseMaps[cfg.field][id] = [];
        reverseMaps[cfg.field][id].push(c);
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
        <h1 className="text-2xl font-bold tracking-tight">Certification Relationships</h1>
        <p className="text-muted-foreground text-sm">Cross-references between certifications and roles, trainings, policies, SOPs, and workflows</p>
      </div>

      {certifications.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-xl">
          <Network className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No certifications yet.
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Certifications and Their Links</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {certifications.map(c => {
                const totalLinks = CERTIFICATION_REGISTRY_LINK_CONFIG.reduce((s, cfg) => s + (c[cfg.field]?.length || 0), 0);
                return (
                  <div key={c.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Link to={`/lvcos/certifications/detail/${c.id}`} className="font-medium text-sm hover:text-accent">{c.certification_name}</Link>
                      <div className="flex items-center gap-1.5">
                        {c.certification_type && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${CERTIFICATION_TYPE_COLORS[c.certification_type]}`}>{c.certification_type}</span>}
                        {c.status && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${CERTIFICATION_STATUS_COLORS[c.status]}`}>{c.status}</span>}
                        <span className="text-xs text-muted-foreground">{totalLinks} link{totalLinks !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {CERTIFICATION_REGISTRY_LINK_CONFIG.map(cfg => {
                        const count = c[cfg.field]?.length || 0;
                        if (count === 0) return null;
                        return <span key={cfg.field} className="px-2 py-0.5 rounded-full bg-muted text-xs">{cfg.label}: {count}</span>;
                      })}
                      {totalLinks === 0 && <span className="text-xs text-muted-foreground">No relationships linked</span>}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {CERTIFICATION_REGISTRY_LINK_CONFIG.map(cfg => {
            const reverseMap = reverseMaps[cfg.field] || {};
            const linkedIds = Object.keys(reverseMap);
            if (linkedIds.length === 0) return null;
            return (
              <Card key={cfg.field}>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Network className="w-4 h-4" /> {cfg.label} → Certifications</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {linkedIds.map(id => (
                    <div key={id} className="flex flex-col gap-1 border-b last:border-0 pb-2 last:pb-0">
                      <p className="text-sm font-medium">{findLabel(cfg, id)} <span className="text-xs text-muted-foreground font-mono">({id})</span></p>
                      <div className="flex flex-wrap gap-1">
                        {reverseMap[id].map(c => (
                          <Link key={c.id} to={`/lvcos/certifications/detail/${c.id}`} className="px-2 py-0.5 rounded-full bg-muted text-xs hover:bg-muted/70 transition-colors">
                            {c.certification_name}
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