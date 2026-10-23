import React, { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Camera, Check, Flag, Loader2, X } from "lucide-react";
import { SURFACE_TYPES, LOCATION_ZONES, calculateAreaSqFt, validateSection } from "@/lib/chimneyDiagramConfig";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function SectionMeasurePanel({ section, open, onClose, onSave }) {
  const { toast } = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (section) {
      setForm({
        width: section.width || "",
        height: section.height || "",
        unit: section.unit || "inches",
        quantity: section.quantity || 1,
        surface_type: section.surface_type || "Stucco",
        location_zone: section.location_zone || "Above Roof",
        include_in_total: section.include_in_total !== false,
        photo_required: section.photo_required || false,
        photo_url: section.photo_url || "",
        notes: section.notes || "",
        status: section.status || "not_started",
      });
    }
  }, [section]);

  if (!form || !section) return null;

  const area = calculateAreaSqFt(form.width, form.height, form.quantity, form.unit);
  const validationData = { ...form, area_sqft: area };
  const warnings = validateSection(validationData);

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handlePhotoUpload = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      update("photo_url", file_url);
      toast({ title: "Photo uploaded" });
    } catch (err) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async newStatus => {
    setSaving(true);
    try {
      const data = {
        width: Number(form.width) || 0,
        height: Number(form.height) || 0,
        unit: form.unit,
        quantity: Number(form.quantity) || 1,
        area_sqft: area,
        surface_type: form.surface_type,
        location_zone: form.location_zone,
        include_in_total: form.include_in_total,
        photo_required: form.photo_required,
        photo_url: form.photo_url,
        notes: form.notes,
        status: newStatus,
        warning_flag: warnings.length > 0,
        warning_messages: JSON.stringify(warnings),
      };
      await onSave(section, data);
      onClose();
    } catch (e) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl">Section {section.section_label}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="bg-primary/10 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground">Calculated Area</p>
            <p className="text-3xl font-bold">{area.toFixed(2)} sq ft</p>
            <p className="text-xs text-muted-foreground mt-1">
              {form.width || 0} × {form.height || 0} {form.unit} × {form.quantity || 1}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="width">Width</Label>
              <Input id="width" type="number" value={form.width} onChange={e => update("width", e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label htmlFor="height">Height</Label>
              <Input id="height" type="number" value={form.height} onChange={e => update("height", e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Unit</Label>
              <Select value={form.unit} onValueChange={v => update("unit", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inches">Inches</SelectItem>
                  <SelectItem value="feet">Feet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="qty">Quantity</Label>
              <Input id="qty" type="number" value={form.quantity} onChange={e => update("quantity", e.target.value)} min="1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Surface Type</Label>
              <Select value={form.surface_type} onValueChange={v => update("surface_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SURFACE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Location</Label>
              <Select value={form.location_zone} onValueChange={v => update("location_zone", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATION_ZONES.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label>Include in Total?</Label>
            <Select value={form.include_in_total ? "yes" : "no"} onValueChange={v => update("include_in_total", v === "yes")}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label>Photo Required</Label>
            <Switch checked={form.photo_required} onCheckedChange={v => update("photo_required", v)} />
          </div>

          <div>
            <Label>Photo</Label>
            {form.photo_url ? (
              <div className="relative mt-1">
                <img src={form.photo_url} alt="Section" className="w-full rounded-lg border" />
                <Button size="sm" variant="destructive" className="absolute top-2 right-2" onClick={() => update("photo_url", "")}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="border-2 border-dashed rounded-lg p-4 text-center mt-1">
                {uploading ? (
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <Camera className="h-8 w-8 mx-auto text-muted-foreground" />
                    <label className="cursor-pointer">
                      <span className="text-sm text-primary">Upload or take photo</span>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
                    </label>
                  </>
                )}
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={form.notes} onChange={e => update("notes", e.target.value)} rows={3} placeholder="Additional notes for this section..." />
          </div>

          {warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="font-semibold text-sm text-amber-800">Validation Warnings</span>
              </div>
              <ul className="text-xs text-amber-700 list-disc list-inside space-y-1">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
              <p className="text-xs text-amber-600 mt-2 italic">
                This measurement looks unusual. Please confirm before continuing.
              </p>
            </div>
          )}
        </div>

        <SheetFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="flex-1" onClick={() => handleSave("in_progress")} disabled={saving}>
            Save Progress
          </Button>
          <Button variant="destructive" className="flex-1" onClick={() => handleSave("flagged")} disabled={saving}>
            <Flag className="mr-1 h-4 w-4" /> Flag
          </Button>
          <Button className="flex-1" onClick={() => handleSave("complete")} disabled={saving}>
            <Check className="mr-1 h-4 w-4" /> Complete
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}