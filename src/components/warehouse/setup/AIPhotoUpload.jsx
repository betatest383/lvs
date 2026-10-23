import React, { useState, useRef } from 'react';
import { Camera, Loader2, Upload, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const PHOTO_TYPES = [
  { key: 'warehouse_overview', label: 'Warehouse Overview' },
  { key: 'bin_label', label: 'Bin-Label Photo' },
  { key: 'stocked_shelf', label: 'Stocked-Shelf Photo' },
  { key: 'damaged_material', label: 'Damaged Material' },
  { key: 'discrepancy_evidence', label: 'Discrepancy Evidence' },
  { key: 'other', label: 'Other Evidence' },
];

export default function AIPhotoUpload({ sessionId, stepName, warehouseName, selectedItemId, selectedItemName, selectedItemBin, selectedItemBinId, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [photoType, setPhotoType] = useState('stocked_shelf');
  const [caption, setCaption] = useState('');
  const [uploadedUrl, setUploadedUrl] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;

    setUploading(true);
    setError(null);
    setUploadedUrl(null);
    try {
      // Step 1: Upload the file
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const fileUrl = uploadRes.file_url;

      // Step 2: Attach to session with structured metadata
      await base44.functions.invoke('manageInventoryCountSession', {
        action: 'add_evidence',
        session_id: sessionId,
        evidence_urls: [fileUrl],
        evidence_notes: `[${photoType}] step=${stepName} caption="${caption || 'N/A'}"`,
        photo_type: photoType,
        warehouse_name: warehouseName || '',
        bin_location_id: selectedItemBinId || null,
        item_name: selectedItemName || '',
        item_id: selectedItemId || null,
        step_name: stepName || '',
        caption: caption || '',
      });

      setUploadedUrl(fileUrl);
      setCaption('');
      if (onUploaded) onUploaded(fileUrl);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2 p-3 rounded-md border bg-muted/30">
      <p className="text-xs font-medium flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" /> Upload Evidence Photo</p>

      {/* Context summary */}
      <div className="text-xs text-muted-foreground space-y-0.5">
        <div>Warehouse: <span className="font-medium">{warehouseName || 'N/A'}</span></div>
        {selectedItemName && <div>Item: <span className="font-medium">{selectedItemName}{selectedItemBin ? ` — ${selectedItemBin}` : ''}</span></div>}
        <div>Step: <span className="font-medium">{stepName || 'N/A'}</span></div>
      </div>

      {/* Photo type selector */}
      <select
        value={photoType}
        onChange={(e) => setPhotoType(e.target.value)}
        className="w-full h-8 rounded-md border border-input bg-transparent px-2 text-xs"
        disabled={uploading}
      >
        {PHOTO_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
      </select>

      {/* Caption */}
      <input
        type="text"
        placeholder="Caption / notes (optional)..."
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        className="w-full h-8 rounded-md border border-input bg-transparent px-2 text-xs"
        disabled={uploading}
      />

      {/* File input */}
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          disabled={uploading || !sessionId}
          className="hidden"
          id="ai-photo-upload"
        />
        <label
          htmlFor="ai-photo-upload"
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium cursor-pointer transition-colors ${
            uploading || !sessionId
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-accent text-accent-foreground hover:bg-accent/90'
          }`}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? 'Uploading...' : 'Choose Photo'}
        </label>
      </div>

      {/* Success */}
      {uploadedUrl && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-green-50 border border-green-200 text-xs text-green-700">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Photo uploaded and linked to session.</span>
          <img src={uploadedUrl} alt="Evidence" className="w-12 h-12 rounded object-cover border ml-auto" />
        </div>
      )}

      {/* Error */}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {!sessionId && <p className="text-xs text-muted-foreground">Select a warehouse session to upload photos.</p>}
    </div>
  );
}