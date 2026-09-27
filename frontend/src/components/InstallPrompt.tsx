import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, Share, X } from 'lucide-react';
import { getCookieConsent } from '../constants/company';

const DISMISS_KEY = 'snapfeed_install_dismissed';
const DISMISS_DAYS = 14;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandaloneDisplay() {
  if (typeof window === 'undefined') return true;
  const media = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return media || iosStandalone;
}

function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && notChrome;
}

function wasDismissedRecently() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export default function InstallPrompt() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [visible, setVisible] = useState(false);
  const [cookiesReady, setCookiesReady] = useState(() => getCookieConsent() !== null);

  const onStudio = pathname === '/studio';
  const hasMobileTabBar =
    pathname === '/' ||
    pathname === '/studio' ||
    pathname === '/gallery' ||
    pathname === '/cabinet';

  useEffect(() => {
    if (getCookieConsent() !== null) {
      setCookiesReady(true);
      return;
    }
    const id = window.setInterval(() => {
      if (getCookieConsent() !== null) {
        setCookiesReady(true);
        window.clearInterval(id);
      }
    }, 400);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (isStandaloneDisplay() || wasDismissedRecently()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS never fires beforeinstallprompt — show Share → Add to Home Screen tip.
    if (isIosSafari()) {
      setIosHint(true);
      setVisible(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  async function handleInstall() {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
    setVisible(false);
    dismiss();
  }

  function handleClose() {
    setVisible(false);
    setDeferred(null);
    setIosHint(false);
    dismiss();
  }

  if (!visible || !cookiesReady || isStandaloneDisplay()) return null;
  if (!deferred && !iosHint) return null;

  const bottomClass = onStudio
    ? 'bottom-[calc(var(--tab-bar-height)+var(--studio-dock-height)+env(safe-area-inset-bottom,0px))] pb-3 sm:bottom-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom,0px))] lg:bottom-0 lg:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]'
    : hasMobileTabBar
      ? 'bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px)+var(--tab-bar-height))] lg:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]'
      : 'bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]';

  return (
    <div
      className={`fixed inset-x-0 z-[70] px-3 sm:px-4 ${bottomClass}`}
      role="dialog"
      aria-label={t('install.title')}
    >
      <div className="mx-auto flex max-w-3xl items-start gap-3 rounded-2xl border border-zinc-200 bg-white/95 p-4 shadow-lg shadow-zinc-900/5 backdrop-blur-md sm:items-center sm:gap-4 sm:p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white">
          <Download className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-zinc-900">{t('install.title')}</p>
          <p className="text-xs leading-relaxed text-zinc-500 sm:text-sm">
            {iosHint ? (
              <>
                {t('install.iosBody')}{' '}
                <Share className="inline h-3.5 w-3.5 align-[-2px] text-zinc-700" strokeWidth={2} aria-hidden />{' '}
                {t('install.iosBodyAfterShare')}
              </>
            ) : (
              t('install.body')
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {deferred ? (
            <button
              type="button"
              onClick={handleInstall}
              className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              {t('install.cta')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-800"
            aria-label={t('install.dismiss')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
