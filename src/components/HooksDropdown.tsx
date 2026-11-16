import { useState, useEffect, useRef } from 'react';
import { Anchor, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';

interface Hook {
  id: string;
  title: string;
  content: string;
}

interface HooksDropdownProps {
  onInsert: (token: string) => void;
  themeColor?: string;
}

export function HooksDropdown({ onInsert, themeColor = 'blue' }: HooksDropdownProps) {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('hooks')
      .select('id, title, content')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          toast.error('Could not load hooks');
          setLoading(false);
          return;
        }
        setHooks(data || []);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100',
    pink: 'bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 hover:bg-pink-100',
    sky: 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:bg-sky-100',
  };

  const chipClass = colorClasses[themeColor] || colorClasses.blue;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md transition-colors ${chipClass}`}
        title="Insert a hook"
      >
        <Anchor className="w-3 h-3" /> Hooks
        <ChevronDown className="w-2.5 h-2.5" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 min-w-64 max-w-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-4 text-center">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto" />
            </div>
          ) : hooks.length === 0 ? (
            <div className="px-3 py-3">
              <p className="text-xs text-gray-400">No hooks yet.</p>
              <a href="/app/hooks" className="text-xs text-blue-500 hover:underline">Create some on the Hooks page →</a>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { onInsert('{{hooks}}'); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700"
              >
                All hooks {'{{hooks}}'}
              </button>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-gray-400">Individual hooks</div>
              {hooks.map((hook) => (
                <button
                  key={hook.id}
                  type="button"
                  onClick={() => { onInsert(`{{hooks:${hook.title}}}`); setOpen(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <Anchor className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    <span className="text-xs font-medium text-gray-900 dark:text-white truncate">{hook.title}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 truncate ml-4.5">{hook.content}</p>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
