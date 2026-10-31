import { AtSign, Check, Instagram } from 'lucide-react';
import type { IgAccountLite, ThreadsAccount } from './types';

function Chip({ on, label, img, onClick, disabled }: { on: boolean; label: string; img: string | null; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border text-sm font-medium transition-all disabled:opacity-50 ${
        on ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300'
      }`}
    >
      {img ? <img src={img} alt="" className="w-6 h-6 rounded-full object-cover" /> : <span className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-900 to-gray-600" />}
      {label}
      {on && <Check className="w-3.5 h-3.5" />}
    </button>
  );
}

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function ThreadsAccountsPicker({ accounts, value, onChange, disabled }: { accounts: ThreadsAccount[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const usable = accounts.filter((a) => a.connected);
  if (!usable.length) return <p className="text-sm text-gray-500">Connect a Threads profile first.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {usable.map((a) => (
        <Chip key={a.id} on={value.includes(a.id)} disabled={disabled} label={`@${a.username ?? 'threads'}`} img={a.profile_picture_url} onClick={() => onChange(toggle(value, a.id))} />
      ))}
    </div>
  );
}

interface CrossPostProps {
  enabled: boolean;
  onEnabledChange: (on: boolean) => void;
  igAccounts: IgAccountLite[];
  value: string[];
  onChange: (ids: string[]) => void;
  hasPhotos: boolean;
  showAccounts?: boolean;
  disabled?: boolean;
}

export function InstagramCrossPost({ enabled, onEnabledChange, igAccounts, value, onChange, hasPhotos, showAccounts = true, disabled }: CrossPostProps) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="mt-0.5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
        />
        <span>
          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
            <Instagram className="w-4 h-4 text-gray-700 dark:text-gray-300" /> Also post to Instagram
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            The same text and photos go to Instagram at the same time. Instagram needs at least one photo.
          </span>
        </span>
      </label>
      {enabled && !hasPhotos && (
        <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
          Add at least one photo, otherwise this will only go to Threads.
        </p>
      )}
      {enabled && showAccounts && (
        igAccounts.length ? (
          <div className="flex flex-wrap gap-2">
            {igAccounts.map((a) => (
              <Chip key={a.id} on={value.includes(a.id)} disabled={disabled} label={`@${a.username ?? 'instagram'}`} img={a.profile_picture_url} onClick={() => onChange(toggle(value, a.id))} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 flex items-center gap-1"><AtSign className="w-3.5 h-3.5" /> Connect an Instagram account on the Instagram page first.</p>
        )
      )}
    </div>
  );
}
