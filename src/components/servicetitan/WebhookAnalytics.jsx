import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Inbox, CheckCircle, Ban, XCircle, AlertTriangle, RotateCcw, Clock, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function WebhookAnalytics() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const all = await base44.entities.ServiceTitanWebhookEvent.list('-received_at', 500);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const receivedToday = all.filter(e => e.received_at && new Date(e.received_at) >= today).length;
        const processed = all.filter(e => e.processing_status === 'processed').length;
        const ignored = all.filter(e => e.processing_status === 'ignored').length;
        const failed = all.filter(e => e.processing_status === 'failed').length;
        const deadLetter = all.filter(e => e.processing_status === 'dead_letter').length;
        const replayCount = all.reduce((sum, e) => sum + (e.replay_count || 0), 0);
        const failureRate = all.length > 0
          ? ((failed + deadLetter) / all.length * 100).toFixed(1)
          : '0.0';

        // Average processing time (received → processed)
        const processedWithTimes = all.filter(e => e.received_at && e.processed_at);
        const avgProcessingTime = processedWithTimes.length > 0
          ? Math.round(processedWithTimes.reduce((sum, e) => {
              return sum + (new Date(e.processed_at).getTime() - new Date(e.received_at).getTime());
            }, 0) / processedWithTimes.length)
          : 0;

        // Average handler time from timeline
        let avgHandlerTime = 0;
        try {
          const handlerEntries = await base44.entities.ServiceTitanWebhookTimeline.filter(
            { stage: 'handler_finished' },
            '-timestamp',
            200
          );
          const withDuration = handlerEntries.filter(e => e.duration_ms != null && e.duration_ms > 0);
          avgHandlerTime = withDuration.length > 0
            ? Math.round(withDuration.reduce((sum, e) => sum + e.duration_ms, 0) / withDuration.length)
            : 0;
        } catch {
          // Timeline entity might not have data yet
        }

        setStats({
          receivedToday, processed, ignored, failed, deadLetter,
          replayCount, failureRate, avgProcessingTime, avgHandlerTime,
          total: all.length,
        });
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.round(ms / 60000)}m`;
  };

  const cards = [
    { label: 'Received Today', value: stats.receivedToday, icon: Inbox, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Processed', value: stats.processed, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' },
    { label: 'Ignored', value: stats.ignored, icon: Ban, color: 'text-gray-500', bg: 'bg-gray-100' },
    { label: 'Failed', value: stats.failed, icon: XCircle, color: 'text-yellow-600', bg: 'bg-yellow-100' },
    { label: 'Dead Letter', value: stats.deadLetter, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100' },
    { label: 'Replay Count', value: stats.replayCount, icon: RotateCcw, color: 'text-purple-600', bg: 'bg-purple-100' },
    { label: 'Avg Processing', value: formatDuration(stats.avgProcessingTime), icon: Clock, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { label: 'Avg Handler', value: formatDuration(stats.avgHandlerTime), icon: Clock, color: 'text-teal-600', bg: 'bg-teal-100' },
    { label: 'Failure Rate', value: `${stats.failureRate}%`, icon: TrendingDown, color: stats.failureRate > 10 ? 'text-red-600' : 'text-green-600', bg: stats.failureRate > 10 ? 'bg-red-100' : 'bg-green-100' },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <Card key={i} className="p-2">
            <CardContent className="p-0 flex flex-col items-center text-center gap-1">
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', card.bg)}>
                <Icon className={cn('w-4 h-4', card.color)} />
              </div>
              <span className="text-lg font-bold">{card.value}</span>
              <span className="text-[10px] text-muted-foreground leading-tight">{card.label}</span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}