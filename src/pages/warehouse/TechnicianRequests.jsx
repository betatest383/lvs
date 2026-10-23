import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, ArrowRight, Mail, Phone } from 'lucide-react';
import { useTechnicians } from '@/hooks/useTechnicians';

export default function TechnicianRequests() {
  const { technicians, loading } = useTechnicians();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Technicians</h1>
        <p className="text-muted-foreground text-sm">
          Technicians are managed in the admin section and automatically available here.
        </p>
      </div>

      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {technicians.filter(t => t.active_status).length} active technician{technicians.length !== 1 ? 's' : ''} available for warehouse assignments
          </p>
          <Link to="/admin/technicians">
            <Button variant="outline" size="sm">
              Manage Technicians <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : technicians.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No technicians found.</p>
            <Link to="/admin/technicians">
              <Button variant="outline" size="sm" className="mt-3">Add Technicians</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {technicians.map(tech => (
            <Card key={tech.id} className="border shadow-sm">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{tech.name}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tech.active_status ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {tech.active_status ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {tech.email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="w-3 h-3" /> {tech.email}
                  </p>
                )}
                {tech.phone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {tech.phone}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}