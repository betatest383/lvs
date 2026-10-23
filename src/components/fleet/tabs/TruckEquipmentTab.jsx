import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Wrench } from "lucide-react";
import { base44 } from "@/api/base44Client";

export function TruckEquipmentTab({ truck }) {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await base44.entities.TechEquipment.list('-created_date', 200);
        setEquipment(data.filter(e => e.truck_number === truck.truck_number));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [truck]);

  if (loading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" /> Assigned Equipment</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {equipment.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No equipment assigned to this truck.</p>
        ) : equipment.map(e => (
          <Link key={e.id} to="/tech/equipment" className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent">
            <div>
              <p className="font-medium text-sm">{e.item_name || e.equipment_name || "Equipment"}</p>
              <p className="text-xs text-muted-foreground">{e.technician || e.assigned_to || ""}</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-md bg-blue-100 text-blue-700">{e.status || "Assigned"}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}