import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Loader2, Truck, Clock, ExternalLink, BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import WfWh001DashboardWidgets from '@/components/warehouse/WfWh001DashboardWidgets';
import { useTechnicians } from '@/hooks/useTechnicians';
import { WF_WH_001_STAGES } from '@/lib/wfWh001';

const STATUS_COLORS = {
  'Hardware Checklist Submitted': 'bg-blue-100 text-blue-700',
  'Transfer Sheet Submitted': 'bg-indigo-100 text-indigo-700',
  'Hardware Pulling Started': 'bg-cyan-100 text-cyan-700',
  'Inventory Pulling Started': 'bg-teal-100 text-teal-700',
  'Materials Staged': 'bg-amber-100 text-amber-700',
  'Forklift Load Required': 'bg-orange-100 text-orange-700',
  'Forklift Load Not Required': 'bg-gray-100 text-gray-700',
  'Truck Loaded': 'bg-purple-100 text-purple-700',
  'Technician Confirmed Receipt': 'bg-green-100 text-green-700',
  'Truck Released': 'bg-green-600 text-white',
};

export default function MorningMaterialRequest() {
  const { technicians } = useTechnicians();
  const [records, setRecords] = useState([]);
  const [sopRecord, setSopRecord] = useState(null);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    load();
    loadSop();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.MorningMaterialRequest.list('-created_date', 200);
      setRecords(recs);
      computeStats(recs);
    } catch (err) {
      toast.error('Failed to load workflow records');
    } finally {
      setLoading(false);
    }
  };

  const loadSop = async () => {
    try {
      const sops = await base44.entities.SopRegistry.filter({ sop_id: 'WH-101' });
      setSopRecord(sops[0]);
    } catch {}
  };

  const computeStats = (recs) => {
    const waiting = recs.filter(r =>
      ['Hardware Checklist Submitted', 'Transfer Sheet Submitted', 'Hardware Pulling Started'].includes(r.status)
    ).length;

    const loading = recs.filter(r =>
      ['Inventory Pulling Started', 'Materials Staged', 'Forklift Load Required'].includes(r.status)
    ).length;

    const staged = recs.filter(r => r.status === 'Materials Staged').length;

    const released = recs.filter(r => r.status === 'Truck Released').length;

    const releasedTimes = recs
      .filter(r => r.total_loading_time_minutes != null)
      .map(r => r.total_loading_time_minutes);
    const avgLoadTime = releasedTimes.length > 0
      ? Math.round(releasedTimes.reduce((a, b) => a + b, 0) / releasedTimes.length)
      : null;

    const missingTransferSheets = recs.filter(r =>
      !r.material_transfer_sheet_id && r.status !== 'Truck Released'
    ).length;

    const forkliftPending = recs.filter(r =>
      r.forklift_required && ['Materials Staged', 'Forklift Load Required'].includes(r.status)
    ).length;

    // Longest waiting technician — earliest created_date among non-released records
    const waitingRecs = recs.filter(r => r.status !== 'Truck Released')
      .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    const longestWaitingTech = waitingRecs[0]?.technician || null;

    setStats({
      waiting,
      loading,
      staged,
      released,
      avgLoadTime,
      missingTransferSheets,
      forkliftPending,
      longestWaitingTech,
    });
  };

  const handleQuickCreate = async (techName) => {
    setCreating(true);
    try {
      const tech = technicians.find(t => t.name === techName);
      const count = records.length + 1;
      await base44.entities.MorningMaterialRequest.create({
        workflow_id: `WF-WH-001-${String(count).padStart(3, '0')}`,
        technician: techName,
        truck_number: tech?.truck_number || '',
        date: today,
        job_number: '',
        warehouse_associate: '',
        forklift_required: false,
        status: 'Hardware Checklist Submitted',
        current_stage_index: 0,
        ts_hardware_checklist_submitted: new Date().toISOString(),
        related_sop_id: 'WH-101',
        trainual_url: sopRecord?.trainual_url || '',
      });
      toast.success(`Workflow created for ${techName}`);
      load();
    } catch (err) {
      toast.error('Failed to create workflow');
    } finally {
      setCreating(false);
    }
  };

  const trainualUrl = sopRecord?.trainual_url;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Morning Material Request</h1>
          <p className="text-muted-foreground text-sm">
            WF-WH-001 · {WF_WH_001_STAGES.length}-stage workflow for WH-101 Assist in Loading Trucks
          </p>
        </div>
        <div className="flex gap-2">
          {trainualUrl && (
            <a href={trainualUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">
                <BookOpen className="w-4 h-4 mr-2" /> View SOP
                <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </a>
          )}
          <Button onClick={() => setShowCreate(!showCreate)} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="w-4 h-4 mr-2" /> New Request
          </Button>
        </div>
      </div>

      {/* Quick Create */}
      {showCreate && (
        <Card className="border-accent/30">
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-3">Select a technician to start a new material request:</p>
            <div className="flex flex-wrap gap-2">
              {technicians.filter(t => t.active_status).map(tech => (
                <button
                  key={tech.id}
                  onClick={() => { handleQuickCreate(tech.name); setShowCreate(false); }}
                  disabled={creating}
                  className="px-3 py-1.5 rounded-lg border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm font-medium transition-colors"
                >
                  {tech.name}{tech.truck_number ? ` — Truck ${tech.truck_number}` : ''}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dashboard Widgets */}
      <WfWh001DashboardWidgets stats={stats} />

      {/* Active Workflow Cards */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Active Requests ({records.filter(r => r.status !== 'Truck Released').length})
        </h2>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : records.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground text-sm">
              No morning material requests yet. Click "New Request" to start one.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {records
              .sort((a, b) => {
                const aDone = a.status === 'Truck Released';
                const bDone = b.status === 'Truck Released';
                if (aDone !== bDone) return aDone ? 1 : -1;
                return new Date(b.created_date) - new Date(a.created_date);
              })
              .map(rec => {
                const stages = WF_WH_001_STAGES.filter(s => !s.conditional || rec.forklift_required);
                const stageIdx = stages.findIndex(s => s.label === rec.status);
                const isWaiting = !rec.material_transfer_sheet_id && rec.status !== 'Truck Released';
                return (
                  <Link key={rec.id} to={`/warehouse/morning-material-request/${rec.id}`}>
                    <Card className={`border shadow-sm hover:shadow-md transition-shadow h-full ${rec.status === 'Truck Released' ? 'opacity-60' : ''}`}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{rec.technician}</p>
                            <p className="text-xs text-muted-foreground">
                              Truck {rec.truck_number || '—'} · {rec.date}
                            </p>
                          </div>
                          <Badge className={`shrink-0 ${STATUS_COLORS[rec.status] || 'bg-gray-100 text-gray-700'}`}>
                            {rec.status}
                          </Badge>
                        </div>

                        {/* Progress bar */}
                        <div className="flex gap-1">
                          {stages.map((s, i) => (
                            <div
                              key={s.key}
                              className={`flex-1 h-1.5 rounded-full ${i <= stageIdx ? 'bg-accent' : 'bg-muted'}`}
                            />
                          ))}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>Stage {stageIdx + 1}/{stages.length}</span>
                          {rec.forklift_required && <span className="text-orange-600">⚙ Forklift</span>}
                          {isWaiting && <span className="text-red-600 flex items-center gap-1"><Clock className="w-3 h-3" />No Transfer Sheet</span>}
                          {rec.total_loading_time_minutes != null && (
                            <span className="text-green-600">{rec.total_loading_time_minutes}m total</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}