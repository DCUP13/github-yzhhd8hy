import { useState } from 'react';
import { Ban, Sparkles, Type, Loader2, Wand2, Image as ImageIcon, Images } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { labelClass } from '../linkedin/Modal';
import { PromptTextBox } from './PromptTextBox';
import { IMAGE_TEXT_CATEGORY, PINK, STARTER_IMAGE_TEXT_PROMPT, type InstagramPrompt, type OverlayMode, type OverlayScope } from './types';

interface PhotoTextSettingsProps {
  isCarousel: boolean;
  mode: OverlayMode;
  scope: OverlayScope;
  text: string;
  promptText: string;
  prompts: InstagramPrompt[];
  onModeChange: (mode: OverlayMode) => void;
  onScopeChange: (scope: OverlayScope) => void;
  onTextChange: (text: string) => void;
  onPromptTextChange: (text: string) => void;
  onPromptImported: (id: string) => void;
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
  isCarousel, mode, scope, text, promptText, prompts,
  onModeChange, onScopeChange, onTextChange, onPromptTextChange, onPromptImported, onPromptCreated,
}: PhotoTextSettingsProps) {
  const [creating, setCreating] = useState(false);
  const everyPhoto = isCarousel && scope === 'all';

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
    toast.success('Starter prompt added and copied here. Edit it below for this plan.');
    onPromptTextChange(STARTER_IMAGE_TEXT_PROMPT.content);
    onPromptImported(data.id);
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
          <PromptTextBox
            label="Image text prompt"
            value={promptText}
            groups={[{ label: 'Image text prompts', prompts }]}
            placeholder={everyPhoto
              ? 'Leave empty to use the built-in style: a hook on the first photo, one point per photo, a call to action on the last.'
              : 'Leave empty to use the built-in style: a short headline for the cover photo.'}
            rows={4}
            tokens={['{{topic}}', '{{voice}}', '{{photo_count}}']}
            onChange={onPromptTextChange}
            onImport={onPromptImported}
          />
          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {everyPhoto
              ? 'The AI looks at every photo in order and writes one short line for each, following this prompt. Just describe what each photo should say; the app makes sure the answer comes back as one line per photo.'
              : 'The AI writes a short headline for the cover photo, following this prompt.'}
            {' '}Save reusable ones on the Prompts page with the category "{IMAGE_TEXT_CATEGORY}".
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
