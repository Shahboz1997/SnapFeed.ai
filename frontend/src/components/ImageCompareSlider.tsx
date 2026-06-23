import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ImageCompareSliderProps {
  beforeSrc: string;
  afterSrc: string;
  afterAlt: string;
  beforeAlt: string;
  aspectClass: string;
  className?: string;
}

export default function ImageCompareSlider({
  beforeSrc,
  afterSrc,
  afterAlt,
  beforeAlt,
  aspectClass,
  className = '',
}: ImageCompareSliderProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const isActiveRef = useRef(false);
  const [isActive, setIsActive] = useState(false);
  const [position, setPosition] = useState(100);

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(4, Math.min(96, (x / rect.width) * 100));
    setPosition(pct);
  }, []);

  function handlePointerEnter(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    isActiveRef.current = true;
    setIsActive(true);
    updatePosition(e.clientX);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isActiveRef.current) return;
    updatePosition(e.clientX);
  }

  function handlePointerLeave(e: React.PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    isActiveRef.current = false;
    setIsActive(false);
    setPosition(100);
  }

  const afterClip = isActive ? `inset(0 ${100 - position}% 0 0)` : 'inset(0 0 0 0)';

  return (
    <div
      ref={containerRef}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      className={`relative select-none touch-none ${aspectClass} w-full ${className}`}
      aria-label={t('preview.compareAria')}
    >
      <img
        src={beforeSrc}
        alt={beforeAlt}
        className="absolute inset-0 h-full w-full object-cover brightness-[0.88] saturate-[0.75] contrast-[0.95]"
        draggable={false}
      />

      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          clipPath: afterClip,
          transition: isActive ? 'none' : 'clip-path 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <img
          src={afterSrc}
          alt={afterAlt}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_12px_rgba(0,0,0,0.35)] transition-opacity duration-300"
        style={{
          left: `${position}%`,
          opacity: isActive ? 1 : 0,
        }}
        aria-hidden="true"
      >
        <div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-white/90 shadow-md backdrop-blur-sm">
          <svg className="h-3.5 w-3.5 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
          </svg>
        </div>
      </div>

      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center bg-gradient-to-t from-slate-900/40 to-transparent px-3 pb-3 pt-8 transition-opacity duration-300 ${
          isActive ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <span className="rounded-full border border-white/25 bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm">
          {t('preview.hoverToCompare')}
        </span>
      </div>

      <div
        className={`pointer-events-none absolute inset-x-0 top-0 flex justify-between px-2.5 pt-2.5 transition-opacity duration-200 ${
          isActive ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="rounded-md bg-black/45 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
          {t('preview.beforeLabel')}
        </span>
        <span className="rounded-md bg-black/45 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
          {t('preview.afterLabel')}
        </span>
      </div>
    </div>
  );
}
