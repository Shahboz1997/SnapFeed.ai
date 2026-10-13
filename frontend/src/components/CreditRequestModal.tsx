import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import BottomSheet from './BottomSheet';
import CreditRequestForm from './CreditRequestForm';

type CreditRequestModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function CreditRequestModal({ open, onClose }: CreditRequestModalProps) {
  const { t } = useTranslation();

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledBy="credit-request-title"
      closeLabel={t('creditRequest.close')}
      variant="dialog"
    >
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-1 -top-1 z-20 flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          aria-label={t('creditRequest.close')}
        >
          <X className="h-4 w-4" />
        </button>
        <h2 id="credit-request-title" className="mb-2 pr-10 font-display text-xl font-bold tracking-tight text-zinc-900">
          {t('creditRequest.title')}
        </h2>
        <p className="mb-5 text-sm leading-relaxed text-zinc-500">
          {t('creditRequest.description')}
        </p>
        <CreditRequestForm id="credit-request-modal" />
      </div>
    </BottomSheet>
  );
}
