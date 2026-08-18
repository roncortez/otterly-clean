import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck,
  ShieldCheck,
  Clock,
  ChevronDown,
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
import { useRevealOnScroll } from '@/shared/hooks/useRevealOnScroll';
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

  /*
    La portada es la única pantalla del producto que se lee de arriba abajo una
    vez, en lugar de consultarse a diario. Es el sitio —el único— donde hacer
    que el contenido aparezca al llegar a él marca el ritmo de lectura en vez de
    estorbar. En las consolas internas esto mismo sería una tortura diaria.
  */
  const revealRef = useRevealOnScroll();

  /*
    La flecha de "sigue bajando" del hero, y el momento en que sobra.

    Es la única cosa de la portada que se mueve sola, así que tiene que ganarse
    el sitio: sirve mientras la primera pantalla ocupa el alto entero y parece
    que la página se acaba ahí. En cuanto se baja, ya no dice nada que no sepas,
    y una animación en bucle que no dice nada es ruido sobre la fotografía.

    Se apaga al primer desplazamiento y no vuelve. Cuando eso pasa, el efecto se
    vuelve a ejecutar y ya no se suscribe: el listener se retira solo en cuanto
    deja de tener nada que decidir, en vez de seguir corriendo en cada fotograma
    de desplazamiento durante el resto de la visita.

    `passive` porque no se cancela el evento: sin la marca, el navegador tiene
    que esperar a ver si este listener llama a `preventDefault` antes de mover la
    página, y eso es exactamente el tirón que se nota al empezar a bajar.

    El valor inicial se lee en el primer render y no dentro del efecto. Se llega
    aquí con la página ya desplazada más veces de las que parece —volviendo
    atrás desde una reserva, o con `#faqs` en la dirección—, y comprobarlo dentro
    del efecto significaría pintar la flecha un fotograma antes de quitarla.
  */
  const [scrolled, setScrolled] = useState(() => window.scrollY > 24);

  useEffect(() => {
    if (scrolled) return undefined;

    const onScroll = () => {
      if (window.scrollY > 24) setScrolled(true);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [scrolled]);

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
    <div ref={revealRef} className="min-h-screen bg-surface font-sans text-text antialiased">
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
            className="anim-hero-image h-full w-full scale-105 object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-forest-950/95 via-forest-950/65 to-forest-950/40" />
        </div>

        <div className="relative z-10 mx-auto my-auto flex w-full max-w-6xl flex-col gap-10 pt-4 text-left lg:flex-row lg:items-end lg:justify-between">
          {/*
            Titular, apoyo y llamadas a la acción.

            Entran en cascada, en el orden en que se leen: primero qué es esto,
            después por qué, y al final qué puedes hacer. Todo a la vez sería la
            misma información, pero obligaría a decidir por dónde empezar a
            mirar; escalonado, la página lo decide por ti y no cuesta nada.
          */}
          <div className="stagger max-w-3xl space-y-5 sm:space-y-6">
            {/*
              El antetítulo se abre separando las letras antes de que llegue el
              titular. Es el gesto de portada de la otra aplicación de la casa,
              y aquí hace lo mismo que allí: convierte una línea de texto suelta
              en el telón que sube.

              Va oculto en móvil y no por falta de sitio en vertical, sino
              porque la frase entera no cabe en una línea a esa anchura, y
              `track-in` la reparte a lo ancho mientras se anima: en dos líneas
              el salto de palabra cambiaría a mitad del gesto y se vería el texto
              recolocarse. `whitespace-nowrap` deja escrito que esto cuenta con
              una sola línea, para que no se rompa si mañana alguien lo enseña
              antes de `sm`.

              El texto ya existía en los dos idiomas (`hero.verifiedBadge`) y no
              lo usaba nadie: es exactamente lo que decía la portada antes de
              tener dónde ponerlo.
            */}
            {/* `forest-100` y no `forest-200`, que es el verde con el que se
                escriben los antetítulos sobre fondo oscuro en el resto del
                sitio: aquí el fondo no es un color plano sino una fotografía, y
                justo detrás de esta línea cae la zona más clara de la imagen —
                el ventanal—. A 11 px en versalitas, ese contraste no daba. */}
            <span className="track-in hidden text-[11px] font-semibold text-forest-100 uppercase drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)] sm:inline-block sm:whitespace-nowrap">
              {t('hero.verifiedBadge')}
            </span>

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

          {/* Garantías en una línea por ítem. Llegan detrás del titular: son el
              respaldo de lo que se acaba de prometer, no la promesa. */}
          <div
            className="anim-rise flex shrink-0 flex-wrap items-center gap-4 border-t border-white/15 pt-6 sm:gap-8 lg:gap-10 lg:border-t-0 lg:pt-0"
            style={{ animationDelay: '180ms' }}
          >
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

        {/*
          «Hay más abajo».

          El hero ocupa el alto entero de la ventana y termina en un borde
          limpio, así que sin esto la portada parece que se acaba en la primera
          pantalla. Es un enlace de verdad y no un adorno: se puede pulsar, y
          lleva a la sección siguiente con el desplazamiento suave que ya usa el
          menú de la cabecera.

          Se retira al primer desplazamiento (`data-done`) — ver el efecto de
          arriba. Va oculta en móvil: en un teléfono nadie duda de que se
          desplaza, y ahí compite por el poco sitio que queda bajo el botón
          principal.

          `aria-hidden` sin quitarlo del tabulador sería una trampa; se hace al
          revés — se esconde entero de la accesibilidad con `tabIndex={-1}`,
          porque lo que ofrece (bajar a «Cómo funciona») ya está en el menú de la
          cabecera y en el pie, escrito con palabras.
        */}
        <a
          href="#how-it-works"
          aria-hidden="true"
          tabIndex={-1}
          data-done={scrolled}
          className="scroll-cue absolute inset-x-0 bottom-6 z-10 mx-auto hidden w-fit rounded-full p-2 text-white/45 hover:text-white sm:block"
        >
          <ChevronDown className="size-7" />
        </a>
      </section>

      {/* =========================================================================
         2. ¿CÓMO FUNCIONA? (#how-it-works)
         ========================================================================= */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading
          className="reveal"
          eyebrow={t('howItWorks.step')}
          title={t('howItWorks.title')}
          description={t('howItWorks.subtitle')}
        />

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <Card
              key={step.n}
              interactive
              className="reveal lift-lg group flex flex-col items-center p-8 text-center"
              /* Los tres pasos aparecen en orden 01 → 02 → 03. El retraso va
                 aquí y no en `.stagger` porque estas tarjetas no entran al
                 montarse sino al llegar a ellas desplazándose. */
              style={{ animationDelay: `${index * 90}ms` }}
            >
              {/* El número crece un punto al señalar la tarjeta. Aquí no hay
                  halo: estas tres no llevan color de servicio —son un proceso,
                  no tres servicios— y encenderlas todas del mismo verde las
                  convertiría en tres botones. */}
              <div className="pop-icon flex size-12 items-center justify-center rounded-full bg-forest-50 text-sm font-bold text-forest-700 tnum">
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
            className="reveal"
            eyebrow={t('services.tag')}
            title={t('services.title')}
            description={t('services.subtitle')}
          />

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {CATEGORIES.map((cat, index) => {
              const Icon = cat.icon;
              return (
                <div
                  key={cat.key}
                  data-service={cat.key}
                  style={{ animationDelay: `${index * 90}ms` }}
                  /* `transition-all` incluía el ancho, la altura y la posición:
                     tres propiedades que obligan a rehacer el diseño en cada
                     fotograma para animar un borde y un fondo. Se nombran las
                     dos que de verdad cambian; la elevación la pone `lift`, que
                     además la esconde en pantallas táctiles, donde el `:hover`
                     se queda pegado después de tocar.

                     `lift-lg`, `halo` y `edge-glow` son las tres piezas del
                     gesto de portada: la tarjeta sube más que en una consola (6
                     px en vez de 2, hay sitio de sobra), se enciende con un
                     resplandor de su propio color y se remata con un filo
                     abajo. Son tres clases y no una porque cada una responde a
                     una pregunta distinta —cuánto sube, de qué color se
                     enciende, qué la cierra— y así se pueden usar por separado
                     donde haga falta. `overflow-hidden` es para el filo: sin él
                     asoma por las esquinas redondeadas. */
                  className="reveal lift lift-lg halo edge-glow group flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-surface p-8 transition-[background-color,border-color] hover:border-service/40 hover:bg-surface-raised"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="pop-icon flex size-12 items-center justify-center rounded-xl bg-service-soft text-service-strong">
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
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-service-strong transition-[color,opacity] hover:opacity-80"
                      >
                        <span>
                          {t('services.bookAction')} {cat.label.toLowerCase()}
                        </span>
                        {/* La flecha se adelanta cuando el puntero está sobre la
                            tarjeta entera, no solo sobre el enlace: la tarjeta
                            es lo que se señala. */}
                        <ArrowRight className="nudge size-3.5" aria-hidden="true" />
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
            <div className="reveal">
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

            {/* Tarjetas de garantía. Entran después del texto que las anuncia y
                escalonadas entre sí: son cuatro promesas, no un bloque. */}
            <div className="grid gap-4 sm:grid-cols-2">
              {GUARANTEES.map(({ icon: Icon, title, desc }, index) => (
                <div
                  key={title}
                  style={{ animationDelay: `${140 + index * 80}ms` }}
                  className="reveal lift lift-lg group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
                >
                  <Icon className="pop-icon size-8 text-sage-300" aria-hidden="true" />
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
            className="reveal"
            eyebrow={t('faqs.tag')}
            title={t('faqs.title')}
            description={t('faqs.subtitle')}
          />

          <div className="mt-12 space-y-4">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <Card key={idx} className="reveal overflow-hidden">
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
                    {/*
                      Antes se intercambiaban dos iconos distintos. El cambio era
                      instantáneo y no contaba nada: veías una flecha hacia
                      abajo y de pronto una hacia arriba, sin saber si acababas
                      de abrir o de cerrar. Girando la misma flecha, el gesto es
                      el que se ve.
                    */}
                    <ChevronDown
                      className={cx(
                        'chevron size-4 shrink-0',
                        isOpen ? 'text-forest-700' : 'text-text-subtle',
                      )}
                      aria-hidden="true"
                    />
                  </button>

                  {/*
                    La respuesta se despliega en lugar de aparecer de golpe. El
                    contenido sigue en el DOM cuando está cerrado —lo esconde el
                    `overflow` de la fila de altura cero—, que es lo que permite
                    animar hasta su alto real sin medirlo a mano. Ver `.disclosure`.
                  */}
                  {/*
                    `inert` cuando está cerrada. El texto sigue en el DOM para
                    poder animarlo, y sin esto un lector de pantalla leería las
                    cuatro respuestas seguidas como si estuvieran todas abiertas,
                    y el tabulador se pararía en enlaces que nadie ve.
                  */}
                  <div className="disclosure" data-open={isOpen} inert={!isOpen}>
                    <div>
                      <div className="border-t border-border px-6 pt-4 pb-6 text-xs leading-relaxed text-text-muted">
                        {faq.answer}
                      </div>
                    </div>
                  </div>
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
        <div className="reveal flex flex-wrap items-start justify-between gap-8">
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
