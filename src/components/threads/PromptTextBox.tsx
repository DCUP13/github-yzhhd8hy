import { useRef } from 'react';
import { Download, Mic } from 'lucide-react';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { THEME, type ThreadsPrompt } from './types';

interface PromptGroup {
  label: string;
  prompts: ThreadsPrompt[];
}

interface PromptTextBoxProps {
  label: string;
  value: string;
  groups: PromptGroup[];
  placeholder: string;
  rows?: number;
  tokens?: string[];
  note?: string;
  onChange: (text: string) => void;
  onImport: (id: string) => void;
}

const TOKEN_LABELS: Record<string, string> = {
  '{{topic}}': 'Topic',
  '{{voice}}': 'Voice',
  '{{photo_count}}': 'Photo count',
};

export function PromptTextBox({ label, value, groups, placeholder, rows = 5, tokens = ['{{topic}}', '{{voice}}'], note = 'Edits here are saved to this plan only. Your saved prompt on the Prompts page is not changed.', onChange, onImport }: PromptTextBoxProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const usable = groups.map((g) => ({ ...g, prompts: g.prompts.filter((p) => p.content?.trim()) }));
  const all = usable.flatMap((g) => g.prompts);
  const visibleGroups = usable.filter((g) => g.prompts.length > 0);

  const importPrompt = async (id: string) => {
    const picked = all.find((p) => p.id === id);
    if (!picked?.content) return;
    if (value.trim() && value.trim() !== picked.content.trim()) {
      const ok = await showConfirm({ message: `Replace the current ${label.toLowerCase()} with "${picked.title}"?`, confirmText: 'Replace' });
      if (!ok) return;
    }
    onChange(picked.content);
    onImport(picked.id);
    toast.success(`Imported "${picked.title}". Edit it here if needed.`);
    requestAnimationFrame(() => ref.current?.focus());
  };

  const insertToken = (token: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <div className="relative max-w-[60%]">
          <Download className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <select
            value=""
            disabled={!all.length}
            onChange={(e) => { if (e.target.value) importPrompt(e.target.value); }}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 pl-7 pr-2 py-1 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <option value="">{all.length ? 'Import a Threads prompt...' : 'No Threads prompts saved'}</option>
            {visibleGroups.length === 1
              ? visibleGroups[0].prompts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)
              : visibleGroups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.prompts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </optgroup>
              ))}
          </select>
        </div>
      </div>
      {!all.length && (
        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">To reuse prompts, create one on the Prompts page and set its category to Threads.</p>
      )}
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`${THEME.input} leading-relaxed`}
      />
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <span className="text-xs text-gray-400 mr-1">Insert:</span>
        {tokens.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => insertToken(t)}
            className={t === '{{voice}}'
              ? 'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:bg-sky-100 transition-colors'
              : 'px-2 py-0.5 text-xs rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors'}
          >
            {t === '{{voice}}' && <Mic className="w-3 h-3" />}{TOKEN_LABELS[t] || t}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{note}</p>
    </div>
  );
}
