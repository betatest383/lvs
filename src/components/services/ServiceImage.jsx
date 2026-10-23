import { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Upload, X, Image as ImageIcon } from 'lucide-react';
import { resolveServiceImage } from '@/lib/serviceImageResolver';

export function ServiceThumbnail({ src, alt, size = 'md' }) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  };
  const cls = sizeClasses[size] || sizeClasses.md;

  const resolvedSrc = resolveServiceImage(src);

  if (!resolvedSrc) {
    return (
      <div className={`${cls} rounded-lg bg-muted flex items-center justify-center flex-shrink-0`}>
        <ImageIcon className="w-1/2 h-1/2 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={`${cls} flex-shrink-0`}>
      <img
        src={resolvedSrc}
        alt={alt || 'Service'}
        className={`${cls} rounded-lg object-cover border`}
        onError={(e) => {
          console.warn('[ServiceThumbnail] Image failed to load, falling back to placeholder', { original: src, resolved: resolvedSrc });
          e.target.style.display = 'none';
          const fallback = e.target.parentElement.querySelector('.thumb-fallback');
          if (fallback) fallback.style.display = 'flex';
        }}
      />
      <div className={`thumb-fallback ${cls} rounded-lg bg-muted items-center justify-center`} style={{ display: 'none' }}>
        <ImageIcon className="w-1/2 h-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

export function ServiceImageField({ value, onChange, label = 'Image' }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      console.log('[ServiceImage] Manual upload file_url:', file_url);
      onChange(file_url);
    } catch (err) {
      setError('Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleClear = () => {
    onChange('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <ServiceThumbnail src={value} alt="Preview" size="lg" />
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
            id="service-image-upload"
          />
          <label htmlFor="service-image-upload">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-xs font-medium transition-colors">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? 'Uploading...' : value ? 'Replace Image' : 'Upload Image'}
            </span>
          </label>
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
            >
              <X className="w-3 h-3" /> Remove
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}