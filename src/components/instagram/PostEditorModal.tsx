import { useEffect, useState } from 'react';
import { Loader2, Save, Trash2, RefreshCw, Sparkles, Images, X, ArrowLeft, ArrowRight, Plus, Link2, ExternalLink, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { Modal, labelClass, secondaryBtn } from '../linkedin/Modal';
import { generateWithEngine } from './api';
import { StatusBadge, displayStatus, isLocked } from './postStatus';
import { LinkPicker } from './LinkPicker';
import { PhotoTextEditor } from './PhotoTextEditor';
import { PINK, fullCaption, type IgAccountLite, type LibraryAsset, type OverlayScope, type SavedLink, type ScheduledPost } from './types';

interface PostEditorModalProps {
  post: ScheduledPost;
  accounts: IgAccountLite[];
  links: SavedLink[];
  onClose: () => void;
  onChanged: (post: ScheduledPost | null) => void;
}

const MAX_CAPTION = 2200;
const MAX_PHOTOS = 10;
const headLabel = 'text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseTags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#*/, ''))
    .filter(Boolean)
    .map((t) => `#${t}`);
}

interface Photo { id: string | null; url: string; text: string }

function photosOf(post: ScheduledPost): Photo[] {
  const texts = post.overlay_texts || [];
  return (post.media_urls || []).map((url, i) => ({
    id: post.media_asset_ids?.[i] ?? null,
    url,
    text: texts[i] ?? (i === 0 || (post.overlay_mode === 'fixed' && texts.length === 0) ? post.overlay_text || '' : ''),
  }));
}

