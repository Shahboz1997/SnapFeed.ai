import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface LightboxProps {
  imageUrl: string;
  alt: string;
  onClose: () => void;
}

export default function Lightbox({ imageUrl, alt, onClose }: LightboxProps) {
  const { t } = useTranslation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="overlay-fade-in fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('lightbox.dialogAria')}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label={t('lightbox.closeOverlayAria')}
      />

      <div className="relative z-10 flex max-h-[90vh] max-w-[90vw] flex-col items-end gap-3">
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label={t('lightbox.closeAria')}
          className="rounded-full border border-white/20 bg-white/90 p-2 text-slate-700 shadow-lg backdrop-blur-sm transition-all duration-300 hover:bg-white hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-white/50"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <img
          src={imageUrl}
          alt={alt}
          className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl ring-1 ring-white/20"
        />
      </div>
    </div>
  );
}
