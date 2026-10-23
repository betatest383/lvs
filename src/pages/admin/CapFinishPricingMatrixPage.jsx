import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Pencil, ChevronLeft, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import CapFinishPricingFormDialog from '@/components/admin/capsizing/CapFinishPricingFormDialog';

export default function CapFinishPricingMatrixPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState(null);

  const isAdmin = user?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await base44.entities.CapFinishPricing.list('-priority', 200);
      setEntries(data);
    } catch (e) {
      toast.error('Failed to load finish pricing: ' + e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = entries.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.pricing_name?.toLowerCase().includes(q) ||
      e.finish_type?.toLowerCase().includes(q) ||
      e.cap_size_tier?.toLowerCase().includes(q) ||
      e.cap_style?.toLowerCase().includes(q)
    );
  });

  const handleEdit = (e) => { setEditEntry(e); setDialogOpen(true); };
  const handleNew = () => { setEditEntry(null); setDialogOpen(true); };

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card><CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Finish pricing management is restricted to Owner/Admin roles.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/admin/cap-sizing-matrix')}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Cap Sizing Matrix
          </Button>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/cap-sizing-matrix')}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <DollarSign className="w-6 h-6" /> Cap Finish Pricing Matrix
            </h1>
            <p className="text-sm text-muted-foreground">Configure powder-coat pricing by cap size tier, style, and surface area.</p>
          </div>
        </div>
        <Button className="gap-1.5" onClick={handleNew}>
          <Plus className="w-4 h-4" /> Add Pricing Entry
        </Button>
      </div>

      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
        <CardContent className="p-4 text-sm">
          <p className="font-medium text-blue-800 dark:text-blue-200 mb-1">⚠ Finish Pricing vs Color Premium</p>
          <p className="text-blue-700 dark:text-blue-300 text-xs">
            Finish pricing is the base powder-coating charge (labor + base coating material). Color additional cost is a separate premium and will be added to the finish charge.
            Each is applied exactly once per cap. Do not include color premiums in the finish pricing tier — they are configured per color in the Cap Finish Colors registry.
          </p>
        </CardContent>
      </Card>

      <Input placeholder="Search by name, finish type, tier, style..." value={search} onChange={e => setSearch(e.target.value)} />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <DollarSign className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No finish pricing entries configured yet.</p>
          <p className="text-sm text-muted-foreground mt-1">Add pricing tiers to vary powder-coat cost by cap size and style.</p>
          <Button className="mt-4 gap-1.5" onClick={handleNew}>
            <Plus className="w-4 h-4" /> Add First Entry
          </Button>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Entry Name</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Finish Type</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Size Tier</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Cap Style</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Surface Area</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Add'l Price</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Priority</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-right py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(e => (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-2 px-3 font-medium">{e.pricing_name}</td>
                      <td className="py-2 px-3">{e.finish_type?.replace(/_/g, ' ') || '—'}</td>
                      <td className="py-2 px-3 capitalize">{e.cap_size_tier || 'Any'}</td>
                      <td className="py-2 px-3">{e.cap_style || 'Any'}</td>
                      <td className="py-2 px-3">
                        {e.surface_area_min != null || e.surface_area_max != null
                          ? `${e.surface_area_min ?? 0}–${e.surface_area_max ?? '∞'} sq in`
                          : '—'}
                      </td>
                      <td className="py-2 px-3 font-medium text-green-700">${e.additional_price ?? 0}</td>
                      <td className="py-2 px-3">{e.priority || 0}</td>
                      <td className="py-2 px-3">
                        <Badge variant={e.is_active !== false ? 'secondary' : 'outline'} className={`text-[10px] ${e.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {e.is_active !== false ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(e)} title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <CapFinishPricingFormDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditEntry(null); }}
        onSaved={load}
        editEntry={editEntry}
        currentUserEmail={user?.email}
      />
    </div>
  );
}