import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Check } from 'lucide-react';
import { WEEK_DAYS } from './types';

interface MoveDayMenuProps {
  currentDay: number;
  onMove: (day: number) => void;
  onOpenChange: (open: boolean) => void;
}

export function MoveDayMenu({ currentDay, onMove, onOpenChange }: MoveDayMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    onOpenChangeRef.current(open);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`p-1 rounded transition-colors ${open ? 'text-[#0A66C2]' : 'text-gray-400 hover:text-[#0A66C2]'}`}
        aria-label="Move to another day"
        aria-expanded={open}
      >
        <ArrowRightLeft className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-40 py-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl animate-fade-in-up">
          <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Move to</p>
          {WEEK_DAYS.map((d) => {
            const isCurrent = d.value === currentDay;
            return (
              <button
                key={d.value}
                disabled={isCurrent}
                onClick={() => {
                  setOpen(false);
                  onMove(d.value);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                  isCurrent ? 'text-gray-400 cursor-default' : 'text-gray-800 dark:text-gray-100 hover:bg-[#0A66C2]/10 hover:text-[#0A66C2]'
                }`}
              >
                {d.long}
                {isCurrent && <Check className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
