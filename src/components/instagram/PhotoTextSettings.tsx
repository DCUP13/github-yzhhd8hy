import { useState } from 'react';
import { Ban, Sparkles, Type, Loader2, Wand2, Image as ImageIcon, Images } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { labelClass } from '../linkedin/Modal';
import { IMAGE_TEXT_CATEGORY, PINK, STARTER_IMAGE_TEXT_PROMPT, type InstagramPrompt, type OverlayMode, type OverlayScope } from './types';

interface PhotoTextSettingsProps {
  isCarousel: boolean;
  mode: OverlayMode;
  scope: OverlayScope;
  text: string;
  promptId: string;
  prompts: InstagramPrompt[];
  captionPrompts: InstagramPrompt[];
  onModeChange: (mode: OverlayMode) => void;
  onScopeChange: (scope: OverlayScope) => void;
  onTextChange: (text: string) => void;
  onPromptChange: (id: string) => void;
  onPromptCreated: () => void;
}

export function choiceClass(active: boolean) {
  return `flex items-center justify-center gap-1.5 px-2 py-2 text-sm font-medium rounded-lg border transition-all ${
    active
      ? 'border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-300'
      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
  }`;
}

export function PhotoTextSettings({
  isCarousel, mode, scope, text, promptId, prompts, captionPrompts,
  onModeChange, onScopeChange, onTextChange, onPromptChange, onPromptCreated,
}: PhotoTextSettingsProps) {
  const [creating, setCreating] = useState(false);
  const everyPhoto = isCarousel && scope === 'all';
  const selected = [...prompts, ...captionPrompts].find((p) => p.id === promptId);

  const createStarter = async () => {
    setCreating(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setCreating(false);
      toast.error('Please sign in again');
      return;
    }
    const { data, error } = await supabase
      .from('prompts')
      .insert({
        ...STARTER_IMAGE_TEXT_PROMPT,
        category: IMAGE_TEXT_CATEGORY,
        user_id: session.user.id,
        reply_mode: 'single',
        use_business_data: false,
        variables: [],
      })
      .select('id')
      .maybeSingle();
    setCreating(false);
    if (error || !data) {
      toast.error('Could not create the starter prompt');
      return;
    }
    toast.success('Starter prompt added. You can edit it on the Prompts page.');
    onPromptChange(data.id);
    onPromptCreated();
  };

  return (
    <div>
      <label className={labelClass}>Text on photos</label>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={() => onModeChange('none')} className={choiceClass(mode === 'none')}><Ban className="w-4 h-4" /> None</button>
        <button type="button" onClick={() => onModeChange('ai')} className={choiceClass(mode === 'ai')}><Sparkles className="w-4 h-4" /> AI writes it</button>
        <button type="button" onClick={() => onModeChange('fixed')} className={choiceClass(mode === 'fixed')}><Type className="w-4 h-4" /> Fixed text</button>
      </div>

      {mode !== 'none' && isCarousel && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button type="button" onClick={() => onScopeChange('first')} className={choiceClass(scope === 'first')}><ImageIcon className="w-4 h-4" /> Cover photo only</button>
          <button type="button" onClick={() => onScopeChange('all')} className={choiceClass(scope === 'all')}><Images className="w-4 h-4" /> Every photo</button>
        </div>
      )}

      {mode === 'fixed' && (
        <>
          <input value={text} onChange={(e) => onTextChange(e.target.value)} maxLength={120} placeholder="e.g. New this week" className={`${PINK.input} mt-2`} />
          {everyPhoto && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">This text goes on every photo. You can change each photo's text on any post.</p>}
        </>
      )}

      {mode === 'ai' && (
        <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Image text prompt</label>
          <select value={promptId} onChange={(e) => onPromptChange(e.target.value)} className={PINK.input}>
            <option value="">{everyPhoto ? 'Built-in: hook, one point per photo, call to action' : 'Built-in: short headline'}</option>
            {prompts.length > 0 && (
              <optgroup label="Image text prompts">
                {prompts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </optgroup>
            )}
            {captionPrompts.length > 0 && (
              <optgroup label="Other Instagram prompts">
                {captionPrompts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </optgroup>
            )}
          </select>
          {selected && (
            <p className="max-h-28 overflow-y-auto rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300 whitespace-pre-line">{selected.content}</p>
          )}
          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {everyPhoto
              ? 'The AI looks at every photo in order and writes one short line for each, following this prompt. Just describe what each photo should say; the app makes sure the answer comes back as one line per photo.'
              : 'The AI writes a short headline for the cover photo, following this prompt.'}
            {' '}Create your own on the Prompts page with the category "{IMAGE_TEXT_CATEGORY}". You can use {'{{topic}}'}, {'{{voice}}'} and {'{{photo_count}}'} in it.
          </p>
          {prompts.length === 0 && (
            <button type="button" onClick={createStarter} disabled={creating} className="inline-flex items-center gap-1.5 text-xs font-medium text-pink-700 dark:text-pink-300 hover:underline disabled:opacity-60">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              Add a starter carousel prompt
            </button>
          )}
        </div>
      )}
    </div>
  );
}
