import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Shirt,
  Scissors,
  CalendarCheck,
  CheckCircle2,
  ShieldCheck,
  Clock,
  ChevronDown,
  ChevronUp,
  Key,
  Award,
  ArrowRight,
  Droplets,
} from 'lucide-react';
import WhatsAppButton from '@/shared/ui/WhatsAppButton';
import Overlay from '@/shared/ui/Overlay';
import api from '@/shared/api/client';
import Header from '@/features/home/components/Header';
import { useTranslation } from '@/shared/i18n/I18nContext';

export default function HomePage() {
  const { t } = useTranslation();
  const [banner, setBanner] = useState(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    async function fetchBanner() {
      try {
        const res = await api.get('/catalog/banner');
        setBanner(res.data);
      } catch {
        // Ignorar si falla
      }
    }
    fetchBanner();
  }, []);

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const CATEGORIES = [
    {
      key: 'cleaning',
      label: t('services.cleaningTitle'),
      icon: Sparkles,
      badge: t('services.badgeCleaning'),
      description: t('services.cleaningDesc'),
      link: '/customer/booking?service=CLEANING',
    },
    {
      key: 'laundry',
      label: t('services.laundryTitle'),
      icon: Shirt,
      badge: t('services.badgeLaundry'),
      description: t('services.laundryDesc'),
      link: '/customer/booking?service=LAUNDRY',
    },
    {
      key: 'repair',
      label: t('services.repairTitle'),
      icon: Scissors,
      badge: t('services.badgeRepair'),
      description: t('services.repairDesc'),
      link: '/customer/booking?service=ALTERATION',
    },
  ];

  const FAQS = [
    {
      question: t('faqs.q1'),
      answer: t('faqs.a1'),
    },
    {
      question: t('faqs.q2'),
      answer: t('faqs.a2'),
    },
    {
      question: t('faqs.q3'),
      answer: t('faqs.a3'),
    },
    {
      question: t('faqs.q4'),
      answer: t('faqs.a4'),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 antialiased">
      {/* Banner promocional emergente */}
      <Overlay
        isOpen={showOverlay && banner?.enabled !== false}
        imageUrl={banner?.imageUrl}
        message={banner?.message}
        onClose={() => setShowOverlay(false)}
      />

      {/* Header flotante */}
      <Header />

      {/* =========================================================================
         1. HERO SECTION (#hero) — FULL BLEED RESPONSIVE HERO WITH CTA COLORS
         ========================================================================= */}
      <section id="hero" className="relative min-h-[90vh] lg:min-h-screen w-full flex flex-col justify-between overflow-hidden bg-slate-950 px-4 sm:px-6 md:px-8 pt-32 sm:pt-36 pb-12 sm:pb-16 text-white">
        {/* Imagen de fondo Full Bleed con Overlay Gradiente cinematográfico */}
        <div className="absolute inset-0 z-0">
          <img
            src="/hero_background.png"
            alt="Otterly Clean Interior"
            className="h-full w-full object-cover object-center scale-105 transition-transform duration-1000"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/60 to-slate-950/40" />
        </div>

        {/* Contenido Principal + Métricas en Layout Responsive */}
        <div className="relative z-10 mx-auto max-w-6xl w-full my-auto flex flex-col lg:flex-row lg:items-end lg:justify-between gap-10 text-left pt-4">
          {/* Bloque Izquierdo: Título, Subtítulo y Botones CTA */}
          <div className="max-w-3xl space-y-5 sm:space-y-6">
            {/* Titular principal en sentence case con Serif itálica */}
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-7xl leading-tight sm:leading-[1.08]">
              {t('hero.titlePart1')}
              <span className="font-serif italic font-normal text-slate-100">{t('hero.titleHighlight')}</span>
              {t('hero.titlePart2')}
            </h1>

            {/* Subtítulo */}
            <p className="max-w-xl text-sm sm:text-base md:text-lg leading-relaxed text-slate-200 font-normal">
              {t('hero.subtitle')}
            </p>

            {/* Botones de acción con Colores CTA Terracota */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
              <Link
                to="/customer/booking"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-accent-600 px-8 py-3.5 sm:py-4 text-sm font-semibold text-white shadow-xl transition-all hover:bg-accent-500 hover:shadow-2xl active:scale-95"
              >
                <CalendarCheck className="h-4.5 w-4.5 text-white" />
                {t('hero.ctaPrimary')}
              </Link>
              <WhatsAppButton
                label={t('hero.ctaWhatsApp')}
                message="Hola, me gustaría solicitar información sobre los servicios de Otterly Clean."
                className="!rounded-full !px-7 !py-3.5 !bg-white/10 hover:!bg-white/20 !border !border-white/20 !backdrop-blur-md !text-white !justify-center"
              />
            </div>
          </div>

          {/* Bloque Derecho: Garantías / Métricas en una sola línea por ítem */}
          <div className="flex flex-wrap items-center gap-4 sm:gap-8 lg:gap-10 border-t border-white/15 pt-6 lg:border-t-0 lg:pt-0 shrink-0">
            {/* Métrica 1 */}
            <div className="whitespace-nowrap text-left">
              <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">100% verificado</h3>
              <p className="text-xs text-slate-300 font-normal mt-0.5">{t('hero.badgeVerified')}</p>
            </div>

            <div className="hidden sm:block h-8 w-px shrink-0 bg-white/30 self-center" />

            {/* Métrica 2 */}
            <div className="whitespace-nowrap text-left">
              <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">Tiempo real</h3>
              <p className="text-xs text-slate-300 font-normal mt-0.5">{t('hero.badgeTracking')}</p>
            </div>

            <div className="hidden sm:block h-8 w-px shrink-0 bg-white/30 self-center" />

            {/* Métrica 3 */}
            <div className="whitespace-nowrap text-left">
              <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">Garantía 100%</h3>
              <p className="text-xs text-slate-300 font-normal mt-0.5">{t('hero.badgeGuarantee')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
         2. ¿CÓMO FUNCIONA? (#how-it-works)
         ========================================================================= */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <span className="text-xs font-semibold text-forest-700 uppercase tracking-wider">{t('howItWorks.step')}</span>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            {t('howItWorks.title')}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-500">
            {t('howItWorks.subtitle')}
          </p>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {/* Paso 1 */}
          <div className="relative flex flex-col items-center rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200/80 transition-all hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-forest-50 font-bold text-forest-700 text-sm">
              01
            </div>
            <h3 className="mt-6 text-lg font-bold text-slate-900">{t('howItWorks.step1Title')}</h3>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              {t('howItWorks.step1Desc')}
            </p>
          </div>

          {/* Paso 2 */}
          <div className="relative flex flex-col items-center rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200/80 transition-all hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-forest-50 font-bold text-forest-700 text-sm">
              02
            </div>
            <h3 className="mt-6 text-lg font-bold text-slate-900">{t('howItWorks.step2Title')}</h3>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              {t('howItWorks.step2Desc')}
            </p>
          </div>

          {/* Paso 3 */}
          <div className="relative flex flex-col items-center rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200/80 transition-all hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-forest-50 font-bold text-forest-700 text-sm">
              03
            </div>
            <h3 className="mt-6 text-lg font-bold text-slate-900">{t('howItWorks.step3Title')}</h3>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              {t('howItWorks.step3Desc')}
            </p>
          </div>
        </div>
      </section >

      {/* =========================================================================
         3. NUESTROS SERVICIOS (#services)
         ========================================================================= */}
      < section id="services" className="bg-white px-6 py-20 border-y border-slate-100" >
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <span className="text-xs font-semibold text-forest-700 uppercase tracking-wider">{t('services.tag')}</span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              {t('services.title')}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-500">
              {t('services.subtitle')}
            </p>
          </div>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <div
                  key={cat.key}
                  className="flex flex-col justify-between rounded-2xl bg-slate-50 p-8 shadow-sm ring-1 ring-slate-200/80 transition-all hover:bg-white hover:shadow-lg hover:ring-forest-500/30"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="rounded-full bg-slate-200/70 px-3 py-1 text-[11px] font-medium text-slate-700">
                        {cat.badge}
                      </span>
                    </div>
                    <h3 className="mt-6 text-xl font-bold text-slate-900">{cat.label}</h3>
                    <p className="mt-3 text-xs leading-relaxed text-slate-600">{cat.description}</p>
                  </div>
                  <div className="mt-8 border-t border-slate-200/60 pt-4">
                    <Link
                      to={cat.link}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-forest-700 hover:text-forest-900"
                    >
                      <span>{t('services.bookAction')}{cat.label.toLowerCase()}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section >

      {/* =========================================================================
         4. ¿QUIÉNES SOMOS? / GARANTÍAS (#about)
         ========================================================================= */}
      < section id="about" className="bg-forest-900 px-6 py-24 text-white" >
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="text-xs font-semibold text-forest-200 uppercase tracking-wider">{t('about.tag')}</span>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {t('about.title')}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-300">
                {t('about.desc1')}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                {t('about.desc2')}
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  to="/customer/booking"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-accent-600 px-6 py-3 text-xs font-semibold text-white shadow-md hover:bg-accent-700 transition-all"
                >
                  {t('about.ctaTry')}
                </Link>
              </div>
            </div>

            {/* Tarjetas de garantía */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <ShieldCheck className="h-8 w-8 text-emerald-400" />
                <h3 className="mt-4 text-base font-bold text-white">{t('about.card1Title')}</h3>
                <p className="mt-2 text-xs text-slate-300">
                  {t('about.card1Desc')}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <Key className="h-8 w-8 text-emerald-400" />
                <h3 className="mt-4 text-base font-bold text-white">{t('about.card2Title')}</h3>
                <p className="mt-2 text-xs text-slate-300">
                  {t('about.card2Desc')}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <Clock className="h-8 w-8 text-emerald-400" />
                <h3 className="mt-4 text-base font-bold text-white">{t('about.card3Title')}</h3>
                <p className="mt-2 text-xs text-slate-300">
                  {t('about.card3Desc')}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <Award className="h-8 w-8 text-emerald-400" />
                <h3 className="mt-4 text-base font-bold text-white">{t('about.card4Title')}</h3>
                <p className="mt-2 text-xs text-slate-300">
                  {t('about.card4Desc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section >

      {/* =========================================================================
         5. PREGUNTAS FRECUENTES (#faqs)
         ========================================================================= */}
      < section id="faqs" className="bg-slate-50 border-t border-slate-200/60 px-6 py-20" >
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <span className="text-xs font-semibold text-forest-700 uppercase tracking-wider">{t('faqs.tag')}</span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              {t('faqs.title')}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {t('faqs.subtitle')}
            </p>
          </div>

          <div className="mt-12 space-y-4">
            {FAQS.map((faq, idx) => (
              <div
                key={idx}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="flex w-full items-center justify-between p-6 text-left font-bold text-slate-900 text-sm hover:text-forest-700"
                >
                  <span>{faq.question}</span>
                  {openFaq === idx ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-forest-700" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                </button>

                {openFaq === idx && (
                  <div className="border-t border-slate-100 px-6 pb-6 pt-2 text-xs leading-relaxed text-slate-600">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section >

      {/* =========================================================================
         6. FOOTER
         ========================================================================= */}
      < footer className="border-t border-slate-200 bg-white px-6 py-12" >
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest-700 text-white">
              <Droplets className="h-4 w-4" />
            </span>
            <span className="text-base font-bold text-slate-900">
              Otterly <span className="text-forest-700">Clean</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-slate-600">
            <a href="#home" className="hover:text-forest-700">{t('header.howItWorks') && 'Inicio'}</a>
            <a href="#services" className="hover:text-forest-700">{t('header.services')}</a>
            <a href="#how-it-works" className="hover:text-forest-700">{t('header.howItWorks')}</a>
            <a href="#about" className="hover:text-forest-700">{t('header.about')}</a>
            <a href="#faqs" className="hover:text-forest-700">{t('header.faqs')}</a>
          </div>

          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} Otterly Clean. {t('footer.rights')}
          </p>
        </div>
      </footer >
    </div >
  );
}