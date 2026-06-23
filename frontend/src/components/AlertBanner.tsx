import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export type AlertType = 'success' | 'error' | 'warning';

interface AlertBannerProps {
  message: string;
  type?: AlertType;
  onDismiss: () => void;
  autoDismissMs?: number;
}

const STYLES: Record<AlertType, { container: string; icon: string; text: string; button: string }> = {
  success: {
    container: 'border-emerald-200 bg-emerald-50',
    icon: 'text-emerald-600',
    text: 'text-emerald-800',
    button: 'text-emerald-600 hover:bg-emerald-100 hover:text-emerald-800',
  },
  error: {
    container: 'border-red-200 bg-red-50',
    icon: 'text-red-600',
    text: 'text-red-800',
    button: 'text-red-600 hover:bg-red-100 hover:text-red-800',
  },
  warning: {
    container: 'border-amber-200 bg-amber-50',
    icon: 'text-amber-600',
    text: 'text-amber-800',
    button: 'text-amber-600 hover:bg-amber-100 hover:text-amber-800',
  },
};

function AlertIcon({ type }: { type: AlertType }) {
  if (type === 'success') {
    return (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }

  if (type === 'warning') {
    return (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    );
  }

  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

export default function AlertBanner({
  message,
  type = 'error',
  onDismiss,
  autoDismissMs,
}: AlertBannerProps) {
  const { t } = useTranslation();
  const styles = STYLES[type];

  useEffect(() => {
    if (!autoDismissMs) return;

    const timer = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [autoDismissMs, onDismiss, message]);

  return (
    <div
      role="alert"
      className={`alert-slide-in mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 shadow-sm sm:mb-8 sm:px-5 sm:py-4 ${styles.container}`}
    >
      <span className={`mt-0.5 shrink-0 ${styles.icon}`}>
        <AlertIcon type={type} />
      </span>
      <p className={`flex-1 text-sm ${styles.text}`}>{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('alerts.dismissAria')}
        className={`shrink-0 rounded-lg p-1 transition ${styles.button}`}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
