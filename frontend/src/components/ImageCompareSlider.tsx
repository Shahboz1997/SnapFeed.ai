import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

interface ImageCompareSliderProps {
  beforeSrc: string;
  afterSrc: string;
  afterAlt: string;
  beforeAlt: string;
  aspectClass: string;
  className?: string;
}

const TOUCH_INTENT_THRESHOLD = 10;

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
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isSliderDragRef = useRef(false);
  const [isActive, setIsActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(100);

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(4, Math.min(96, (x / rect.width) * 100));
    setPosition(pct);
  }, []);

  const activateAt = useCallback(
    (clientX: number) => {
      isActiveRef.current = true;
      setIsActive(true);
      updatePosition(clientX);
    },
    [updatePosition],
  );

  const deactivate = useCallback(() => {
    isActiveRef.current = false;
    isSliderDragRef.current = false;
    touchStartRef.current = null;
    setIsDragging(false);
    setIsActive(false);
    setPosition(100);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch) return;
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      isSliderDragRef.current = false;
    }

    function handleTouchMove(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch) return;

      if (!isSliderDragRef.current && !isActiveRef.current && touchStartRef.current) {
        const dx = Math.abs(touch.clientX - touchStartRef.current.x);
        const dy = Math.abs(touch.clientY - touchStartRef.current.y);

        if (dy > dx && dy > TOUCH_INTENT_THRESHOLD) {
          touchStartRef.current = null;
          return;
        }

        if (dx > TOUCH_INTENT_THRESHOLD && dx >= dy) {
          isSliderDragRef.current = true;
          setIsDragging(true);
          activateAt(touch.clientX);
        } else {
          return;
        }
      }

      if (!isActiveRef.current) return;

      e.preventDefault();
      e.stopPropagation();
      updatePosition(touch.clientX);
    }

    function handleTouchEnd(e: TouchEvent) {
      if (isActiveRef.current) {
        e.stopPropagation();
      }
      deactivate();
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    el.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [activateAt, deactivate, updatePosition]);

  function handleMouseDown(e: MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    activateAt(e.clientX);
  }

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (!isActiveRef.current) return;
    updatePosition(e.clientX);
  }

  function handleMouseUp(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    deactivate();
  }

  function handleMouseEnter(e: MouseEvent<HTMLDivElement>) {
    activateAt(e.clientX);
  }

  function handleMouseLeave() {
    if (isActiveRef.current) {
      deactivate();
    }
  }

  const beforeClip = isActive ? `inset(0 ${100 - position}% 0 0)` : 'inset(0 100% 0 0)';

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
      onClick={(e) => e.stopPropagation()}
      style={{ touchAction: isDragging ? 'none' : 'pan-y' }}
      className={`relative w-full select-none ${aspectClass} ${className}`}
      aria-label={t('preview.compareAria')}
    >
      <img
        src={afterSrc}
        alt={afterAlt}
        className="absolute inset-0 h-full w-full bg-slate-100 object-contain"
        draggable={false}
      />

      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          clipPath: beforeClip,
          transition: isActive ? 'none' : 'clip-path 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <img
          src={beforeSrc}
          alt={beforeAlt}
          className="h-full w-full bg-slate-100 object-contain brightness-[0.88] saturate-[0.75] contrast-[0.95]"
          draggable={false}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-y-0 z-10 w-1 -translate-x-1/2 bg-white shadow-[0_0_14px_rgba(0,0,0,0.4)] transition-opacity duration-300 md:w-0.5"
        style={{
          left: `${position}%`,
          opacity: isActive ? 1 : 0,
        }}
        aria-hidden="true"
      >
        <div className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-white bg-white/95 shadow-lg backdrop-blur-sm md:h-9 md:w-9 md:border-2">
          <svg className="h-5 w-5 text-slate-600 md:h-3.5 md:w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
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
          <span className="lg:hidden">{t('preview.touchToCompare')}</span>
          <span className="hidden lg:inline">{t('preview.hoverToCompare')}</span>
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
