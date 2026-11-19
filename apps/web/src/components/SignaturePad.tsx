// Signature drawn with a finger, a pen or the mouse (pointer events). Exports a PNG on a white
// background so it reads the same on paper and in dark mode.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { useI18n } from '@/i18n/index.tsx';

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
}

export const SignaturePad = forwardRef<SignaturePadHandle, { label: string; onChange?: (empty: boolean) => void }>(function SignaturePad({ label, onChange }, ref) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  const setup = () => {
    const element = canvas.current;
    if (!element) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = element.getBoundingClientRect();
    element.width = Math.round(rect.width * ratio);
    element.height = Math.round(rect.height * ratio);
    const context = element.getContext('2d')!;
    context.scale(ratio, ratio);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, rect.width, rect.height);
    context.lineWidth = 2.4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#1b1b1b';
  };
  useEffect(() => { setup(); }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const clear = () => { setup(); setEmpty(true); onChange?.(true); };

  useImperativeHandle(ref, () => ({
    isEmpty: () => empty,
    clear,
    toBlob: () => new Promise((resolve) => { if (!canvas.current) resolve(null); else canvas.current.toBlob(resolve, 'image/png'); }),
  }));

  return (
    <div className="stack" style={{ gap: '.4rem' }}>
      <div className="row nowrap"><span className="small muted grow">{label}</span>
        <button type="button" className="btn ghost small" onClick={clear}><Eraser size={14} />{t('clientPortal.clear')}</button></div>
      <canvas
        ref={canvas}
        className="sig-pad"
        role="img"
        aria-label={label}
        style={{ background: '#fff' }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = true;
          const context = event.currentTarget.getContext('2d')!;
          const { x, y } = point(event);
          context.beginPath(); context.moveTo(x, y); context.lineTo(x + 0.1, y + 0.1); context.stroke();
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const context = event.currentTarget.getContext('2d')!;
          const { x, y } = point(event);
          context.lineTo(x, y); context.stroke();
          if (empty) { setEmpty(false); onChange?.(false); }
        }}
        onPointerUp={() => { drawing.current = false; }}
        onPointerCancel={() => { drawing.current = false; }}
      />
    </div>
  );
});
