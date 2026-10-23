import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CheckCircle2, Clock, Star, Shield, FileText, Camera,
} from 'lucide-react';

const dateOnly = (d) => d ? String(d).split('T')[0] : '';

export default function PerformanceCard({ todayJobs = [], allJobs = [], equipment = [] }) {
  const today = new Date().toLocaleDateString('en-CA');

  // Jobs Completed Today
  const jobsCompletedToday = todayJobs.filter(j => j.status === 'completed').length;

  // On-Time Arrival % (proxy: completed + in_progress jobs / total today jobs)
  const activeToday = todayJobs.filter(j =>
    j.status === 'completed' || j.status === 'in_progress' || j.status === 'inspection_complete'
  ).length;
  const onTimePct = todayJobs.length > 0
    ? Math.round((activeToday / todayJobs.length) * 100)
    : null;

  // Safety Score (equipment in good condition / total)
  const totalEquipment = equipment.length;
  const safeEquipment = equipment.filter(e =>
    e.condition === 'good' || e.condition === 'new'
  ).length;
  const safetyScore = totalEquipment > 0
    ? Math.round((safeEquipment / totalEquipment) * 100)
    : null;

  // Forms Completed (jobs with inspection_complete or completed status)
  const formsCompleted = allJobs.filter(j =>
    j.status === 'inspection_complete' || j.status === 'completed'
  ).length;

  // Photos Uploaded (equipment with photo_url)
  const photosUploaded = equipment.filter(e => e.photo_url).length;

  const stats = [
    { label: 'Jobs Completed', value: jobsCompletedToday, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'On-Time %', value: onTimePct !== null ? `${onTimePct}%` : '—', icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Customer Rating', value: '—', icon: Star, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Safety Score', value: safetyScore !== null ? `${safetyScore}%` : '—', icon: Shield, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'Forms Completed', value: formsCompleted, icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Photos Uploaded', value: photosUploaded, icon: Camera, color: 'text-pink-600', bg: 'bg-pink-50' },
  ];

  return (
    <Card className="border-0 shadow-sm h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {stats.map((s, i) => (
            <div key={i} className="text-center">
              <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center mx-auto mb-1.5`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}