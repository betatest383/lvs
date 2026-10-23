import { base44 } from '@/api/base44Client';

export async function rotateImageByDegrees(fileUrl, degrees = 90) {
  try {
    console.log(`[ROTATE] Starting rotation: ${degrees}°`);
    
    // Fetch the image
    const response = await fetch(fileUrl);
    const blob = await response.blob();
    
    // Create canvas and context
    const img = new Image();
    return new Promise((resolve, reject) => {
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Determine new dimensions based on rotation
        let width = img.width;
        let height = img.height;
        const rad = (degrees * Math.PI) / 180;
        
        // For 90/270, swap dimensions
        if (degrees === 90 || degrees === 270) {
          [width, height] = [height, width];
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Translate and rotate
        ctx.translate(width / 2, height / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        
        // Convert to blob and upload
        canvas.toBlob(async (rotatedBlob) => {
          const rotatedFile = new File(
            [rotatedBlob],
            `rotated-${Date.now()}.jpg`,
            { type: 'image/jpeg' }
          );
          
          console.log(`[ROTATE] Uploading rotated file: ${rotatedFile.name}`);
          const { file_url } = await base44.integrations.Core.UploadFile({ file: rotatedFile });
          console.log(`[ROTATE] New URL: ${file_url}`);
          resolve(file_url);
        }, 'image/jpeg', 0.9);
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(blob);
    });
  } catch (e) {
    console.error('[ROTATE] Error:', e.message);
    throw e;
  }
}