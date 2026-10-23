import { Card, CardContent } from '@/components/ui/card';
import { Construction, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function RegistryPlaceholder({ title, description, icon: Icon = Construction }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <Card className="border-dashed">
        <CardContent className="p-12 text-center">
          <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
            <Icon className="w-7 h-7 text-accent" />
          </div>
          <h2 className="text-lg font-semibold mb-1">Registry Under Design</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            This registry is part of the LVC OS module and will be configured with its own fields and workflows.
            Once the schema is defined, records will appear here.
          </p>
          <Link to="/lvcos" className="inline-flex items-center text-sm text-accent hover:underline">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to LVC OS Dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}