export const DEFAULT_TEXT_SIZE = 64;
const MIN = 32;
const MAX = 110;

function sizeName(size: number): string {
  if (size < 50) return 'Small';
  if (size < 72) return 'Medium';
  if (size < 92) return 'Large';
  return 'Extra large';
}

interface TextSizeSliderProps {
  value: number;
  disabled?: boolean;
  sample?: string;
  onChange: (size: number) => void;
}

export function TextSizeSlider({ value, disabled, sample, onChange }: TextSizeSliderProps) {
  const pct = ((value - MIN) / (MAX - MIN)) * 100;
  // Sizes are relative to a 640px-wide photo, so cqw keeps the sample proportional to the real post.
  const unit = (px: number) => `${(px / 640) * 100}cqw`;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Text size</span>
        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{sizeName(value)} ({value})</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-bold text-gray-400">A</span>
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={2}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Text size"
          className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-pink-600 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: `linear-gradient(to right, #db2777 ${pct}%, #e5e7eb ${pct}%)` }}
        />
        <span className="text-lg font-bold leading-none text-gray-400">A</span>
        {value !== DEFAULT_TEXT_SIZE && !disabled && (
          <button type="button" onClick={() => onChange(DEFAULT_TEXT_SIZE)} className="text-xs font-medium text-pink-600 dark:text-pink-400 hover:underline">Reset</button>
        )}
      </div>
      {sample !== undefined && (
        <div className="mt-3 mx-auto w-40 sm:w-48 aspect-square rounded-lg overflow-hidden relative bg-gradient-to-br from-gray-300 to-gray-500 dark:from-gray-600 dark:to-gray-800" style={{ containerType: 'inline-size' }}>
          <div className="absolute inset-x-0 bottom-[8%] bg-black/45 text-white text-center font-bold" style={{ fontSize: unit(value), lineHeight: 1.3, padding: `${unit(40)} ${unit(48)}` }}>
            {sample || 'Your text here'}
          </div>
        </div>
      )}
    </div>
  );
}
