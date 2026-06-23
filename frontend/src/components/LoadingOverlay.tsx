import { useTranslation } from 'react-i18next';
import Spinner from './Spinner';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export default function LoadingOverlay({ visible, message }: LoadingOverlayProps) {
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <div
      className="overlay-fade-in fixed inset-0 z-50 flex min-h-[100dvh] items-center justify-center bg-white/70 p-4 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200/80 bg-white px-6 py-6 shadow-[0_8px_30px_rgb(0,0,0,0.08)] sm:gap-5 sm:px-10 sm:py-8">
        <Spinner className="h-10 w-10 text-slate-900" />
        <p className="text-sm font-medium text-slate-900">{message ?? t('loading.overlay')}</p>
        <p className="text-sm font-normal text-slate-500">{t('loading.hint')}</p>
      </div>
    </div>
  );
}
