import { CornerDownRight, Plus, Scissors, X } from 'lucide-react';
import { labelClass } from '../linkedin/Modal';
import { MAX_CHARS, THEME } from './types';

export const MAX_REPLIES = 10;
export const AUTO_REPLIES = -1;

// Breaks at the most natural boundary available so bullets and sentences stay intact.
export function splitForThread(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const win = rest.slice(0, max + 1);
    let cut = -1;
    for (const [sep, keep] of [['\n\n', 0], ['\n', 0], ['. ', 1], ['! ', 1], ['? ', 1], [' ', 0]] as const) {
      const i = win.lastIndexOf(sep);
      if (i > max * 0.4) { cut = i + keep; break; }
    }
    if (cut <= 0) cut = win.lastIndexOf(' ') > 0 ? win.lastIndexOf(' ') : max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export function SplitButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50 transition-colors">
      <Scissors className="w-3.5 h-3.5" /> Too long? Split the extra into follow-up replies
    </button>
  );
}

export function ReplyCountSelect({ value, onChange, label, hint }: { value: number; onChange: (n: number) => void; label: string; hint: string }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={THEME.input}>
        <option value={AUTO_REPLIES}>Auto, as many as the content needs</option>
        <option value={0}>None, single post</option>
        {Array.from({ length: MAX_REPLIES }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{n} follow-up {n === 1 ? 'reply' : 'replies'}</option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  );
}

interface EditorProps {
  replies: string[];
  onChange: (replies: string[]) => void;
}

export function ThreadRepliesEditor({ replies, onChange }: EditorProps) {
  const update = (i: number, v: string) => onChange(replies.map((r, idx) => (idx === i ? v : r)));
  const remove = (i: number) => onChange(replies.filter((_, idx) => idx !== i));
  const split = (i: number) => onChange([...replies.slice(0, i), ...splitForThread(replies[i], MAX_CHARS), ...replies.slice(i + 1)].slice(0, MAX_REPLIES));

  return (
    <div className="space-y-3">
      {replies.length > 0 && (
        <div className="space-y-3 border-l-2 border-sky-200 dark:border-sky-800 pl-3 ml-1">
          {replies.map((r, i) => {
            const len = r.trim().length;
            return (
              <div key={i} className="group">
                <div className="flex items-center justify-between mb-1">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                    <CornerDownRight className="w-3.5 h-3.5 text-sky-500" /> Follow-up {i + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${len > MAX_CHARS ? 'text-red-600' : len > MAX_CHARS - 50 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {len}/{MAX_CHARS}
                    </span>
                    <button type="button" onClick={() => remove(i)} aria-label={`Remove follow-up ${i + 1}`} className="p-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <textarea value={r} onChange={(e) => update(i, e.target.value)} rows={3} placeholder="Keep the story going..." className={`${THEME.input} resize-y leading-relaxed`} />
                {len > MAX_CHARS && replies.length < MAX_REPLIES && <SplitButton onClick={() => split(i)} />}
              </div>
            );
          })}
        </div>
      )}
      {replies.length < MAX_REPLIES && (
        <button type="button" onClick={() => onChange([...replies, ''])} className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 transition-colors">
          <Plus className="w-4 h-4" /> Add follow-up reply
        </button>
      )}
    </div>
  );
}
