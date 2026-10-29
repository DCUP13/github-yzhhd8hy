import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import { DAY_BAR_HEIGHT, type TouchDragState } from '../linkedin/useTouchDrag';
import { WEEK_DAYS } from '../linkedin/types';

interface TouchDragOverlayProps {
  drag: TouchDragState;
  currentDay: number;
  time: string;
  label: string;
}

export function TouchDragOverlay({ drag, currentDay, time, label }: TouchDragOverlayProps) {
  return createPortal(
    <>
      <div
        className="fixed z-[60] w-52 pointer-events-none rounded-xl border-l-4 border-pink-500 bg-white dark:bg-gray-900 p-2.5 shadow-2xl ring-1 ring-black/5 scale-105 rotate-2"
        style={{ left: drag.x - 104, top: drag.y - 36 }}
      >
        <div className="flex items-center gap-1 text-xs font-semibold text-gray-900 dark:text-white">
          <Clock className="w-3 h-3 text-gray-400" /> {time}
        </div>
        <p className="mt-0.5 text-xs text-gray-700 dark:text-gray-200 line-clamp-2">{label}</p>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur shadow-[0_-8px_24px_rgba(0,0,0,0.08)]"
        style={{ height: DAY_BAR_HEIGHT, paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <p className="pt-2 text-center text-[11px] font-medium text-gray-500 dark:text-gray-400">Drop on a day to move</p>
        <div className="grid grid-cols-7 gap-1.5 px-2 pt-1.5">
          {WEEK_DAYS.map((d) => {
            const isCurrent = d.value === currentDay;
            const isOver = drag.overDay === d.value && !isCurrent;
            return (
              <div
                key={d.value}
                data-drop-day={d.value}
                className={`flex flex-col items-center justify-center h-12 rounded-xl border text-sm font-semibold transition-all duration-150 ${
                  isOver
                    ? 'bg-pink-600 border-pink-600 text-white scale-110 shadow-lg'
                    : isCurrent
                      ? 'border-dashed border-gray-300 dark:border-gray-600 text-gray-400'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100'
                }`}
              >
                {d.short}
                {isCurrent && <span className="text-[9px] font-medium uppercase tracking-wide">here</span>}
              </div>
            );
          })}
        </div>
      </div>
    </>,
    document.body,
  );
}
