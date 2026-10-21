import React, { useState } from 'react';
import { Loader2, Save, Trash2, RefreshCw, CheckCircle2, FileText, Upload, ExternalLink, ChevronDown, MessageSquare, ArrowUp, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { generateWithEngine, uploadFile } from './api';
import { Modal, inputClass, labelClass, primaryBtn, secondaryBtn } from './Modal';
import { StatusBadge, displayStatus } from './postStatus';
import { CATEGORY_STYLES, type EnginePost } from './types';

interface PostEditorModalProps {
  post: EnginePost;
  leadDays: number;
  onClose: () => void;
  onChanged: (post: EnginePost | null) => void;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PostEditorModal({ post, leadDays, onClose, onChanged }: PostEditorModalProps) {
  const [text, setText] = useState(post.content_text || '');
  const [when, setWhen] = useState(toLocalInput(post.scheduled_for));
  const [prompt, setPrompt] = useState(post.generation_prompt || '');
  const [docUrl, setDocUrl] = useState(post.document_url);
  const [docName, setDocName] = useState(post.document_name);
  const [docTitle, setDocTitle] = useState(post.article_title || '');
  const [busy, setBusy] = useState<null | 'save' | 'approve' | 'upload' | 'all' | 'post' | 'guide' | 'delete'>(null);
  const [showRegen, setShowRegen] = useState(false);
  const [showResearch, setShowResearch] = useState(post.category === 'research');
  const [showPrompt, setShowPrompt] = useState(false);

  const status = displayStatus(post, leadDays);
  const locked = post.status === 'published' || post.status === 'publishing';
  const writing = post.generation_status === 'generating';
  const isResearch = post.category === 'research';
  const sources = Array.isArray(post.research_sources) ? post.research_sources : [];

  const persist = async (extra: Record<string, unknown> = {}) => {
    if (!text.trim() && post.generation_status !== 'pending') {
      toast.error('The post text cannot be empty');
      return null;
    }
    if (text.length > 3000) {
      toast.error('LinkedIn posts are limited to 3,000 characters');
      return null;
    }
    const scheduled = when ? new Date(when).toISOString() : null;
    const patch: Record<string, unknown> = {
      content_text: text,
      scheduled_for: scheduled,
      generation_prompt: prompt,
      document_url: docUrl,
      document_name: docName,
      article_title: docUrl ? (docTitle.trim() || (docName || 'Guide').replace(/\.[a-z0-9]+$/i, '')) : post.article_title,
      updated_at: new Date().toISOString(),
      ...extra,
    };
    if (post.status === 'failed' && scheduled && text.trim()) {
      patch.status = 'scheduled';
      patch.error_message = null;
    }
    const { data, error } = await supabase.from('linkedin_posts').update(patch).eq('id', post.id).select('*').maybeSingle();
    if (error || !data) {
      toast.error('Could not save the post');
      return null;
    }
    return data as EnginePost;
  };

  const save = async () => {
    setBusy('save');
    const saved = await persist();
    setBusy(null);
    if (saved) {
      toast.success('Post saved');
      onChanged(saved);
      onClose();
    }
  };

  const approve = async () => {
    setBusy('approve');
    const saved = await persist({ needs_review: false, reviewed_at: new Date().toISOString() });
    setBusy(null);
    if (saved) {
      toast.success('Approved');
      onChanged(saved);
      onClose();
    }
  };

  const regenerate = async (parts: 'all' | 'post' | 'guide') => {
    setShowRegen(false);
    if (text.trim() && parts !== 'guide') {
      const ok = await showConfirm({ message: 'Rewrite this post? Your current text will be replaced.', confirmText: 'Rewrite' });
      if (!ok) return;
    }
    setBusy(parts);
    const saved = await persist();
    if (!saved) { setBusy(null); return; }
    try {
      const fresh = await generateWithEngine(post.id, parts);
      setText(fresh.content_text || '');
      setDocUrl(fresh.document_url);
      setDocName(fresh.document_name);
      setDocTitle(fresh.article_title || '');
      onChanged(fresh);
      toast.success(parts === 'guide' ? 'New guide created' : 'Post rewritten');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed');
      onChanged(null);
    } finally {
      setBusy(null);
    }
  };

  const handleUpload = async (file: File) => {
    setBusy('upload');
    try {
      const res = await uploadFile(file, 'linkedin/documents');
      setDocUrl(res.url);
      setDocName(file.name);
      setDocTitle(file.name.replace(/\.[a-z0-9]+$/i, ''));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await showConfirm({ message: 'Delete this post from the calendar? Regenerating the week will create it again.', variant: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    setBusy('delete');
    const { error } = await supabase.from('linkedin_posts').delete().eq('id', post.id);
    setBusy(null);
    if (error) {
      toast.error('Could not delete the post');
      return;
    }
    onChanged(null);
    onClose();
  };

  const headerDate = post.scheduled_for
    ? new Date(post.scheduled_for).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Unscheduled';

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
            {post.generation_status !== 'none' && (
              <div className="relative">
                <button onClick={() => setShowRegen(!showRegen)} disabled={!!busy || writing} className={secondaryBtn}>
                  {busy === 'all' || busy === 'post' || busy === 'guide' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {busy === 'all' || busy === 'post' || busy === 'guide' ? 'Writing...' : 'Regenerate'}
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {showRegen && (
                  <div className="absolute bottom-full mb-2 right-0 w-60 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl py-1 z-10">
                    <button onClick={() => regenerate('post')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">Rewrite post text{isResearch && sources.length ? ' (same research)' : ''}</button>
                    {post.guide_mode === 'ai' && <button onClick={() => regenerate('guide')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">New AI guide only</button>}
                    <button onClick={() => regenerate('all')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">Everything{isResearch ? ' (fresh research)' : ''}</button>
                  </div>
                )}
              </div>
            )}
            {post.needs_review && post.status === 'scheduled' && (
              <button onClick={approve} disabled={!!busy} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {busy === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Save & approve
              </button>
            )}
            <button onClick={save} disabled={!!busy} className={primaryBtn}>
              {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </button>
          </>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {post.category && (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${CATEGORY_STYLES[post.category].chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${CATEGORY_STYLES[post.category].dot}`} />
            {post.category.charAt(0).toUpperCase() + post.category.slice(1)}
          </span>
        )}
        {post.topic_name && <span className="text-sm text-gray-600 dark:text-gray-300">{post.topic_name}</span>}
        <span className="ml-auto"><StatusBadge status={status} /></span>
      </div>

      {post.generation_status === 'failed' && post.generation_error && (
        <div className="mb-5 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
          The AI could not write this post: {post.generation_error}. Use Regenerate to try again.
        </div>
      )}
      {post.status === 'failed' && post.error_message && (
        <div className="mb-5 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
          LinkedIn rejected this post: {post.error_message}. Saving it with a future time will schedule it again.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className={labelClass}>Post</label>
            <span className={`text-xs tabular-nums ${text.length > 3000 ? 'text-red-600' : 'text-gray-400'}`}>{text.length.toLocaleString()} / 3,000</span>
          </div>
          {busy === 'all' || busy === 'post' ? (
            <div className="h-[420px] rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-3 text-sm text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin text-[#0A66C2]" />
              {busy === 'all' && isResearch ? 'Researching Reddit and writing. This can take a minute...' : 'Writing in your voice...'}
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              readOnly={locked}
              rows={18}
              placeholder={post.generation_status === 'pending' ? 'This post is queued to be written.' : 'Write your post...'}
              className={`${inputClass} leading-relaxed min-h-[260px] sm:min-h-[420px]`}
            />
          )}
        </div>

        <div className="lg:col-span-2 space-y-5">
          <div>
            <label className={labelClass}>Publish at</label>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} disabled={locked} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Document</label>
            {busy === 'guide' ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Writing a new guide...</div>
            ) : docUrl ? (
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#0A66C2] flex-shrink-0" />
                  <a href={docUrl} target="_blank" rel="noreferrer" className="flex-1 text-sm font-medium text-gray-900 dark:text-white hover:text-[#0A66C2] truncate">{docName || 'Document'}</a>
                  <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                  {!locked && (
                    <button onClick={() => { setDocUrl(null); setDocName(null); }} className="p-1 rounded text-gray-400 hover:text-red-600" aria-label="Remove document"><X className="w-4 h-4" /></button>
                  )}
                </div>
                <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} disabled={locked} placeholder="Title shown on LinkedIn" className={`${inputClass} py-1.5`} />
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No document attached.</p>
            )}
            {!locked && !isResearch && (
              <label className={`${secondaryBtn} mt-2 cursor-pointer w-full`}>
                {busy === 'upload' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {docUrl ? 'Replace with a file' : 'Attach a file'}
                <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" className="hidden" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
              </label>
            )}
            {isResearch && !locked && <p className="mt-2 text-xs text-gray-400">Research posts can only carry AI guides.</p>}
          </div>

          {isResearch && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 overflow-hidden">
              <button onClick={() => setShowResearch(!showResearch)} className="w-full flex items-center justify-between px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                Reddit research {sources.length > 0 && `(${sources.length} threads)`}
                <ChevronDown className={`w-4 h-4 transition-transform ${showResearch ? 'rotate-180' : ''}`} />
              </button>
              {showResearch && (
                <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
                  {post.research_summary ? <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">{post.research_summary}</p> : <p className="text-sm text-gray-500">Research runs {leadDays} {leadDays === 1 ? 'day' : 'days'} before this post goes live.</p>}
                  {post.research_subreddits?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {post.research_subreddits.map((s) => <span key={s} className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-300">r/{s}</span>)}
                    </div>
                  )}
                  {sources.map((s) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="block p-2.5 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
                      <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">{s.title}</p>
                      <p className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                        <span>r/{s.subreddit}</span>
                        <span className="inline-flex items-center gap-0.5"><ArrowUp className="w-3 h-3" />{s.score}</span>
                        <span className="inline-flex items-center gap-0.5"><MessageSquare className="w-3 h-3" />{s.num_comments}</span>
                      </p>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {post.generation_status !== 'none' && (
            <div>
              <button onClick={() => setShowPrompt(!showPrompt)} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 hover:text-gray-700">
                Prompt for this post <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showPrompt ? 'rotate-180' : ''}`} />
              </button>
              {showPrompt && (
                <>
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={locked} rows={5} className={`${inputClass} mt-2 leading-relaxed`} />
                  <p className="mt-1 text-xs text-gray-400">Changes here only affect this post. Save, then Regenerate to use it.</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
