import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Pencil, ChevronLeft, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import CapFinishColorFormDialog from '@/components/admin/capsizing/CapFinishColorFormDialog';

const FAMILY_COLORS = {
  black: '#1A1A1A', bronze: '#8C7853', brown: '#6B4226', clay: '#B66A3D',
  gray: '#808080', green: '#4A7C4E', red: '#8B2B2B', white: '#F5F5F5',
  blue: '#3A6B8C', custom: '#CCCCCC',
};

export default function CapFinishColorRegistry() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [colors, setColors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editColor, setEditColor] = useState(null);

  const isAdmin = user?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await base44.entities.CapFinishColor.list('sort_order', 200);
      setColors(data);
    } catch (e) {
      toast.error('Failed to load finish colors: ' + e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = colors.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.display_name?.toLowerCase().includes(q) ||
      c.manufacturer_color_code?.toLowerCase().includes(q) ||
      c.manufacturer?.toLowerCase().includes(q) ||
      c.color_family?.toLowerCase().includes(q)
    );
  });

  const handleEdit = (c) => { setEditColor(c); setDialogOpen(true); };
  const handleNew = () => { setEditColor(null); setDialogOpen(true); };

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card><CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Finish color management is restricted to Owner/Admin roles.</p>
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
              <Palette className="w-6 h-6" /> Cap Finish Colors
            </h1>
            <p className="text-sm text-muted-foreground">Configure powder-coat color options without creating separate inventory SKUs.</p>
          </div>
        </div>
        <Button className="gap-1.5" onClick={handleNew}>
          <Plus className="w-4 h-4" /> Add Color
        </Button>
      </div>

      <div className="relative">
        <Input placeholder="Search by name, code, manufacturer, family..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <Palette className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No finish colors configured yet.</p>
          <p className="text-sm text-muted-foreground mt-1">Add colors to enable powder-coat finish selection on cap products.</p>
          <Button className="mt-4 gap-1.5" onClick={handleNew}>
            <Plus className="w-4 h-4" /> Add First Color
          </Button>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(c => {
            const swatch = c.hex_value || FAMILY_COLORS[c.color_family] || '#CCCCCC';
            return (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-lg border flex-shrink-0" style={{ backgroundColor: swatch }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{c.display_name}</p>
                        {c.is_active === false && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{c.manufacturer || '—'}</p>
                      <p className="text-xs text-muted-foreground">Code: {c.manufacturer_color_code || '—'}</p>
                      <div className="flex gap-2 mt-1 text-[11px]">
                        {c.additional_cost > 0 && <Badge variant="outline" className="text-green-700">+${c.additional_cost}</Badge>}
                        {c.lead_time_adjustment_days > 0 && <Badge variant="outline" className="text-amber-700">+{c.lead_time_adjustment_days}d lead</Badge>}
                        <Badge variant="outline" className="capitalize">{c.color_family}</Badge>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={() => handleEdit(c)} title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CapFinishColorFormDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditColor(null); }}
        onSaved={load}
        editColor={editColor}
        currentUserEmail={user?.email}
      />
    </div>
  );
}