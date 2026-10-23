import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { LayoutDashboard, CheckSquare, FileText } from 'lucide-react';

export default function DirectorPortal() {
  const destinations = [
    { to: '/operations-director', icon: LayoutDashboard, title: 'Dashboard', desc: 'Director of Operations portal home' },
    { to: '/tasks', icon: CheckSquare, title: 'Tasks & Notifications', desc: 'Task center and alerts' },
    { to: '/forms', icon: FileText, title: 'Forms Center', desc: 'Access forms and documents' },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Director of Operations</h1>
      <p className="text-muted-foreground mb-6">Operations Leadership Portal</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {destinations.map(d => (
          <Link key={d.to} to={d.to}>
            <Card className="hover:border-accent transition-colors">
              <CardContent className="p-6 flex flex-col items-center text-center">
                <d.icon className="w-10 h-10 text-accent mb-3" />
                <h3 className="font-semibold">{d.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{d.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}