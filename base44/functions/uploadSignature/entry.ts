import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { dataUrl } = await req.json();
    if (!dataUrl) return Response.json({ error: 'Missing dataUrl' }, { status: 400 });

    // Convert base64 data URL to binary
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // Upload as a file
    const formData = new FormData();
    const blob = new Blob([bytes], { type: 'image/png' });
    formData.append('file', blob, 'signature.png');

    const { file_url } = await base44.integrations.Core.UploadFile({ file: formData.get('file') });

    return Response.json({ file_url });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});