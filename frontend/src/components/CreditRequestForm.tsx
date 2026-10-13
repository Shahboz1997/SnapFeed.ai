import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/generateImage';
import { submitCreditRequest } from '../api/creditRequest';
import { useAuth } from '../context/AuthContext';
import Spinner from './Spinner';

type CreditRequestFormProps = {
  id?: string;
};

export default function CreditRequestForm({ id = 'credits' }: CreditRequestFormProps) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const [name, setName] = useState(profile?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [credits, setCredits] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();
    if (!trimmedName || !trimmedEmail || !trimmedMessage) {
      setError(t('creditRequest.required'));
      return;
    }

    const creditsNumber = credits.trim() ? Number(credits) : null;
    if (credits.trim() && (!Number.isFinite(creditsNumber) || (creditsNumber ?? 0) <= 0)) {
      setError(t('creditRequest.creditsInvalid'));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await submitCreditRequest({
        name: trimmedName,
        email: trimmedEmail,
        credits: creditsNumber,
        message: trimmedMessage,
      });
      if (result === 'mailto') {
        setError(t('creditRequest.emailUnavailable'));
        return;
      }
      setSent(true);
    } catch (err) {
      const key = err instanceof ApiError ? err.messageKey : undefined;
      setError(t(key || 'creditRequest.error'));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <p id={id} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        {t('creditRequest.success')}
      </p>
    );
  }

  const fieldClass = 'h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400';

  return (
    <form id={id} onSubmit={handleSubmit} className="space-y-3" noValidate>
      <div>
        <label htmlFor={`${id}-name`} className="mb-1.5 block text-xs font-medium text-zinc-600">
          {t('creditRequest.name')}
        </label>
        <input
          id={`${id}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          maxLength={120}
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor={`${id}-email`} className="mb-1.5 block text-xs font-medium text-zinc-600">
          {t('creditRequest.email')}
        </label>
        <input
          id={`${id}-email`}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          maxLength={200}
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor={`${id}-credits`} className="mb-1.5 block text-xs font-medium text-zinc-600">
          {t('creditRequest.credits')}
        </label>
        <input
          id={`${id}-credits`}
          inputMode="numeric"
          value={credits}
          onChange={(event) => setCredits(event.target.value.replace(/[^\d]/g, ''))}
          placeholder="10"
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor={`${id}-message`} className="mb-1.5 block text-xs font-medium text-zinc-600">
          {t('creditRequest.message')}
        </label>
        <textarea
          id={`${id}-message`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          maxLength={2000}
          className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400"
        />
      </div>
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? <Spinner className="h-4 w-4" /> : null}
        {submitting ? t('creditRequest.sending') : t('creditRequest.submit')}
      </button>
    </form>
  );
}
