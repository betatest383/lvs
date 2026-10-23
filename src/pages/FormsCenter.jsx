import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { getFormsByCategory } from '@/lib/formsCatalog';

const CATEGORY_COLORS = {
  'Warehouse': 'bg-amber-100 text-amber-700',
  'Field Operations': 'bg-blue-100 text-blue-700',
  'Safety': 'bg-red-100 text-red-700',
  'Human Resources': 'bg-purple-100 text-purple-700',
  'Customer Service': 'bg-green-100 text-green-700',
  'Management': 'bg-indigo-100 text-indigo-700',
  'Administration': 'bg-slate-100 text-slate-700',
};

export default function FormsCenter() {
  const { user } = useAuth();
  const role = user?.role || 'customer';
  const groups = getFormsByCategory(role);
  const totalCount = groups.reduce((s, g) => s + g.forms.length, 0);

  if (totalCount === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-bold mb-2">Forms Center</h1>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p className="text-sm">No forms are assigned to your role yet.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-bold">Forms Center</h1>
        <p className="text-xs text-muted-foreground">{totalCount} form{totalCount !== 1 ? 's' : ''} available for your role</p>
      </div>

      <div className="space-y-6">
        {groups.map(group => (
          <div key={group.category}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[group.category]}`}>
                {group.category}
              </span>
              <span className="text-xs text-muted-foreground">{group.forms.length} form{group.forms.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {group.forms.map(form => {
                const Icon = form.icon;
                return (
                  <Card key={form.key} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${CATEGORY_COLORS[group.category]}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm">{form.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{form.description}</p>
                        <Button asChild size="sm" className="mt-2.5 h-7">
                          <Link to={form.to}>
                            Start Form <ChevronRight className="w-3 h-3" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}