import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import ImageCompareSlider from './ImageCompareSlider';
import {
  LANDING_PROOF_EXAMPLES,
  type LandingProofTabId,
} from '../constants/landingProof';

export default function LandingProofSection() {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<LandingProofTabId>('tryon');
  const active = LANDING_PROOF_EXAMPLES.find((item) => item.id === activeId) ?? LANDING_PROOF_EXAMPLES[0];

  return (
    <section className="mt-8 sm:mt-10" aria-labelledby="home-proof-title">
      <div
        className="flex flex-wrap items-center justify-center gap-2"
        role="tablist"
        aria-label={t('home.proof.tabsLabel')}
      >
        {LANDING_PROOF_EXAMPLES.map((item) => {
          const selected = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveId(item.id)}
              className={`relative rounded-xl px-3.5 py-2 text-sm font-medium transition sm:px-4 ${
                selected
                  ? 'text-zinc-900'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              {selected ? (
                <motion.span
                  layoutId="home-proof-tab"
                  className="absolute inset-0 rounded-xl bg-white shadow-sm shadow-zinc-200/80 ring-1 ring-zinc-200/80"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              ) : null}
              <span className="relative z-10">{t(`home.proof.tabs.${item.id}`)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 sm:mt-5">
        <h3 id="home-proof-title" className="sr-only">
          {t('home.proof.title')}
        </h3>
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28 }}
            className="overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/70 sm:rounded-3xl"
          >
            <ImageCompareSlider
              beforeSrc={active.before}
              afterSrc={active.after}
              beforeAlt={t('home.proof.beforeAlt')}
              afterAlt={t('home.proof.afterAlt')}
              aspectClass="aspect-[4/5] md:aspect-[5/4]"
              objectFit="cover"
              objectPosition={active.objectPosition}
              className="w-full rounded-none"
            />
          </motion.div>
        </AnimatePresence>

        <div className="mx-auto mt-4 max-w-xl text-center sm:mt-5">
          <h4 className="font-display text-base tracking-tight text-zinc-900 sm:text-lg">
            {t(`home.proof.${active.id}.title`)}
          </h4>
          <p className="mt-1 text-sm leading-relaxed text-zinc-500">
            {t(`home.proof.${active.id}.desc`)}
          </p>
        </div>
      </div>
    </section>
  );
}
