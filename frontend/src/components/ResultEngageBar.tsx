import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Columns2, Download, Layers, Share2, Sparkles } from 'lucide-react';

type Props = {
  disabled?: boolean;
  compareActive?: boolean;
  onToggleCompare?: () => void;
  onShare: () => Promise<void> | void;
  onDownload: () => Promise<void> | void;
  onMoreVariants: () => void;
  onHdUpsell: () => void;
  canCompare?: boolean;
};

export default function ResultEngageBar({
  disabled = false,
  compareActive = false,
  onToggleCompare,
  onShare,
  onDownload,
  onMoreVariants,
  onHdUpsell,
  canCompare = false,
}: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'share' | 'download' | null>(null);

  async function run(kind: 'share' | 'download', fn: () => Promise<void> | void) {
    if (busy || disabled) return;
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="absolute inset-x-2 bottom-2 z-20 sm:inset-x-3 sm:bottom-3">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5 sm:flex-wrap sm:overflow-visible">
        {canCompare && onToggleCompare ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onToggleCompare}
            aria-pressed={compareActive}
            className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold backdrop-blur-md transition disabled:opacity-50 sm:h-auto sm:py-1.5 sm:text-[11px] ${
              compareActive
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-200/80 bg-white/90 text-zinc-700 hover:bg-white'
            }`}
          >
            <Columns2 className="h-3.5 w-3.5" />
            {t('studio.compare')}
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled || Boolean(busy)}
          onClick={() => void run('share', onShare)}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/90 px-3 text-xs font-semibold text-zinc-700 backdrop-blur-md transition hover:bg-white disabled:opacity-50 sm:h-auto sm:py-1.5 sm:text-[11px]"
        >
          <Share2 className="h-3.5 w-3.5" />
          {busy === 'share' ? '…' : t('studio.share')}
        </button>
        <button
          type="button"
          disabled={disabled || Boolean(busy)}
          onClick={() => void run('download', onDownload)}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/90 px-3 text-xs font-semibold text-zinc-700 backdrop-blur-md transition hover:bg-white disabled:opacity-50 sm:h-auto sm:py-1.5 sm:text-[11px]"
        >
          <Download className="h-3.5 w-3.5" />
          {busy === 'download' ? '…' : t('preview.download')}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onMoreVariants}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/90 px-3 text-xs font-semibold text-zinc-800 backdrop-blur-md transition hover:bg-white disabled:opacity-50 sm:h-auto sm:py-1.5 sm:text-[11px]"
        >
          <Layers className="h-3.5 w-3.5" />
          {t('studio.moreVariants')}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onHdUpsell}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50 sm:h-auto sm:py-1.5 sm:text-[11px]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {t('studio.hdUpsell')}
        </button>
      </div>
    </div>
  );
}
