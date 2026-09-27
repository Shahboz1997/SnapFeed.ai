import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReferralSummary } from '../api/referral';

type ReferralInviteCardProps = {
  referral: ReferralSummary;
  onCopy: () => void;
  /** Compact surface for modal; card surface for cabinet. */
  variant?: 'card' | 'plain';
};

export default function ReferralInviteCard({
  referral,
  onCopy,
  variant = 'card',
}: ReferralInviteCardProps) {
  const { t } = useTranslation();

  const body = (
    <>
      <h2
        id="referral-invite-title"
        className="mb-2 text-sm font-semibold text-zinc-900 sm:text-base"
      >
        {t('referral.title')}
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-zinc-500">
        {t('referral.description', { count: referral.bonusCredits })}
      </p>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {t('referral.codeLabel')}
      </p>
      <p className="mb-3 font-mono text-lg font-semibold tracking-wider text-zinc-900">
        {referral.code}
      </p>
      <p className="mb-4 text-xs text-zinc-500">
        {t('referral.invited', { count: referral.invitedCount })}
      </p>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 sm:w-auto"
      >
        <Copy className="h-4 w-4" />
        {t('referral.copyLink')}
      </button>
    </>
  );

  if (variant === 'plain') {
    return <div>{body}</div>;
  }

  return (
    <div className="rounded-2xl border border-zinc-200/60 bg-zinc-50 p-5">{body}</div>
  );
}
