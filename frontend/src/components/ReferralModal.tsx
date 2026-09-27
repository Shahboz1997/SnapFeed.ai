import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchReferralSummary, type ReferralSummary } from '../api/referral';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import BottomSheet from './BottomSheet';
import ReferralInviteCard from './ReferralInviteCard';
import Spinner from './Spinner';

type ReferralModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function ReferralModal({ open, onClose }: ReferralModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [referral, setReferral] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    setLoading(true);
    void fetchReferralSummary()
      .then((summary) => {
        if (!cancelled) setReferral(summary);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  async function copyReferralLink() {
    if (!referral?.code) return;
    const link = `${window.location.origin}/login?ref=${encodeURIComponent(referral.code)}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast(t('referral.linkCopied'), 'success');
    } catch {
      showToast(t('pricing.copyFailed'), 'error');
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledBy="referral-invite-title"
      closeLabel={t('pricing.close')}
      maxWidthClass="max-w-md"
    >
      {loading ? (
        <div className="flex min-h-[12rem] items-center justify-center py-8">
          <Spinner />
        </div>
      ) : referral ? (
        <ReferralInviteCard referral={referral} onCopy={() => void copyReferralLink()} variant="plain" />
      ) : (
        <div className="py-6 text-center">
          <p className="text-sm text-zinc-500">{t('referral.notReady')}</p>
        </div>
      )}
    </BottomSheet>
  );
}
