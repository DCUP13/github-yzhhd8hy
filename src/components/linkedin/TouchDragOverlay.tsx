import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import { formatTime } from './api';
import { DAY_BAR_HEIGHT, type TouchDragState } from './useTouchDrag';
import { CATEGORY_STYLES, WEEK_DAYS, type PlanSlot } from './types';

interface TouchDragOverlayProps {
  drag: TouchDragState;
  slot: PlanSlot;
  topicName?: string;
}

export function TouchDragOverlay({ drag, slot, topicName }: TouchDragOverlayProps) {
  return createPortal(
    <>
      <div
        className={`fixed z-[60] w-52 pointer-events-none rounded-xl border-l-4 ${CATEGORY_STYLES[slot.category].bar} bg-white dark:bg-gray-900 p-2.5 shadow-2xl ring-1 ring-black/5 scale-105 rotate-2`}
        style={{ left: drag.x - 104, top: drag.y - 36 }}
      >
        <div className="flex items-center gap-1 text-xs font-semibold text-gray-900 dark:text-white">
          <Clock className="w-3 h-3 text-gray-400" /> {formatTime(slot.post_time)}
        </div>
        <p className="mt-1 text-[11px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">{slot.category}</p>
        <p className="mt-0.5 text-xs text-gray-700 dark:text-gray-200 line-clamp-2">{topicName || 'No topic selected'}</p>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur shadow-[0_-8px_24px_rgba(0,0,0,0.08)] animate-fade-in-up"
        style={{ height: DAY_BAR_HEIGHT, paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <p className="pt-2 text-center text-[11px] font-medium text-gray-500 dark:text-gray-400">Drop on a day to move</p>
        <div className="grid grid-cols-7 gap-1.5 px-2 pt-1.5">
          {WEEK_DAYS.map((d) => {
            const isCurrent = d.value === slot.day_of_week;
            const isOver = drag.overDay === d.value && !isCurrent;
            return (
              <div
                key={d.value}
                data-drop-day={d.value}
                className={`flex flex-col items-center justify-center h-12 rounded-xl border text-sm font-semibold transition-all duration-150 ${
                  isOver
                    ? 'bg-[#0A66C2] border-[#0A66C2] text-white scale-110 shadow-lg'
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
