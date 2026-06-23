import type { ReactNode } from 'react';

interface VisualOptionCardProps {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  selected: boolean;
  disabled?: boolean;
  recommended?: boolean;
  recommendedLabel?: string;
  onSelect: () => void;
}

export default function VisualOptionCard({
  id,
  label,
  hint,
  icon,
  selected,
  disabled,
  recommended,
  recommendedLabel = 'Recommended',
  onSelect,
}: VisualOptionCardProps) {
  return (
    <button
      type="button"
      id={id}
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`relative flex min-w-0 w-full max-w-full flex-col items-center gap-1 overflow-hidden rounded-xl border px-2 py-2.5 text-center transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-3 sm:py-4 lg:gap-3 lg:px-4 lg:py-5 ${
        selected
          ? 'border-slate-900 bg-slate-900 text-white shadow-md'
          : 'border-slate-200/80 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
      }`}
    >
      {recommended && !selected && (
        <span className="absolute top-1 left-1/2 max-w-[calc(100%-0.5rem)] -translate-x-1/2 truncate rounded-full bg-slate-900 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white shadow-sm sm:text-[9px] lg:text-[10px]">
          {recommendedLabel}
        </span>
      )}

      <span
        className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:mt-0 sm:h-9 sm:w-9 lg:h-10 lg:w-10 ${
          selected ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-400'
        }`}
      >
        {icon}
      </span>
      <span className="block w-full min-w-0 break-words text-xs font-semibold leading-tight sm:text-sm">{label}</span>
      {hint && (
        <span className={`block w-full min-w-0 break-words text-[10px] font-normal sm:text-xs ${selected ? 'text-slate-300' : 'text-slate-400'}`}>
          {hint}
        </span>
      )}
    </button>
  );
}
