import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { CheckoutPlanName } from '../api/billing';
import BottomSheet from './BottomSheet';
import PricingPlans from './PricingPlans';

type PricingModalProps = {
  open: boolean;
  onClose: () => void;
  onRequireAuth?: () => void;
  autoStartPlan?: CheckoutPlanName | null;
};

export default function PricingModal({
  open,
  onClose,
  onRequireAuth,
  autoStartPlan = null,
}: PricingModalProps) {
  const { t } = useTranslation();

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledBy="pricing-modal-title"
      closeLabel={t('pricing.close')}
      maxWidthClass="max-w-lg"
    >
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-1 -top-1 z-20 flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          aria-label={t('pricing.close')}
        >
          <X className="h-4 w-4" />
        </button>
        <h2 id="pricing-modal-title" className="mb-2 pr-10 font-display text-xl font-bold tracking-tight text-zinc-900">
          {t('pricing.title')}
        </h2>
        <p className="mb-5 text-sm leading-relaxed text-zinc-500">
          {t('pricing.topUpDescription')}
        </p>
        <PricingPlans
          id="pricing-modal"
          showIntro={false}
          onRequireAuth={onRequireAuth}
          autoStartPlan={open ? autoStartPlan : null}
        />
      </div>
    </BottomSheet>
  );
}
