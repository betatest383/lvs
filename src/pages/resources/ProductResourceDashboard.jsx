import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, ClipboardCheck, Library, FileStack, Clock, CheckCircle, Globe } from 'lucide-react';
import ResourceCard from '@/components/resources/ResourceCard';
import { RESOURCE_STATUSES, RESOURCE_TYPES } from '@/lib/productResourceConstants';

export default function ProductResourceDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await base44.functions.invoke('manageProductResource', { action: 'stats' });
        if (res.data?.success) setStats(res.data.stats);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  const kpiCards = [
    { label: 'Total Resources', value: stats?.total || 0, icon: FileStack, color: 'text-slate-600' },
    { label: 'Pending Review', value: stats?.pendingReview || 0, icon: Clock, color: 'text-amber-600' },
    { label: 'Published', value: stats?.published || 0, icon: Globe, color: 'text-green-600' },
    { label: 'Drafts', value: stats?.draft || 0, icon: ClipboardCheck, color: 'text-blue-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Overview of product resources and workflow status</p>
        </div>
        <div className="flex gap-2">
          <Link to="/resources/upload">
            <Button><Upload className="h-4 w-4 mr-1" /> Upload Resource</Button>
          </Link>
          <Link to="/resources/library">
            <Button variant="outline"><Library className="h-4 w-4 mr-1" /> Browse Library</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="rounded-lg bg-muted p-2.5">
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Resources by Status</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {RESOURCE_STATUSES.map((status) => {
              const count = stats?.byStatus?.[status] || 0;
              const pct = stats?.total ? (count / stats.total) * 100 : 0;
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="text-xs w-36 text-muted-foreground truncate">{status}</span>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary/30 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-medium w-6 text-right">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Resources by Type</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {RESOURCE_TYPES.map((type) => {
              const count = stats?.byType?.[type] || 0;
              if (count === 0) return null;
              return (
                <div key={type} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{type}</span>
                  <span className="font-medium">{count}</span>
                </div>
              );
            })}
            {(!stats?.byType || Object.keys(stats.byType).length === 0) && (
              <p className="text-xs text-muted-foreground">No resources yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Recent Uploads</h3>
        {stats?.recentUploads && stats.recentUploads.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.recentUploads.map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <FileStack className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No resources uploaded yet</p>
            <Link to="/resources/upload" className="mt-2 inline-block">
              <Button size="sm" variant="outline">Upload your first resource</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}