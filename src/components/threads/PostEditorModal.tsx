import { useMemo, useState } from 'react';
import { Loader2, Sparkles, Trash2, Send, CalendarClock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { Modal, labelClass, secondaryBtn } from '../linkedin/Modal';
import { generateWithEngine, nudgePublisher } from './api';
import { InstagramCrossPost, ThreadsAccountsPicker } from './AudiencePicker';
import { LinkPicker } from './LinkPicker';
import { PhotoPicker, type PhotoValue } from './PhotoPicker';
import { PostInsights } from './PostInsights';
import { StatusBadge, displayStatus, isLocked } from './postStatus';
import type { ContentData } from './useContentData';
import { MAX_CHARS, THEME, fullText, type IgAccountLite, type ScheduledPost, type ThreadsAccount } from './types';

interface Props {
  post: ScheduledPost | null;
  defaultDate?: string;
  data: ContentData;
  accounts: ThreadsAccount[];
  igAccounts: IgAccountLite[];
  onClose: () => void;
  onSaved: () => void;
  onLibraryChanged: () => void;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toLocalInput(iso: string | null, fallbackDate?: string): string {
  if (iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const date = fallbackDate || `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${date}T${pad(d.getHours())}:00`;
}

export function PostEditorModal({ post, defaultDate, data, accounts, igAccounts, onClose, onSaved, onLibraryChanged }: Props) {
  const connected = accounts.filter((a) => a.connected);
  const [postId, setPostId] = useState<string | null>(post?.id ?? null);
  const [text, setText] = useState(post?.content_text ?? '');
  const [linkId, setLinkId] = useState(post?.link_id ?? '');
  const [photo, setPhoto] = useState<PhotoValue>({
    mode: post?.photo_mode ?? 'none',
    count: post?.photo_count ?? 1,
    urls: post?.media_urls ?? [],
    assetIds: post?.media_asset_ids ?? [],
  });
  const [accountIds, setAccountIds] = useState<string[]>(post?.account_ids?.length ? post.account_ids : connected.map((a) => a.id));
  const [alsoIg, setAlsoIg] = useState(post?.also_instagram ?? false);
  const [igIds, setIgIds] = useState<string[]>(post?.instagram_account_ids ?? []);
  const [when, setWhen] = useState(toLocalInput(post?.scheduled_for ?? null, defaultDate));
  const [promptId, setPromptId] = useState(post?.prompt_id ?? '');
  const [topicId, setTopicId] = useState(post?.topic_id ?? '');
  const [voiceId, setVoiceId] = useState(post?.voice_sample_id ?? '');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'schedule' | 'now' | 'write' | 'photos' | 'delete'>('');

  const link = data.links.find((l) => l.id === linkId);
  const total = fullText(text, link?.url ?? '').length;
  const over = total > MAX_CHARS;
  const hasPhotos = photo.mode !== 'none' && photo.urls.length > 0;
  const visibleTopics = useMemo(() => data.topics.filter((t) => !t.is_hidden), [data.topics]);

  if (post && isLocked(post)) {
    return (
      <Modal title="Threads post" onClose={onClose} size="lg">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <StatusBadge status={displayStatus(post)} />
            {post.published_at && <span className="text-xs text-gray-500">{new Date(post.published_at).toLocaleString()}</span>}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">{fullText(post.content_text, link?.url ?? '')}</p>
          {post.media_urls.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {post.media_urls.map((u) => <img key={u} src={u} alt="" className="h-28 w-28 rounded-lg object-cover flex-shrink-0" />)}
            </div>
          )}
          <PostInsights post={post} onChanged={onSaved} />
        </div>
      </Modal>
    );
  }

  const row = () => {
    const d = new Date(when);
    return {
      content_text: text.trim(),
      link_id: linkId || null,
      photo_mode: photo.mode,
      photo_count: photo.mode === 'none' ? 1 : Math.max(1, photo.urls.length || photo.count),
      media_urls: photo.mode === 'none' ? [] : photo.urls,
      media_asset_ids: photo.mode === 'library' ? photo.assetIds : [],
      account_ids: accountIds,
      also_instagram: alsoIg,
      instagram_account_ids: alsoIg ? igIds : [],
      prompt_id: promptId || null,
      topic_id: topicId || null,
      topic_name: data.topics.find((t) => t.id === topicId)?.name ?? null,
      voice_sample_id: voiceId || null,
      scheduled_for: Number.isNaN(d.getTime()) ? null : d.toISOString(),
      slot_date: Number.isNaN(d.getTime()) ? null : when.slice(0, 10),
    };
  };

  const persist = async (extra: Record<string, unknown>): Promise<string | null> => {
    const payload = { ...row(), ...extra };
    if (postId) {
      const { error } = await supabase.from('threads_posts').update(payload).eq('id', postId);
      if (error) { toast.error('Could not save the post'); return null; }
      return postId;
    }
    const { data: created, error } = await supabase.from('threads_posts').insert({ generation_status: 'none', ...payload }).select('id').maybeSingle();
    if (error || !created) { toast.error('Could not save the post'); return null; }
    setPostId(created.id);
    return created.id as string;
  };

  const runEngine = async (parts: 'text' | 'photos') => {
    setBusy(parts === 'text' ? 'write' : 'photos');
    try {
      const id = await persist(postId ? {} : { status: 'draft' });
      if (!id) return;
      const updated = await generateWithEngine(id, parts, instructions);
      if (parts === 'text') setText(updated.content_text);
      else setPhoto((p) => ({ ...p, urls: updated.media_urls, assetIds: updated.media_asset_ids }));
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy('');
    }
  };

  const validate = (): boolean => {
    if (!text.trim()) { toast.error('Write something first'); return false; }
    if (over) { toast.error(`Threads posts can be up to ${MAX_CHARS} characters`); return false; }
    if (!accountIds.length) { toast.error('Choose at least one Threads profile'); return false; }
    if (photo.mode !== 'none' && !photo.urls.length) { toast.error('Add photos or switch to "No photos"'); return false; }
    return true;
  };

  const save = async (kind: 'save' | 'schedule' | 'now') => {
    if (kind !== 'save' && !validate()) return;
    if (kind === 'schedule' && new Date(when).getTime() < Date.now() - 60000) {
      toast.error('Pick a time in the future, or use Post now');
      return;
    }
    setBusy(kind);
    const extra: Record<string, unknown> =
      kind === 'save' ? { status: 'draft' } : { status: 'scheduled', publish_error: null };
    if (kind === 'now') {
      extra.scheduled_for = new Date().toISOString();
    }
    const id = await persist(extra);
    setBusy('');
    if (!id) return;
    if (kind === 'now') nudgePublisher();
    toast.success(kind === 'save' ? 'Draft saved' : kind === 'now' ? 'Posting to Threads now' : 'Post scheduled');
    onSaved();
    onClose();
  };

  const remove = async () => {
    if (!postId) { onClose(); return; }
    const ok = await showConfirm({ message: 'Delete this post? It has not been posted yet.', variant: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    setBusy('delete');
    const { error } = await supabase.from('threads_posts').delete().eq('id', postId);
    setBusy('');
    if (error) { toast.error('Could not delete the post'); return; }
    toast.success('Post deleted');
    onSaved();
    onClose();
  };

  const footer = (
    <>
      {postId && (
        <button type="button" onClick={remove} disabled={!!busy} className="mr-auto inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50">
          {busy === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
        </button>
      )}
      <button type="button" onClick={() => save('save')} disabled={!!busy} className={secondaryBtn}>
        {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} Save draft
      </button>
      <button type="button" onClick={() => save('now')} disabled={!!busy} className={secondaryBtn}>
        {busy === 'now' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Post now
      </button>
      <button type="button" onClick={() => save('schedule')} disabled={!!busy} className={THEME.primary}>
        {busy === 'schedule' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />} Schedule
      </button>
    </>
  );

  return (
    <Modal title={post ? 'Edit Threads post' : 'New Threads post'} subtitle={post ? undefined : 'Write it yourself or let AI draft it.'} onClose={onClose} size="lg" footer={footer}>
      <div className="space-y-5">
        {post && (post.generation_error || post.publish_error) && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{post.generation_error || post.publish_error}</p>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={labelClass + ' mb-0'}>Post text</label>
            <span className={`text-xs font-medium ${over ? 'text-red-600' : total > MAX_CHARS - 50 ? 'text-amber-600' : 'text-gray-400'}`}>
              {total}/{MAX_CHARS}
            </span>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="What do you want to say?" className={`${THEME.input} resize-y leading-relaxed`} />
          {link && <p className="mt-1 text-xs text-gray-500">The link is added at the end and counts toward the limit.</p>}
        </div>

        <details className="group rounded-xl border border-gray-200 dark:border-gray-700">
          <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer text-sm font-medium text-gray-800 dark:text-gray-200 select-none">
            <Sparkles className="w-4 h-4 text-sky-500" /> Write with AI
          </summary>
          <div className="px-3 pb-3 space-y-3">
            <div className="grid sm:grid-cols-3 gap-2">
              <select value={promptId} onChange={(e) => setPromptId(e.target.value)} className={THEME.input}>
                <option value="">Default prompt</option>
                {data.prompts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className={THEME.input}>
                <option value="">Any topic</option>
                {visibleTopics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className={THEME.input}>
                <option value="">Any voice</option>
                {data.samples.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Extra instructions (optional)" className={THEME.input} />
            <button type="button" onClick={() => runEngine('text')} disabled={!!busy} className={secondaryBtn}>
              {busy === 'write' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {text.trim() ? 'Rewrite' : 'Write it'}
            </button>
          </div>
        </details>

        <div>
          <label className={labelClass}>Link (optional)</label>
          <LinkPicker links={data.links} value={linkId} onChange={setLinkId} onCreated={onLibraryChanged} />
        </div>

        <div>
          <label className={labelClass}>Photos (optional)</label>
          <PhotoPicker value={photo} onChange={setPhoto} variant="post" onAutoPick={() => runEngine('photos')} autoPicking={busy === 'photos'} disabled={!!busy && busy !== 'photos'} />
        </div>

        <div>
          <label className={labelClass}>Post to</label>
          <ThreadsAccountsPicker accounts={accounts} value={accountIds} onChange={setAccountIds} />
        </div>

        <InstagramCrossPost enabled={alsoIg} onEnabledChange={setAlsoIg} igAccounts={igAccounts} value={igIds} onChange={setIgIds} hasPhotos={hasPhotos} />

        <div>
          <label className={labelClass}>When</label>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`${THEME.input} sm:max-w-xs`} />
        </div>
      </div>
    </Modal>
  );
}
