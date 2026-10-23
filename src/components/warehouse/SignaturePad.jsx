import { useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';

export default function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const lastPos = useRef(null);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * (canvas.width / rect.width),
      y: (src.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDrawing(true);
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasStrokes(true);
  };

  const stopDraw = (e) => {
    e?.preventDefault();
    if (drawing && hasStrokes && canvasRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'));
    }
    setDrawing(false);
    lastPos.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasStrokes(false);
    onChange('');
  };

  if (value) {
    return (
      <div className="space-y-2">
        <img src={value} alt="Signature" className="w-full h-24 object-contain border rounded-lg bg-white" />
        <button
          type="button"
          onClick={clearCanvas}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" /> Re-sign
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-sm text-muted-foreground">Sign below</p>
        <button
          type="button"
          onClick={clearCanvas}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="w-3 h-3" /> Clear
        </button>
      </div>
      <div className="border-2 border-dashed border-border rounded-lg bg-white overflow-hidden touch-none select-none">
        <canvas
          ref={canvasRef}
          width={600}
          height={180}
          className="w-full block cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
      </div>
      {!hasStrokes && (
        <p className="text-xs text-muted-foreground mt-1 text-center">Draw your signature above</p>
      )}
    </div>
  );
}