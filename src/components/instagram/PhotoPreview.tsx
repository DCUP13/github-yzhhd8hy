import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, Loader2 } from 'lucide-react';

const MAX_DIM = 1080;
const REF_WIDTH = 640;
const FONT_SIZE = 64;
const PADDING = 40;

interface PhotoPreviewProps {
  photos: { url: string; text: string }[];
  index: number;
  textOff: boolean;
  onIndexChange: (index: number) => void;
}

interface Measure { lines: number; coverage: number }

function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.trim().split(/\s+/)) {
    const next = `${current} ${word}`.trim();
    if (next.length <= maxChars) current = next;
    else { if (current) lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}

// Mirrors the overlay-text-on-image edge function so the preview matches the posted photo.
function draw(canvas: HTMLCanvasElement, img: HTMLImageElement, text: string): Measure | null {
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (w > MAX_DIM || h > MAX_DIM) {
    const s = Math.min(MAX_DIM / w, MAX_DIM / h);
    w = Math.round(w * s);
    h = Math.round(h * s);
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  if (!text.trim()) return null;

  const scale = w / REF_WIDTH;
  const fontSize = Math.round(FONT_SIZE * scale);
  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrapText(text, Math.floor((w * 0.85) / (fontSize * 0.55)));
  const lineHeight = fontSize * 1.3;
  const pad = Math.round(PADDING * scale);
  const bannerH = lines.length * lineHeight + pad * 2;
  const bannerY = h - bannerH - Math.round(h * 0.08);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, bannerY, w, bannerH);
  ctx.fillStyle = '#ffffff';
  lines.forEach((line, i) => ctx.fillText(line, w / 2, bannerY + pad + i * lineHeight + fontSize * 0.65));
  return { lines: lines.length, coverage: Math.round((bannerH / h) * 100) };
}

export function PhotoPreview({ photos, index, textOff, onIndexChange }: PhotoPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [measure, setMeasure] = useState<Measure | null>(null);
  const safeIndex = Math.min(index, Math.max(photos.length - 1, 0));
  const photo = photos[safeIndex];
  const text = textOff ? '' : photo?.text || '';
  const url = photo?.url;

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled || !canvasRef.current) return;
      setMeasure(draw(canvasRef.current, img, text));
      setStatus('ready');
    };
    img.onerror = () => { if (!cancelled) setStatus('error'); };
    img.src = url;
    return () => { cancelled = true; };
  }, [url, text]);

  if (!photo) return null;
  const many = photos.length > 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Preview</label>
        {many && <span className="text-xs text-gray-500 tabular-nums">Photo {safeIndex + 1} of {photos.length}</span>}
      </div>
      <div className="relative rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <canvas ref={canvasRef} className={`block w-full h-auto transition-opacity duration-200 ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`} />
        {status === 'loading' && <div className="absolute inset-0 min-h-[12rem] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-pink-500" /></div>}
        {status === 'error' && (
          <div className="absolute inset-0 min-h-[12rem] flex flex-col items-center justify-center gap-2 text-sm text-gray-500">
            <ImageOff className="w-6 h-6" /> Could not load this photo
          </div>
        )}
        {many && (
          <>
            <button onClick={() => onIndexChange(safeIndex - 1)} disabled={safeIndex === 0} aria-label="Previous photo" className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 text-gray-800 shadow flex items-center justify-center hover:bg-white disabled:opacity-0 transition-opacity">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => onIndexChange(safeIndex + 1)} disabled={safeIndex === photos.length - 1} aria-label="Next photo" className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 text-gray-800 shadow flex items-center justify-center hover:bg-white disabled:opacity-0 transition-opacity">
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
      {many && (
        <div className="mt-2 flex justify-center gap-1.5">
          {photos.map((_, i) => (
            <button key={i} onClick={() => onIndexChange(i)} aria-label={`Show photo ${i + 1}`} className={`h-1.5 rounded-full transition-all ${i === safeIndex ? 'w-4 bg-pink-500' : 'w-1.5 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'}`} />
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {textOff ? 'Text on photos is turned off for this post.'
          : measure ? `${measure.lines} ${measure.lines === 1 ? 'line' : 'lines'}, the text band covers about ${measure.coverage}% of the photo height.`
          : 'No text on this photo.'}
      </p>
    </div>
  );
}
