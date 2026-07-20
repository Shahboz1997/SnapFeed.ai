import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  /** Wider sheet on desktop (e.g. pricing). */
  maxWidthClass?: string;
  /** Extra class for the panel surface. */
  panelClassName?: string;
  closeLabel?: string;
};

const DISMISS_OFFSET = 110;
const DISMISS_VELOCITY = 650;

function useIsPhone() {
  const [isPhone, setIsPhone] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = () => setIsPhone(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isPhone;
}

export default function BottomSheet({
  open,
  onClose,
  labelledBy,
  children,
  maxWidthClass = 'max-w-md',
  panelClassName = '',
  closeLabel = 'Close',
}: BottomSheetProps) {
  const isPhone = useIsPhone();

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (!isPhone) return;
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) {
      onClose();
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
        >
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-zinc-900/30 backdrop-blur-sm"
            aria-label={closeLabel}
            onClick={onClose}
          />

          <motion.div
            initial={isPhone ? { opacity: 0, y: '100%' } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={isPhone ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={isPhone ? { opacity: 0, y: '100%' } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            drag={isPhone ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.55 }}
            onDragEnd={handleDragEnd}
            className={`glass-panel luxury-shadow relative z-10 flex max-h-[90dvh] w-full ${maxWidthClass} flex-col overflow-hidden rounded-t-[1.75rem] border-zinc-200/70 bg-white/95 sm:max-h-[min(92dvh,40rem)] sm:rounded-3xl ${panelClassName}`}
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="flex shrink-0 justify-center pb-1 pt-3 sm:hidden" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-zinc-300/90" />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2 pt-1 sm:px-8 sm:pb-6 sm:pt-6">
              {children}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
