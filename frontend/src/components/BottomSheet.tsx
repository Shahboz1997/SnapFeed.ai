import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  /** `sheet` = mobile bottom sheet; `dialog` = small centered modal. */
  variant?: 'sheet' | 'dialog';
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
  variant = 'sheet',
}: BottomSheetProps) {
  const isPhone = useIsPhone();
  const isDialog = variant === 'dialog';
  const sheetOnPhone = !isDialog && isPhone;

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (!sheetOnPhone) return;
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) {
      onClose();
    }
  }

  const sheet = (
    <AnimatePresence>
      {open ? (
        <div
          className={
            isDialog
              ? 'fixed inset-0 z-[100] flex items-center justify-center p-4'
              : 'fixed inset-0 z-[100] flex items-end justify-center pb-[calc(var(--tab-bar-height)+0.5rem+env(safe-area-inset-bottom,0px))] sm:items-center sm:p-4 sm:pb-4 lg:pb-4'
          }
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
            className="absolute inset-0 bg-zinc-950/45"
            aria-label={closeLabel}
            onClick={onClose}
          />

          <motion.div
            initial={
              sheetOnPhone
                ? { opacity: 0, y: '100%' }
                : { opacity: 0, y: 16, scale: 0.96 }
            }
            animate={
              sheetOnPhone
                ? { opacity: 1, y: 0 }
                : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              sheetOnPhone
                ? { opacity: 0, y: '100%' }
                : { opacity: 0, y: 12, scale: 0.96 }
            }
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            drag={sheetOnPhone ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.55 }}
            onDragEnd={handleDragEnd}
            className={
              isDialog
                ? `luxury-shadow relative z-10 flex h-auto max-h-[min(80dvh,28rem)] w-full ${maxWidthClass} flex-col overflow-hidden rounded-3xl border border-zinc-200/70 bg-white ${panelClassName}`
                : `glass-panel luxury-shadow relative z-10 mx-2 mb-1 flex h-auto max-h-[min(78dvh,100%)] w-full ${maxWidthClass} flex-col overflow-hidden rounded-[1.75rem] border-zinc-200/70 bg-white/95 sm:mx-0 sm:mb-0 sm:max-h-[min(92dvh,40rem)] sm:rounded-3xl ${panelClassName}`
            }
            style={
              isDialog
                ? undefined
                : { paddingBottom: 'max(0.75rem, 0.5rem)' }
            }
          >
            {sheetOnPhone ? (
              <div className="flex shrink-0 justify-center pb-1 pt-2.5 sm:hidden" aria-hidden="true">
                <span className="h-1 w-10 rounded-full bg-zinc-300/90" />
              </div>
            ) : null}

            <div
              className={
                isDialog
                  ? 'min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6'
                  : 'min-h-0 overflow-y-auto overscroll-contain px-5 pb-4 pt-1 sm:px-8 sm:pb-6 sm:pt-6'
              }
            >
              {children}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return sheet;
  return createPortal(sheet, document.body);
}
