import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Truck, CheckCircle2, Camera } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { VehicleTypeBadge } from "@/components/fleet/TruckBadges";

export default function SharedVehicleCheckout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState("select"); // select -> checkout -> done
  const [selectedTruck, setSelectedTruck] = useState(null);
  const [form, setForm] = useState({
    job_number: "",
    expected_return_datetime: "",
    checkout_condition: "",
    checkout_photos: [],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await base44.entities.TruckProfile.list('-updated_date', 200);
        setTrucks(data.filter(t => t.vehicle_type === "Shared Vehicle" || t.status === "Shared Pool"));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const availableTrucks = trucks.filter(t => t.current_assignment_status === "Available" && t.status !== "Out of Service" && t.status !== "Retired");

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handlePhotoUpload = async (files, key) => {
    const urls = [];
    for (const file of Array.from(files)) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        urls.push(file_url);
      } catch (e) {
        console.error(e);
      }
    }
    set(key, [...(form[key] || []), ...urls]);
  };

  const handleCheckout = async () => {
    setSaving(true);
    try {
      const assignmentId = `VA-${String(Date.now()).slice(-6)}`;
      await base44.entities.VehicleAssignment.create({
        assignment_id: assignmentId,
        truck_id: selectedTruck.truck_id,
        truck_number: selectedTruck.truck_number,
        vehicle_name: selectedTruck.vehicle_name,
        assigned_to: user?.full_name || "",
        assigned_to_email: user?.email || "",
        role: user?.role || "",
        assignment_type: "Shared Vehicle Checkout",
        job_number: form.job_number,
        start_datetime: new Date().toISOString(),
        expected_return_datetime: form.expected_return_datetime ? new Date(form.expected_return_datetime).toISOString() : null,
        checkout_condition: form.checkout_condition,
        checkout_photos: form.checkout_photos,
        status: "Active",
        checkout_by: user?.full_name || "",
      });
      await base44.entities.TruckProfile.update(selectedTruck.id, {
        current_assignment_status: "Checked Out",
        current_driver: user?.full_name || "",
        current_job: form.job_number,
      });
      setStep("done");
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Shared Vehicle Checkout</h1>
        <p className="text-muted-foreground text-sm">Check out a shared vehicle for a job</p>
      </div>

      {step === "select" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Select Available Shared Vehicle</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {availableTrucks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No shared vehicles available right now.</p>
            ) : availableTrucks.map(truck => (
              <button
                key={truck.id}
                onClick={() => { setSelectedTruck(truck); setStep("checkout"); }}
                className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-accent text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">Truck {truck.truck_number}</p>
                    <p className="text-xs text-muted-foreground">{truck.vehicle_name || [truck.make, truck.model].filter(Boolean).join(" ")}</p>
                  </div>
                </div>
                <VehicleTypeBadge type={truck.vehicle_type} />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {step === "checkout" && selectedTruck && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Checkout: Truck {selectedTruck.truck_number}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Job Number</Label>
              <Input value={form.job_number} onChange={(e) => set("job_number", e.target.value)} placeholder="Enter job number" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Expected Return Time</Label>
              <Input type="datetime-local" value={form.expected_return_datetime} onChange={(e) => set("expected_return_datetime", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Checkout Condition Notes</Label>
              <Textarea value={form.checkout_condition} onChange={(e) => set("checkout_condition", e.target.value)} placeholder="Describe vehicle condition at checkout..." className="mt-1" rows={3} />
            </div>
            <div>
              <Label className="text-xs">Checkout Photos</Label>
              <div className="mt-1 flex items-center gap-2">
                <label className="cursor-pointer">
                  <span className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-input bg-background text-sm hover:bg-accent">
                    <Camera className="h-4 w-4" /> Upload Photos
                  </span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files?.length && handlePhotoUpload(e.target.files, "checkout_photos")} />
                </label>
                <span className="text-xs text-muted-foreground">{form.checkout_photos.length} photo(s)</span>
              </div>
              {form.checkout_photos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {form.checkout_photos.map((url, i) => (
                    <img key={i} src={url} alt={`Checkout ${i + 1}`} className="w-16 h-16 object-cover rounded-md" />
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep("select")}>Back</Button>
              <Button onClick={handleCheckout} disabled={saving || !form.job_number}>
                {saving ? "Checking out..." : "Complete Checkout"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "done" && (
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-600" />
            <h2 className="text-lg font-bold mb-1">Vehicle Checked Out</h2>
            <p className="text-sm text-muted-foreground mb-4">Truck {selectedTruck.truck_number} has been checked out successfully.</p>
            <div className="flex justify-center gap-2">
              <Button onClick={() => navigate("/fleet/assignments")}>View Assignments</Button>
              <Button variant="outline" onClick={() => navigate("/fleet")}>Fleet Dashboard</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}