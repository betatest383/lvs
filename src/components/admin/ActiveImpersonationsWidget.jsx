import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Eye } from 'lucide-react';

export default function ActiveImpersonationsWidget() {
  const [activeLogs, setActiveLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await base44.entities.ImpersonationLog.filter({ status: 'active' }, '-start_time', 20);
        setActiveLogs(res || []);
      } catch {
        // Non-admins may not have access — that's fine
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading || activeLogs.length === 0) return null;

  return (
    <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-orange-600" />
          <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400">
            Active Impersonations ({activeLogs.length})
          </h3>
        </div>
        <div className="space-y-2">
          {activeLogs.map((log) => {
            const duration = log.start_time
              ? Math.round((Date.now() - new Date(log.start_time).getTime()) / 60000)
              : 0;
            return (
              <div key={log.id} className="flex items-center justify-between text-sm bg-white dark:bg-card rounded-md px-3 py-2">
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-medium">{log.admin_name}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium">{log.impersonated_employee_name}</span>
                  <Badge variant="secondary" className="text-xs">{log.impersonated_role || '—'}</Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{duration}m</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}