import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ClipboardCheck, AlertCircle, CheckCircle2, Users } from 'lucide-react';
import {
  POLICY_STATUS_COLORS, ENFORCEMENT_LEVEL_COLORS, POLICY_REGISTRY_LINK_CONFIG
} from '@/lib/policyRegistryConstants';

export default function PolicyAcknowledgments() {
  const [policies, setPolicies] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [policyRecs, roleRecs] = await Promise.all([
          base44.entities.PolicyRegistry.list('-created_date', 500),
          base44.entities.RoleRegistry.filter({ status: 'Active' }, 'sort_order', 200),
        ]);
        setPolicies(policyRecs);
        setRoles(roleRecs);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const requiresAck = policies.filter(p => p.requires_acknowledgment && p.status !== 'Retired');
  const byFreq = {};
  requiresAck.forEach(p => {
    const f = p.acknowledgment_frequency || 'Unspecified';
    byFreq[f] = (byFreq[f] || 0) + 1;
  });

  // For each policy requiring acknowledgment, find related roles
  const getRelatedRoles = (policy) => {
    const roleIds = policy.related_roles || [];
    return roles.filter(r => roleIds.includes(r.role_id) || roleIds.includes(r.role_name));
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Policy Acknowledgments</h1>
        <p className="text-muted-foreground text-sm">Policies requiring employee acknowledgment and their assigned roles</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-purple-100 text-purple-600"><ClipboardCheck className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{requiresAck.length}</p><p className="text-xs text-muted-foreground">Require Acknowledgment</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-amber-100 text-amber-600"><AlertCircle className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{requiresAck.filter(p => !p.acknowledgment_frequency).length}</p><p className="text-xs text-muted-foreground">Missing Frequency</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-blue-100 text-blue-600"><Users className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{requiresAccumulatedRoles(requiresAck, roles)}</p><p className="text-xs text-muted-foreground">Roles Affected</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-green-100 text-green-600"><CheckCircle2 className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{policies.filter(p => p.status === 'Active' && !p.requires_acknowledgment).length}</p><p className="text-xs text-muted-foreground">No Ack Required</p>
        </CardContent></Card>
      </div>

      {Object.keys(byFreq).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">By Acknowledgment Frequency</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(byFreq).map(([freq, count]) => (
                <div key={freq} className="flex items-center gap-2">
                  <span className="px-2 py-1 rounded-full text-sm font-medium bg-muted">{freq}</span>
                  <span className="text-lg font-bold">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {requiresAck.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-xl">
          <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No policies require acknowledgment yet.
        </div>
      ) : (
        <div className="space-y-3">
          {requiresAck.map(p => {
            const relatedRoles = getRelatedRoles(p);
            return (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <Link to={`/lvcos/policies/detail/${p.id}`} className="font-medium text-sm hover:text-accent">{p.policy_name}</Link>
                      <span className="font-mono text-xs text-muted-foreground ml-2">{p.policy_id}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {p.enforcement_level && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${ENFORCEMENT_LEVEL_COLORS[p.enforcement_level]}`}>{p.enforcement_level}</span>}
                      {p.status && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${POLICY_STATUS_COLORS[p.status]}`}>{p.status}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">{p.acknowledgment_frequency || 'Frequency not set'}</span>
                    {p.policy_type && <span>{p.policy_type}</span>}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> Related Roles ({relatedRoles.length})</p>
                    {relatedRoles.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No roles linked — assign roles in the policy editor.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {relatedRoles.map(r => (
                          <Link key={r.id} to={`/roles/detail/${r.id}`} className="px-2 py-0.5 rounded-full bg-muted text-xs hover:bg-muted/70 transition-colors">
                            {r.role_name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function requiresAccumulatedRoles(policies, roles) {
  const allRoleIds = new Set();
  policies.forEach(p => {
    (p.related_roles || []).forEach(id => allRoleIds.add(id));
  });
  return allRoleIds.size;
}