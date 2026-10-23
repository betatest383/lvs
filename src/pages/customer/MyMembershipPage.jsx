import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Star, CheckCircle, Calendar, DollarSign } from 'lucide-react';

const typeColor = {
  basic: 'bg-blue-100 text-blue-700',
  premium: 'bg-purple-100 text-purple-700',
  gold: 'bg-amber-100 text-amber-700',
};

const membershipBenefits = {
  basic: ['Annual inspection discount (10%)', 'Priority scheduling', 'Email support'],
  premium: ['Annual inspection discount (20%)', 'Priority scheduling', 'Phone & email support', '1 free sweep per year'],
  gold: ['Annual inspection discount (30%)', 'VIP scheduling', 'Dedicated support line', '2 free sweeps per year', 'Emergency service discount'],
};

export default function MyMembershipPage() {
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then(u => {
      base44.entities.Membership.filter({ customer_id: u.id, status: 'active' }, '-created_date', 1)
        .then(results => { setMembership(results[0] || null); setLoading(false); });
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Membership</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Your chimney care membership plan</p>
      </div>

      {!membership ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center">
            <Star className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <h2 className="font-semibold text-lg mb-2">No Active Membership</h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">Contact us to learn about our membership plans and enjoy year-round chimney care benefits.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="border-0 shadow-sm overflow-hidden">
            <div className="bg-primary text-primary-foreground p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Star className="w-5 h-5 fill-accent text-accent" />
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${typeColor[membership.membership_type] || 'bg-white/20 text-white'}`}>
                      {membership.membership_type}
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold capitalize">{membership.membership_type} Member</h2>
                  <p className="text-primary-foreground/70 text-sm mt-1">{membership.customer_name}</p>
                </div>
                {membership.annual_fee && (
                  <div className="text-right">
                    <span className="text-2xl font-bold">${membership.annual_fee}</span>
                    <p className="text-xs text-primary-foreground/70">/year</p>
                  </div>
                )}
              </div>
            </div>
            <CardContent className="p-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>Started: <span className="font-medium text-foreground">{membership.start_date || '—'}</span></span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>Renews: <span className="font-medium text-foreground">{membership.renewal_date || '—'}</span></span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Your Benefits</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-2.5">
                {(membershipBenefits[membership.membership_type] || []).map((benefit, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    {benefit}
                  </li>
                ))}
                {membership.benefits && (
                  <li className="flex items-center gap-2.5 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    {membership.benefits}
                  </li>
                )}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}