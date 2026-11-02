import { useEffect, useRef, useState } from 'react';
import { ImageOff, Images, Upload, Loader2, X, Check, Shuffle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { uploadFile } from '../linkedin/api';
import { Modal, secondaryBtn } from '../linkedin/Modal';
import { MAX_PHOTOS, THEME, type LibraryAsset, type PhotoMode } from './types';

export interface PhotoValue {
  mode: PhotoMode;
  count: number;
  urls: string[];
  assetIds: string[];
}

interface PhotoPickerProps {
  value: PhotoValue;
  onChange: (v: PhotoValue) => void;
  variant: 'post' | 'slot';
  onAutoPick?: () => void;
  autoPicking?: boolean;
  disabled?: boolean;
}

const MODES: { id: PhotoMode; label: string; icon: typeof Images }[] = [
  { id: 'none', label: 'No photos', icon: ImageOff },
  { id: 'library', label: 'From content library', icon: Images },
  { id: 'upload', label: 'Upload', icon: Upload },
];

function LibraryModal({ initial, onClose, onDone }: { initial: string[]; onClose: () => void; onDone: (assets: LibraryAsset[]) => void }) {
  const [assets, setAssets] = useState<LibraryAsset[] | null>(null);
  const [selected, setSelected] = useState<string[]>(initial);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('media_assets')
        .select('id, cloudfront_url, file_name')
        .eq('file_type', 'image')
        .not('cloudfront_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) {
        toast.error('Could not load your photo library');
        setAssets([]);
        return;
      }
      setAssets((data || []) as LibraryAsset[]);
    })();
  }, []);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_PHOTOS ? s : [...s, id]));

  return (
    <Modal
      title="Choose photos"
      subtitle={`Pick up to ${MAX_PHOTOS} photos from your Instagram content library`}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button
            onClick={() => onDone((assets || []).filter((a) => selected.includes(a.id)).sort((a, b) => selected.indexOf(a.id) - selected.indexOf(b.id)))}
            className={THEME.primary}
          >
            Use {selected.length || ''} photo{selected.length === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      {!assets ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-sky-500" /></div>
      ) : !assets.length ? (
        <p className="py-12 text-center text-sm text-gray-500">Your content library has no photos yet. Add some on the Instagram page first.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {assets.map((a) => {
            const idx = selected.indexOf(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(a.id)}
                className={`relative aspect-square rounded-lg overflow-hidden ring-2 transition-all ${idx >= 0 ? 'ring-sky-500 scale-[0.97]' : 'ring-transparent hover:ring-gray-300'}`}
              >
                <img src={a.cloudfront_url} alt={a.file_name} loading="lazy" className="w-full h-full object-cover" />
                {idx >= 0 && (
                  <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-sky-500 text-white text-xs font-semibold flex items-center justify-center shadow">
                    {idx + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export function PhotoPicker({ value, onChange, variant, onAutoPick, autoPicking, disabled }: PhotoPickerProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setMode = (mode: PhotoMode) => onChange({ ...value, mode, urls: mode === value.mode ? value.urls : [], assetIds: mode === value.mode ? value.assetIds : [] });

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_PHOTOS - value.urls.length;
    const list = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (!list.length) {
      toast.error(room <= 0 ? `You can add up to ${MAX_PHOTOS} photos` : 'Please choose image files');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await Promise.all(list.map((f) => uploadFile(f, 'threads')));
      onChange({ ...value, urls: [...value.urls, ...uploaded.map((u) => u.url)] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = (i: number) => onChange({ ...value, urls: value.urls.filter((_, j) => j !== i), assetIds: value.assetIds.filter((_, j) => j !== i) });

  const showThumbs = value.mode === 'upload' || (value.mode === 'library' && variant === 'post');

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={disabled}
            onClick={() => setMode(m.id)}
            className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border text-xs font-medium transition-all disabled:opacity-50 ${
              value.mode === m.id ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <m.icon className="w-4 h-4" /> {m.label}
          </button>
        ))}
      </div>

      {value.mode === 'library' && variant === 'slot' && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-300">Photos to pick automatically</span>
          <input
            type="number"
            min={1}
            max={MAX_PHOTOS}
            value={value.count}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, count: Math.max(1, Math.min(MAX_PHOTOS, Number(e.target.value) || 1)) })}
            className={`${THEME.input} w-20`}
          />
        </div>
      )}

      {value.mode === 'library' && variant === 'post' && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={disabled} onClick={() => setLibraryOpen(true)} className={secondaryBtn}>
            <Images className="w-4 h-4" /> Choose photos
          </button>
          {onAutoPick && (
            <button type="button" disabled={disabled || autoPicking} onClick={onAutoPick} className={secondaryBtn}>
              {autoPicking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />} Pick for me
            </button>
          )}
        </div>
      )}

      {value.mode === 'upload' && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          <button type="button" disabled={disabled || uploading || value.urls.length >= MAX_PHOTOS} onClick={() => fileRef.current?.click()} className={secondaryBtn}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {uploading ? 'Uploading...' : 'Upload photos'}
          </button>
        </div>
      )}

      {showThumbs && value.urls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.urls.map((u, i) => (
            <div key={`${u}-${i}`} className="relative w-20 h-20 rounded-lg overflow-hidden group">
              <img src={u} alt="" className="w-full h-full object-cover" />
              {!disabled && (
                <button type="button" onClick={() => remove(i)} className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Remove photo">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {value.urls.length > 1 && <span className="absolute bottom-1 left-1 px-1.5 rounded bg-black/60 text-white text-[10px] font-medium">{i + 1}</span>}
            </div>
          ))}
        </div>
      )}

      {value.mode !== 'none' && variant === 'post' && !value.urls.length && (
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <Check className="w-3.5 h-3.5" /> {value.mode === 'library' ? 'Choose photos, or let the app pick some for you.' : 'Upload one or more photos.'}
        </p>
      )}

      {libraryOpen && (
        <LibraryModal
          initial={value.assetIds}
          onClose={() => setLibraryOpen(false)}
          onDone={(picked) => {
            onChange({ ...value, urls: picked.map((a) => a.cloudfront_url), assetIds: picked.map((a) => a.id), count: Math.max(1, picked.length) });
            setLibraryOpen(false);
          }}
        />
      )}
    </div>
  );
}
