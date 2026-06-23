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
      className={`relative flex flex-1 flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-3 sm:px-4 sm:py-5 ${
        selected
          ? 'border-slate-900 bg-slate-900 text-white shadow-md'
          : 'border-slate-200/80 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
      }`}
    >
      {recommended && !selected && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
          {recommendedLabel}
        </span>
      )}

      <span
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
          selected ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-400'
        }`}
      >
        {icon}
      </span>
      <span className="block text-xs font-semibold sm:text-sm">{label}</span>
      {hint && (
        <span className={`block text-xs font-normal ${selected ? 'text-slate-300' : 'text-slate-400'}`}>
          {hint}
        </span>
      )}
    </button>
  );
}
