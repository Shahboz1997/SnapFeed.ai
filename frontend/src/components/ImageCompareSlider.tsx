import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
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

  const rawPosition = useMotionValue(50);
  const position = useSpring(rawPosition, { stiffness: 320, damping: 34, mass: 0.45 });
  const [clipPct, setClipPct] = useState(50);

  useEffect(() => {
    const unsub = position.on('change', (v) => setClipPct(v));
    return unsub;
  }, [position]);

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(4, Math.min(96, (x / rect.width) * 100));
    rawPosition.set(pct);
  }, [rawPosition]);

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
    rawPosition.set(50);
  }, [rawPosition]);

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
      if (isActiveRef.current) e.stopPropagation();
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

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    activateAt(e.clientX);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isActiveRef.current || e.pointerType === 'touch') return;
    updatePosition(e.clientX);
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'touch') return;
    e.stopPropagation();
    deactivate();
  }

  function handleMouseEnter(e: ReactMouseEvent<HTMLDivElement>) {
    if (window.matchMedia('(pointer: fine)').matches) {
      activateAt(e.clientX);
    }
  }

  function handleMouseLeave() {
    if (isActiveRef.current && !isDragging) {
      deactivate();
    }
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => e.stopPropagation()}
      style={{ touchAction: isDragging ? 'none' : 'pan-y' }}
      className={`relative w-full select-none overflow-hidden rounded-2xl ${aspectClass} ${className}`}
      aria-label={t('preview.compareAria')}
    >
      <img
        src={afterSrc}
        alt={afterAlt}
        className="absolute inset-0 h-full w-full bg-zinc-900 object-contain"
        draggable={false}
      />

      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - clipPct}% 0 0)` }}
      >
        <img
          src={beforeSrc}
          alt={beforeAlt}
          className="h-full w-full bg-zinc-900 object-contain brightness-[0.88] saturate-[0.75] contrast-[0.95]"
          draggable={false}
        />
      </div>

      <motion.div
        className="pointer-events-none absolute inset-y-0 z-10 w-px -translate-x-1/2 bg-white"
        style={{ left: position, opacity: isActive ? 1 : 0 }}
        aria-hidden="true"
      >
        {/* Invisible fat hit target for thumbs */}
        <div className="absolute inset-y-0 left-1/2 w-12 -translate-x-1/2 md:w-8" />
        <div className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200/80 bg-white/85 shadow-lg shadow-zinc-300/50 backdrop-blur-xl md:h-9 md:w-9">
          <div className="flex items-center gap-0.5 text-zinc-500">
            <span className="block h-3.5 w-px rounded-full bg-zinc-400 md:h-3" />
            <span className="block h-3.5 w-px rounded-full bg-zinc-400 md:h-3" />
          </div>
        </div>
      </motion.div>

      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center bg-gradient-to-t from-white/70 to-transparent px-3 pb-3 pt-8 transition-opacity duration-300 ${
          isActive ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <span className="rounded-full border border-zinc-200/80 bg-white/90 px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm shadow-zinc-200/50 backdrop-blur-md">
          <span className="lg:hidden">{t('preview.touchToCompare')}</span>
          <span className="hidden lg:inline">{t('preview.hoverToCompare')}</span>
        </span>
      </div>

      <div
        className={`pointer-events-none absolute inset-x-0 top-0 flex justify-between px-2.5 pt-2.5 transition-opacity duration-200 ${
          isActive ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="rounded-md border border-zinc-200/70 bg-white/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-700 shadow-sm backdrop-blur-sm">
          {t('preview.beforeLabel')}
        </span>
        <span className="rounded-md border border-zinc-200/70 bg-white/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-700 shadow-sm backdrop-blur-sm">
          {t('preview.afterLabel')}
        </span>
      </div>
    </div>
  );
}
