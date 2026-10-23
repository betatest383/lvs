import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Calculator, Receipt, ShoppingBag, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';

function QuickLink({ to, icon: Icon, label, desc, color }) {
  return (
    <Link to={to}>
      <Card className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer h-full">
        <CardContent className="p-5 flex flex-col items-center text-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <p className="font-semibold text-sm">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function CustomerDashboard() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome{user ? `, ${user.full_name?.split(' ')[0]}` : ''}</h1>
        <p className="text-muted-foreground mt-1">Your chimney service portal</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <QuickLink to="/customer/reports" icon={FileText} label="Reports" desc="View inspections" color="bg-purple-100 text-purple-600" />
        <QuickLink to="/customer/estimates" icon={Calculator} label="Estimates" desc="View estimates" color="bg-amber-100 text-amber-600" />
        <QuickLink to="/customer/invoices" icon={Receipt} label="Invoices" desc="View & pay" color="bg-green-100 text-green-600" />
        <QuickLink to="/customer/store" icon={ShoppingBag} label="Store" desc="Browse products" color="bg-blue-100 text-blue-600" />
        <QuickLink to="/customer/membership" icon={Crown} label="Membership" desc="Your plan" color="bg-pink-100 text-pink-600" />
      </div>
    </div>
  );
}