export function PostEditorModal({ post, accounts, links, onClose, onChanged }: PostEditorModalProps) {
  const [caption, setCaption] = useState(post.caption || '');
  const [tags, setTags] = useState((post.hashtags || []).join(' '));
  const [photos, setPhotos] = useState<Photo[]>(() => photosOf(post));
  const [overlay, setOverlay] = useState(post.overlay_text || '');
  const [scope, setScope] = useState<OverlayScope>(post.overlay_scope || 'first');
  const [when, setWhen] = useState(toLocalInput(post.scheduled_for));
  const [accountIds, setAccountIds] = useState<string[]>(post.account_ids || []);
  const [linkId, setLinkId] = useState(post.link_id || '');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState<null | 'save' | 'caption' | 'media' | 'overlay' | 'delete'>(null);
  const [picker, setPicker] = useState(false);
  const [library, setLibrary] = useState<LibraryAsset[] | null>(null);
  const [libraryError, setLibraryError] = useState(false);

  const status = displayStatus(post);
  const locked = isLocked(post);
  const link = links.find((l) => l.id === linkId)?.url || '';
  const hashtags = parseTags(tags);
  const preview = fullCaption(caption, hashtags, link);
  const everyPhoto = photos.length > 1 && scope === 'all';
  const coverText = scope === 'all' ? photos[0]?.text || '' : overlay;

  useEffect(() => {
    if (!picker || library) return;
    (async () => {
      const { data, error } = await supabase
        .from('media_assets')
        .select('id, cloudfront_url, file_name, file_type')
        .eq('file_type', 'image')
        .order('created_at', { ascending: false });
      if (error) { setLibraryError(true); return; }
      setLibrary((data || []) as LibraryAsset[]);
    })();
  }, [picker, library]);

  const applyFresh = (fresh: ScheduledPost) => {
    setCaption(fresh.caption || '');
    setTags((fresh.hashtags || []).join(' '));
    setPhotos(photosOf(fresh));
    setOverlay(fresh.overlay_text || '');
    setScope(fresh.overlay_scope || 'first');
    onChanged(fresh);
  };

  const persist = async (): Promise<ScheduledPost | null> => {
    if (preview.length > MAX_CAPTION) { toast.error(`Instagram captions are limited to ${MAX_CAPTION.toLocaleString()} characters, including the link and hashtags`); return null; }
    if (hashtags.length > 30) { toast.error('Instagram allows up to 30 hashtags'); return null; }
    if (!when) { toast.error('Choose a date and time'); return null; }
    const scheduled = new Date(when).toISOString();
    const patch: Record<string, unknown> = {
      caption,
      hashtags,
      media_urls: photos.map((p) => p.url),
      media_asset_ids: photos.map((p) => p.id).filter((id): id is string => !!id),
      media_type: photos.length > 1 ? 'carousel' : 'single',
      carousel_size: Math.max(photos.length, 1),
      overlay_text: everyPhoto ? photos[0].text : coverText,
      overlay_texts: everyPhoto ? photos.map((p) => p.text) : [],
      overlay_scope: everyPhoto ? 'all' : 'first',
      scheduled_for: scheduled,
      account_ids: accountIds,
      link_id: linkId || null,
      updated_at: new Date().toISOString(),
    };
    if (post.status === 'failed' && new Date(scheduled) > new Date()) {
      patch.status = 'scheduled';
      patch.publish_error = null;
    }
    const { data, error } = await supabase.from('instagram_scheduled_posts').update(patch).eq('id', post.id).select('*').maybeSingle();
    if (error || !data) { toast.error('Could not save the post'); return null; }
    return data as ScheduledPost;
  };

  const save = async () => {
    if (photos.length === 0) { toast.error('Add at least one photo'); return; }
    if (accountIds.length === 0) { toast.error('Choose at least one account'); return; }
    if (!caption.trim()) { toast.error('The caption cannot be empty'); return; }
    setBusy('save');
    const saved = await persist();
    setBusy(null);
    if (saved) { toast.success('Post saved'); onChanged(saved); onClose(); }
  };

  const regenerate = async (parts: 'caption' | 'media' | 'overlay') => {
    const msg = parts === 'caption'
      ? 'Rewrite the caption? Your current caption and hashtags will be replaced.'
      : parts === 'media' ? 'Pick new photos? The current photos will be replaced.'
      : 'Rewrite the text on the photos? The current photo text will be replaced.';
    const ok = await showConfirm({ message: msg, confirmText: parts === 'media' ? 'Pick new' : 'Rewrite' });
    if (!ok) return;
    setBusy(parts);
    const saved = await persist();
    if (!saved) { setBusy(null); return; }
    try {
      applyFresh(await generateWithEngine(post.id, parts, parts === 'caption' ? instructions : ''));
      toast.success(parts === 'caption' ? 'Caption rewritten' : parts === 'media' ? 'New photos picked' : 'Photo text rewritten');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await showConfirm({ message: 'Delete this post from the calendar? Regenerating the week with "replace" will create it again.', variant: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    setBusy('delete');
    const { error } = await supabase.from('instagram_scheduled_posts').delete().eq('id', post.id);
    setBusy(null);
    if (error) { toast.error('Could not delete the post'); return; }
    onChanged(null);
    onClose();
  };

  const movePhoto = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    setPhotos(next);
  };

  const togglePick = (a: LibraryAsset) => {
    const idx = photos.findIndex((p) => p.id === a.id);
    if (idx >= 0) { setPhotos(photos.filter((_, i) => i !== idx)); return; }
    if (photos.length >= MAX_PHOTOS) { toast.info(`A carousel can hold up to ${MAX_PHOTOS} photos`); return; }
    setPhotos([...photos, { id: a.id, url: a.cloudfront_url, text: '' }]);
  };

  const toggleAccount = (id: string) => setAccountIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const changeScope = (next: OverlayScope) => {
    if (next === scope) return;
    if (next === 'all') setPhotos(photos.map((p, i) => (i === 0 ? { ...p, text: overlay } : p)));
    else setOverlay(photos[0]?.text || '');
    setScope(next);
  };

  const setPhotoText = (index: number, text: string) => setPhotos(photos.map((p, i) => (i === index ? { ...p, text } : p)));

  const headerDate = new Date(post.scheduled_for).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const results = Array.isArray(post.publish_results) ? post.publish_results : [];
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.username || 'Account';

  return (
    <Modal
      title={headerDate}
      size="xl"
      onClose={onClose}
      footer={
        locked ? (
          <button onClick={onClose} className={secondaryBtn}>Close</button>
        ) : (
          <>
            <button onClick={remove} disabled={!!busy} className="mr-auto inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              {busy === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
            </button>
            <button onClick={onClose} disabled={!!busy} className={secondaryBtn}>Cancel</button>
            <button onClick={save} disabled={!!busy} className={PINK.primary}>
              {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </button>
          </>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {post.topic_name && <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-300">{post.topic_name}</span>}
        <span className="text-xs text-gray-500">{photos.length > 1 ? `Carousel, ${photos.length} photos` : 'Single photo'}</span>
        <span className="ml-auto"><StatusBadge status={status} /></span>
      </div>

      {post.generation_status === 'failed' && post.generation_error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
          This post could not be prepared: {post.generation_error}. Use Rewrite caption or Pick new photos to try again.
        </div>
      )}
      {post.publish_error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
          Instagram did not accept this post: {post.publish_error}{post.status === 'failed' ? '. Saving it with a future time will schedule it again.' : ''}
        </div>
      )}
      {results.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {results.map((r) => (
            <div key={r.account_id} className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${r.status === 'published' ? 'bg-green-500' : r.status === 'failed' ? 'bg-red-500' : 'bg-yellow-400'}`} />
              <span className="font-medium text-gray-800 dark:text-gray-100">@{accountName(r.account_id)}</span>
              <span className="text-gray-500">{r.status === 'published' ? 'Posted' : r.status === 'failed' ? r.error || 'Failed' : 'In progress'}</span>
              {r.permalink && <a href={r.permalink} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-pink-600 hover:underline">View <ExternalLink className="w-3.5 h-3.5" /></a>}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={headLabel}>Photos</label>
              {!locked && (
                <div className="flex items-center gap-1">
                  <button onClick={() => regenerate('media')} disabled={!!busy} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
                    {busy === 'media' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Pick new
                  </button>
                  <button onClick={() => setPicker(!picker)} disabled={!!busy} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/20">
                    <Images className="w-3.5 h-3.5" /> {picker ? 'Done' : 'Add from library'}
                  </button>
                </div>
              )}
            </div>
            {photos.length === 0 ? (
              <p className="p-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-center text-gray-500">No photos yet. Add some from your library.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {photos.map((p, i) => (
                  <div key={`${p.url}-${i}`} className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                    <span className="absolute top-1 left-1 px-1.5 rounded bg-black/60 text-[10px] font-semibold text-white">{i + 1}</span>
                    {!locked && (
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-1 bg-gradient-to-t from-black/70 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => movePhoto(i, -1)} disabled={i === 0} className="p-1 rounded text-white hover:bg-white/20 disabled:opacity-30" aria-label="Move left"><ArrowLeft className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setPhotos(photos.filter((_, k) => k !== i))} className="p-1 rounded text-white hover:bg-red-500/80" aria-label="Remove photo"><X className="w-3.5 h-3.5" /></button>
                        <button onClick={() => movePhoto(i, 1)} disabled={i === photos.length - 1} className="p-1 rounded text-white hover:bg-white/20 disabled:opacity-30" aria-label="Move right"><ArrowRight className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {picker && !locked && (
              <div className="mt-3 p-2 rounded-lg border border-pink-200 dark:border-pink-900/40 bg-pink-50/40 dark:bg-pink-900/10">
                {libraryError ? (
                  <p className="p-3 text-sm text-red-600">Could not load your library.</p>
                ) : !library ? (
                  <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-pink-500" /></div>
                ) : library.length === 0 ? (
                  <p className="p-3 text-sm text-gray-500">Your content library has no photos yet.</p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-64 overflow-y-auto">
                    {library.map((a) => {
                      const on = photos.some((p) => p.id === a.id);
                      return (
                        <button key={a.id} onClick={() => togglePick(a)} className={`relative aspect-square rounded-md overflow-hidden ring-2 transition-all ${on ? 'ring-pink-500' : 'ring-transparent hover:ring-pink-300'}`} title={a.file_name}>
                          <img src={a.cloudfront_url} alt={a.file_name} loading="lazy" className="w-full h-full object-cover" />
                          {on ? <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-pink-600 text-white flex items-center justify-center"><Check className="w-3 h-3" /></span>
                            : <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/40 text-white flex items-center justify-center"><Plus className="w-3 h-3" /></span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={headLabel}>Caption</label>
              <span className={`text-xs tabular-nums ${preview.length > MAX_CAPTION ? 'text-red-600' : 'text-gray-400'}`}>{preview.length.toLocaleString()} / {MAX_CAPTION.toLocaleString()}</span>
            </div>
            {busy === 'caption' ? (
              <div className="h-56 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-3 text-sm text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin text-pink-500" /> Writing in your voice...
              </div>
            ) : (
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} readOnly={locked} rows={8} placeholder={post.generation_status === 'pending' ? 'This caption is queued to be written.' : 'Write your caption...'} className={`${PINK.input} leading-relaxed`} />
            )}
            {!locked && (
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Optional: how should the AI change it? e.g. shorter, more playful" className={PINK.input} />
                <button onClick={() => regenerate('caption')} disabled={!!busy} className={`${secondaryBtn} whitespace-nowrap`}>
                  <Sparkles className="w-4 h-4 text-pink-500" /> Rewrite caption
                </button>
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>Hashtags</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} readOnly={locked} placeholder="#coffee #morning" className={PINK.input} />
            <p className="mt-1 text-xs text-gray-400">{hashtags.length} / 30</p>
          </div>

          {(post.overlay_mode !== 'none' || coverText || photos.some((p) => p.text)) && (
            <PhotoTextEditor
              photos={photos}
              scope={scope}
              coverText={coverText}
              locked={locked}
              canRewrite={post.overlay_mode === 'ai' && photos.length > 0}
              rewriting={busy === 'overlay'}
              disabled={!!busy}
              onScopeChange={changeScope}
              onCoverTextChange={(text) => (scope === 'all' ? setPhotoText(0, text) : setOverlay(text))}
              onPhotoTextChange={setPhotoText}
              onRewrite={() => regenerate('overlay')}
            />
          )}
        </div>

        <div className="lg:col-span-2 space-y-5">
          <div>
            <label className={labelClass}>Publish at</label>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} disabled={locked} className={PINK.input} />
          </div>

          <div>
            <label className={labelClass}>Post to</label>
            {accounts.length === 0 ? (
              <p className="text-sm text-gray-500">No Instagram accounts connected.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => {
                  const on = accountIds.includes(a.id);
                  return (
                    <button key={a.id} onClick={() => !locked && toggleAccount(a.id)} disabled={locked} className={`inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border text-sm transition-colors ${on ? 'border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-300' : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-gray-300'}`}>
                      {a.profile_picture_url ? <img src={a.profile_picture_url} alt="" className="w-6 h-6 rounded-full object-cover" /> : <span className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700" />}
                      @{a.username || 'account'}
                      {on && <Check className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>
            )}
            {!locked && accountIds.length === 0 && <p className="mt-2 text-xs text-amber-600">Choose at least one account.</p>}
            <p className="mt-2 text-xs text-gray-400">Changes here only affect this post.</p>
          </div>

          <div>
            <label className={labelClass}>Link after the caption</label>
            <LinkPicker
              links={links}
              value={linkId}
              disabled={locked}
              onChange={setLinkId}
            />
          </div>

          <div>
            <label className={labelClass}>Caption preview</label>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 text-sm leading-relaxed text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
              {caption.trim() || <span className="text-gray-400">No caption yet.</span>}
              {link && (
                <span className="block mt-4 select-none text-gray-400 dark:text-gray-500" title="Edit this web address on the Links tab">
                  <Link2 className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />{link}
                </span>
              )}
              {hashtags.length > 0 && <span className="block mt-4 text-pink-700 dark:text-pink-300">{hashtags.join(' ')}</span>}
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              {link ? 'The link is added when the post goes out. To change the web address itself, edit it on the Links tab.' : 'No link on this post. Choose a saved link above to add one.'}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
