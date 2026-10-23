import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, File, Loader2, CheckCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  RESOURCE_TYPES, APPLIANCE_TYPES, FUEL_TYPES, MANUFACTURER_SUGGESTIONS
} from '@/lib/productResourceConstants';

export default function ResourceUpload() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    resource_type: 'Manual',
    manufacturer: '',
    product_line: '',
    product_model: '',
    appliance_type: '',
    fuel_type: '',
    tags: '',
    notes: '',
  });

  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file: selectedFile });
      setFileUrl(result.file_url);
      if (!form.title) setForm((prev) => ({ ...prev, title: selectedFile.name.replace(/\.[^/.]+$/, '') }));
      toast.success('File uploaded');
    } catch (e) {
      toast.error('Upload failed: ' + e.message);
      setFile(null);
    }
    setUploading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleSave = async () => {
    if (!fileUrl) {
      toast.error('Please upload a file first');
      return;
    }
    if (!form.title) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      const tagsArray = form.tags
        ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [];
      const res = await base44.functions.invoke('manageProductResource', {
        action: 'create',
        title: form.title,
        description: form.description,
        resource_type: form.resource_type,
        file_url: fileUrl,
        file_name: file?.name || '',
        file_type: file?.type || '',
        file_size: file?.size || 0,
        manufacturer: form.manufacturer,
        product_line: form.product_line,
        product_model: form.product_model,
        appliance_type: form.appliance_type,
        fuel_type: form.fuel_type,
        tags: tagsArray,
        source_provider: 'manual_upload',
        notes: form.notes,
      });
      if (res.data?.success) {
        toast.success('Resource created');
        navigate(`/resources/detail/${res.data.resource.id}`);
      } else {
        toast.error(res.data?.error || 'Failed to create resource');
      }
    } catch (e) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Upload Resource</h2>
        <p className="text-sm text-muted-foreground">Upload a manual, brochure, parts diagram, or other product resource</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">File</CardTitle></CardHeader>
        <CardContent>
          {!file ? (
            <label
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg py-12 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Drop a file here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, images, videos, documents</p>
              <input
                type="file"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files[0])}
              />
            </label>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-500" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB {uploading ? '· Uploading...' : '· Uploaded'}
                </p>
              </div>
              {!uploading && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setFile(null); setFileUrl(''); }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Metadata</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Majestic Windsor fireplace installation manual" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Resource Type</Label>
              <Select value={form.resource_type} onValueChange={(v) => set('resource_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Manufacturer</Label>
              <Input
                value={form.manufacturer}
                onChange={(e) => set('manufacturer', e.target.value)}
                list="manufacturer-list"
              />
              <datalist id="manufacturer-list">
                {MANUFACTURER_SUGGESTIONS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Product Line</Label>
              <Input value={form.product_line} onChange={(e) => set('product_line', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Product Model</Label>
              <Input value={form.product_model} onChange={(e) => set('product_model', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Appliance Type</Label>
              <Select value={form.appliance_type || 'none'} onValueChange={(v) => set('appliance_type', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Not specified" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {APPLIANCE_TYPES.filter((a) => a).map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fuel Type</Label>
              <Select value={form.fuel_type || 'none'} onValueChange={(v) => set('fuel_type', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Not specified" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {FUEL_TYPES.filter((f) => f).map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tags (comma-separated)</Label>
            <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="e.g. gas, vented, direct vent" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/resources')}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving || uploading || !fileUrl || !form.title}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <File className="h-4 w-4 mr-1" />}
          Create Resource
        </Button>
      </div>
    </div>
  );
}