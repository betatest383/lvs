import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function EmployeeDocumentsTab({ employee }) {
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setDocuments(prev => [...prev, { name: file.name, url: file_url, uploaded: new Date().toISOString() }]);
      toast.success('Document uploaded');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const docTypes = ["Driver's License", 'Certifications', 'Signed Policies', 'Employment Forms', 'Performance Reviews', 'Coaching Records', 'Other HR Documents'];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Upload Document</CardTitle></CardHeader>
        <CardContent>
          <label className="flex items-center justify-center gap-2 p-4 border border-dashed rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
            <span className="text-sm text-muted-foreground">{uploading ? 'Uploading...' : 'Click to upload a document'}</span>
            <input type="file" className="hidden" onChange={e => handleUpload(e.target.files?.[0])} accept=".pdf,.jpg,.jpeg,.png,.webp" />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Document Categories</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {docTypes.map(t => (
              <span key={t} className="px-2 py-1 rounded-full bg-muted text-xs font-medium">{t}</span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Uploaded Documents ({documents.length})</CardTitle></CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-1">
              {documents.map((doc, i) => (
                <a key={i} href={doc.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm hover:bg-muted/50 rounded px-2 py-1.5 transition-colors">
                  <FileCheck className="w-4 h-4 text-green-600" />
                  <span className="truncate">{doc.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(doc.uploaded).toLocaleDateString()}</span>
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}