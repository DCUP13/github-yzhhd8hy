import { Loader2, Sparkles, Image as ImageIcon, Images } from 'lucide-react';
import { choiceClass } from './PhotoTextSettings';
import { PINK, type OverlayScope } from './types';

const MAX_TEXT = 120;

interface PhotoTextEditorProps {
  photos: { url: string; text: string }[];
  scope: OverlayScope;
  coverText: string;
  locked: boolean;
  canRewrite: boolean;
  rewriting: boolean;
  disabled: boolean;
  onScopeChange: (scope: OverlayScope) => void;
  onCoverTextChange: (text: string) => void;
  onPhotoTextChange: (index: number, text: string) => void;
  onRewrite: () => void;
}

export function PhotoTextEditor({
  photos, scope, coverText, locked, canRewrite, rewriting, disabled,
  onScopeChange, onCoverTextChange, onPhotoTextChange, onRewrite,
}: PhotoTextEditorProps) {
  const isCarousel = photos.length > 1;
  const everyPhoto = isCarousel && scope === 'all';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Text on photos</label>
        {!locked && canRewrite && (
          <button onClick={onRewrite} disabled={disabled} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/20 disabled:opacity-50">
            {rewriting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Rewrite photo text
          </button>
        )}
      </div>

      {isCarousel && !locked && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button type="button" onClick={() => onScopeChange('first')} className={choiceClass(scope === 'first')}><ImageIcon className="w-4 h-4" /> Cover photo only</button>
          <button type="button" onClick={() => onScopeChange('all')} className={choiceClass(scope === 'all')}><Images className="w-4 h-4" /> Every photo</button>
        </div>
      )}

      {everyPhoto ? (
        <div className="space-y-2">
          {photos.map((p, i) => (
            <div key={`${p.url}-${i}`} className="flex items-center gap-2">
              <div className="relative w-11 h-11 shrink-0 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800">
                <img src={p.url} alt="" className="w-full h-full object-cover" />
                <span className="absolute top-0.5 left-0.5 px-1 rounded bg-black/60 text-[10px] font-semibold text-white">{i + 1}</span>
              </div>
              <input
                value={p.text}
                onChange={(e) => onPhotoTextChange(i, e.target.value.slice(0, MAX_TEXT))}
                readOnly={locked}
                placeholder={i === 0 ? 'Hook for the cover photo' : 'Leave empty for no text on this photo'}
                className={PINK.input}
              />
            </div>
          ))}
          <p className="text-xs text-gray-400">Text stays with its photo when you reorder them.</p>
        </div>
      ) : (
        <input value={coverText} onChange={(e) => onCoverTextChange(e.target.value.slice(0, MAX_TEXT))} readOnly={locked} placeholder="Leave empty for no text" className={PINK.input} />
      )}
    </div>
  );
}
