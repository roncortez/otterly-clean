import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck,
  ShieldCheck,
  Clock,
  ChevronDown,
  ChevronUp,
  Key,
  Award,
  ArrowRight,
  Phone,
  Mail,
  Send,
  MapPin,
} from 'lucide-react';
import WhatsAppButton from '@/shared/ui/WhatsAppButton';
import BrandMark from '@/shared/ui/BrandMark';
import Overlay from '@/shared/ui/Overlay';
import api from '@/shared/api/client';
import Header from '@/features/home/components/Header';
import { useTranslation } from '@/shared/i18n/I18nContext';
import { useConfig } from '@/shared/config/ConfigContext';
import { useServiceExperiences } from '@/shared/services';
import ServicePicker from '@/shared/services/ServicePicker';
import { Button, ButtonLink, Card, SectionHeading, cx } from '@/shared/ui';

/** Etiqueta corta de cada servicio en la portada; el resto viene del backend. */
const BADGE_KEYS = {
  CLEANING: 'services.badgeCleaning',
  LAUNDRY: 'services.badgeLaundry',
  ALTERATION: 'services.badgeRepair',
};

export default function HomePage() {
  const { t } = useTranslation();
  const { company } = useConfig();
  const experiences = useServiceExperiences();
  const [banner, setBanner] = useState(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [openFaq, setOpenFaq] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

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

  /**
   * Lo que se puede pedir, con su puerta de entrada.
   *
   * El texto de cada opción lo edita Operaciones y llega por
   * `GET /api/catalog/config`; el enlace lo decide `shared/services`. Una opción
   * sin ruta (Arreglos, mientras el dominio no sepa crear su orden) se muestra
   * pero no promete una reserva que la siguiente pantalla no puede cumplir.
   */
  const CATEGORIES = experiences.map((experience) => ({
    key: experience.code,
    label: experience.label,
    icon: experience.icon,
    badge: BADGE_KEYS[experience.code] ? t(BADGE_KEYS[experience.code]) : null,
    description: experience.description,
    link: experience.path,
    available: experience.available,
  }));

  const STEPS = [
    { n: '01', title: t('howItWorks.step1Title'), desc: t('howItWorks.step1Desc') },
    { n: '02', title: t('howItWorks.step2Title'), desc: t('howItWorks.step2Desc') },
    { n: '03', title: t('howItWorks.step3Title'), desc: t('howItWorks.step3Desc') },
  ];

  const GUARANTEES = [
    { icon: ShieldCheck, title: t('about.card1Title'), desc: t('about.card1Desc') },
    { icon: Key, title: t('about.card2Title'), desc: t('about.card2Desc') },
    { icon: Clock, title: t('about.card3Title'), desc: t('about.card3Desc') },
    { icon: Award, title: t('about.card4Title'), desc: t('about.card4Desc') },
  ];

  const HERO_METRICS = [
    { title: '100% verificado', caption: t('hero.badgeVerified') },
    { title: 'Tiempo real', caption: t('hero.badgeTracking') },
    { title: 'Garantía 100%', caption: t('hero.badgeGuarantee') },
  ];

  const FAQS = [
    { question: t('faqs.q1'), answer: t('faqs.a1') },
    { question: t('faqs.q2'), answer: t('faqs.a2') },
    { question: t('faqs.q3'), answer: t('faqs.a3') },
    { question: t('faqs.q4'), answer: t('faqs.a4') },
  ];

  return (
    <div className="min-h-screen bg-surface font-sans text-text antialiased">
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
         1. HERO (#hero) — imagen a sangre con velo verde profundo
         ========================================================================= */}
      <section
        id="hero"
        className="relative flex min-h-[90vh] w-full flex-col justify-between overflow-hidden bg-forest-950 px-4 pt-32 pb-12 text-white sm:px-6 sm:pt-36 sm:pb-16 md:px-8 lg:min-h-screen"
      >
        {/* El velo usa el verde de la marca, no un gris azulado: la foto entra
            en la paleta en lugar de convivir con ella. */}
        <div className="absolute inset-0 z-0">
          <img
            src="/hero_background.png"
            alt="Otterly Clean Interior"
            className="h-full w-full scale-105 object-cover object-center transition-transform duration-1000"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-forest-950/95 via-forest-950/65 to-forest-950/40" />
        </div>

        <div className="relative z-10 mx-auto my-auto flex w-full max-w-6xl flex-col gap-10 pt-4 text-left lg:flex-row lg:items-end lg:justify-between">
          {/* Titular, apoyo y llamadas a la acción */}
          <div className="max-w-3xl space-y-5 sm:space-y-6">
            <h1 className="text-3xl leading-tight font-extrabold tracking-tight text-white sm:text-5xl sm:leading-[1.08] lg:text-6xl xl:text-7xl">
              {t('hero.titlePart1')}
              <span className="font-serif font-normal text-forest-100 italic">
                {t('hero.titleHighlight')}
              </span>
              {t('hero.titlePart2')}
            </h1>

            <p className="max-w-xl text-sm leading-relaxed font-normal text-forest-100 sm:text-base md:text-lg">
              {t('hero.subtitle')}
            </p>

            <div className="flex flex-col items-stretch gap-3.5 pt-2 sm:flex-row sm:items-center">
              {/*
                Abre el selector en la propia portada en lugar de navegar a
                /reservar. Un visitante sin sesión puede elegir servicio y
                empezar a rellenar; la sesión se pide antes de confirmar.
              */}
              <Button
                variant="accent"
                size="lg"
                className="px-8"
                onClick={() => setPickerOpen(true)}
              >
                <CalendarCheck className="size-4.5" aria-hidden="true" />
                {t('hero.ctaPrimary')}
              </Button>
              <WhatsAppButton
                label={t('hero.ctaWhatsApp')}
                message="Hola, me gustaría solicitar información sobre los servicios de Otterly Clean."
                variant="inverse"
                size="lg"
                className="justify-center"
              />
            </div>
          </div>

          {/* Garantías en una línea por ítem */}
          <div className="flex shrink-0 flex-wrap items-center gap-4 border-t border-white/15 pt-6 sm:gap-8 lg:gap-10 lg:border-t-0 lg:pt-0">
            {HERO_METRICS.map((metric, index) => (
              <React.Fragment key={metric.title}>
                {index > 0 && (
                  <div className="hidden h-8 w-px shrink-0 self-center bg-white/25 sm:block" />
                )}
                <div className="text-left whitespace-nowrap">
                  <h3 className="text-sm font-extrabold tracking-tight text-white sm:text-base">
                    {metric.title}
                  </h3>
                  <p className="mt-0.5 text-xs font-normal text-forest-200">{metric.caption}</p>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================================
         2. ¿CÓMO FUNCIONA? (#how-it-works)
         ========================================================================= */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow={t('howItWorks.step')}
          title={t('howItWorks.title')}
          description={t('howItWorks.subtitle')}
        />

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {STEPS.map((step) => (
            <Card
              key={step.n}
              className="flex flex-col items-center p-8 text-center transition-shadow hover:shadow-[var(--shadow-raised)]"
            >
              <div className="flex size-12 items-center justify-center rounded-full bg-forest-50 text-sm font-bold text-forest-700 tnum">
                {step.n}
              </div>
              <h3 className="mt-6 text-lg font-bold tracking-tight text-text">{step.title}</h3>
              <p className="mt-3 text-xs leading-relaxed text-text-muted">{step.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* =========================================================================
         3. NUESTROS SERVICIOS (#services)
         ========================================================================= */}
      <section id="services" className="border-y border-border bg-surface-raised px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow={t('services.tag')}
            title={t('services.title')}
            description={t('services.subtitle')}
          />

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <div
                  key={cat.key}
                  data-service={cat.key}
                  className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-8 transition-all hover:border-service/40 hover:bg-surface-raised hover:shadow-[var(--shadow-raised)]"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex size-12 items-center justify-center rounded-xl bg-service-soft text-service-strong">
                        <Icon className="size-6" aria-hidden="true" />
                      </div>
                      {cat.badge && (
                        <span className="rounded-full bg-surface-sunken px-3 py-1 text-[11px] font-medium text-text-muted">
                          {cat.badge}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-6 text-xl font-bold tracking-tight text-text">{cat.label}</h3>
                    <p className="mt-3 text-xs leading-relaxed text-text-muted">{cat.description}</p>
                  </div>
                  <div className="mt-8 border-t border-border pt-4">
                    {/*
                      Sin ruta no hay enlace. Arreglos se anuncia porque existe
                      como servicio, pero enlazarlo llevaría a una pantalla que
                      no sabe crear su orden todavía.
                    */}
                    {cat.link ? (
                      <Link
                        to={cat.link}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-service-strong transition-colors hover:opacity-80"
                      >
                        <span>
                          {t('services.bookAction')} {cat.label.toLowerCase()}
                        </span>
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    ) : (
                      <span className="text-xs font-medium text-text-subtle">Próximamente</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* =========================================================================
         4. ¿QUIÉNES SOMOS? / GARANTÍAS (#about)
         ========================================================================= */}
      <section id="about" className="bg-forest-900 px-6 py-24 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="text-xs font-semibold tracking-[0.14em] text-forest-200 uppercase">
                {t('about.tag')}
              </span>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {t('about.title')}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-forest-100">{t('about.desc1')}</p>
              <p className="mt-3 text-sm leading-relaxed text-forest-100">{t('about.desc2')}</p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <ButtonLink as={Link} to="/reservar" variant="accent" size="sm">
                  {t('about.ctaTry')}
                </ButtonLink>
              </div>
            </div>

            {/* Tarjetas de garantía */}
            <div className="grid gap-4 sm:grid-cols-2">
              {GUARANTEES.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
                >
                  <Icon className="size-8 text-sage-300" aria-hidden="true" />
                  <h3 className="mt-4 text-base font-bold tracking-tight text-white">{title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-forest-100">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
         5. PREGUNTAS FRECUENTES (#faqs)
         ========================================================================= */}
      <section id="faqs" className="border-t border-border bg-surface px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <SectionHeading
            eyebrow={t('faqs.tag')}
            title={t('faqs.title')}
            description={t('faqs.subtitle')}
          />

          <div className="mt-12 space-y-4">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <Card key={idx} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleFaq(idx)}
                    aria-expanded={isOpen}
                    className={cx(
                      'flex w-full items-center justify-between gap-4 p-6 text-left text-sm font-bold text-text transition-colors',
                      'hover:text-forest-700',
                    )}
                  >
                    <span>{faq.question}</span>
                    {isOpen ? (
                      <ChevronUp className="size-4 shrink-0 text-forest-700" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="size-4 shrink-0 text-text-subtle" aria-hidden="true" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-border px-6 pt-4 pb-6 text-xs leading-relaxed text-text-muted">
                      {faq.answer}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* =========================================================================
         6. FOOTER
         ========================================================================= */}
      <CompanyFooter company={company} t={t} />

      <ServicePicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}

/** Pie con los datos de contacto administrables. Se omite lo no configurado. */
function CompanyFooter({ company, t }) {
  const contacts = [
    { key: 'phone', icon: Phone, label: company.phone, href: `tel:${company.phone}` },
    { key: 'email', icon: Mail, label: company.email, href: `mailto:${company.email}` },
    {
      key: 'telegram',
      icon: Send,
      label: company.telegram,
      href: company.telegram?.startsWith('http')
        ? company.telegram
        : `https://t.me/${String(company.telegram).replace(/^@/, '')}`,
    },
    { key: 'address', icon: MapPin, label: company.address, href: null },
  ].filter((contact) => Boolean(contact.label));

  return (
    <footer className="border-t border-border bg-surface-raised">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <BrandMark size="lg" />
            {company.supportHours ? (
              <p className="mt-3 text-sm text-text-muted">{company.supportHours}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-text-muted">
            <a href="#hero" className="transition-colors hover:text-forest-700">
              {t('header.home')}
            </a>
            <a href="#services" className="transition-colors hover:text-forest-700">
              {t('header.services')}
            </a>
            <a href="#how-it-works" className="transition-colors hover:text-forest-700">
              {t('header.howItWorks')}
            </a>
            <a href="#about" className="transition-colors hover:text-forest-700">
              {t('header.about')}
            </a>
            <a href="#faqs" className="transition-colors hover:text-forest-700">
              {t('header.faqs')}
            </a>
          </div>

          {contacts.length > 0 ? (
            <ul className="space-y-2.5 text-sm">
              {contacts.map(({ key, icon: Icon, label, href }) => (
                <li key={key} className="flex items-center gap-2.5 text-text-muted">
                  <Icon className="size-4 shrink-0 text-text-subtle" aria-hidden="true" />
                  {href ? (
                    <a href={href} className="hover:text-text" rel="noopener noreferrer">
                      {label}
                    </a>
                  ) : (
                    <span>{label}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <p className="mt-10 border-t border-border pt-6 text-xs text-text-subtle">
          © {new Date().getFullYear()} {company.name || 'Otterly Clean'}. {t('footer.rights')}
        </p>
      </div>
    </footer>
  );
}
