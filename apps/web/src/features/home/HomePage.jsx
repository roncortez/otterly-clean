import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Mail,
  MapPin,
  Phone,
  Scissors,
  ShieldCheck,
  Shirt,
  Send,
  Sparkles,
} from 'lucide-react';
import WhatsAppButton from '@/shared/ui/WhatsAppButton';
import BrandMark from '@/shared/ui/BrandMark';
import Overlay from '@/shared/ui/Overlay';
import { useConfig } from '@/shared/config/ConfigContext';
import { api } from '@/shared/api/client';
import { Spinner } from '@/shared/ui';

/**
 * Portada pública.
 *
 * Ni los servicios ni los datos de contacto están escritos aquí: los servicios
 * llegan de /api/catalog/config —con el nombre, la descripción y el orden que
 * Operaciones haya configurado— y el contacto, de la configuración de empresa.
 * Un servicio desactivado desaparece de la portada sin tocar este archivo.
 */

/**
 * Iconos disponibles para los servicios. Es un mapa cerrado a propósito: la
 * configuración guarda un nombre, no un componente, y solo se admiten los que
 * el frontend sabe pintar.
 */
const SERVICE_ICONS = { Sparkles, Shirt, Scissors };

const TRUST_BADGES = [
  { icon: ShieldCheck, label: 'Personal verificado' },
  { icon: Clock, label: 'Seguimiento en tiempo real' },
  { icon: CheckCircle2, label: 'Garantía de satisfacción' },
];

export default function HomePage() {
  const { company, serviceTypes, isLoading } = useConfig();
  const [banner, setBanner] = useState(null);
  const [overlayDismissed, setOverlayDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/catalog/banner')
      .then(({ data }) => {
        if (!cancelled) setBanner(data);
      })
      .catch(() => {
        // El banner es decorativo: si falla, la portada sigue funcionando.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Solo lo que se puede reservar hoy, en el orden que decidió Operaciones.
  const services = serviceTypes.filter((service) => service.bookable);

  if (isLoading) return <Spinner label="Cargando" />;

  return (
    <div className="min-h-dvh bg-surface">
      <Overlay
        isOpen={!overlayDismissed && Boolean(banner?.enabled)}
        imageUrl={banner?.imageUrl}
        message={banner?.message}
        onClose={() => setOverlayDismissed(true)}
      />

      <header className="border-b border-border bg-surface-raised">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <BrandMark size="md" />
          <div className="flex items-center gap-2">
            <Link
              to="/entrar"
              className="rounded-xl px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
            >
              Entrar
            </Link>
            <Link
              to="/crear-cuenta"
              className="inline-flex h-10 items-center rounded-xl bg-forest-600 px-4 text-sm font-medium text-white transition-colors hover:bg-forest-700"
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>

      <section className="px-6 py-20 lg:py-24">
        <div className="mx-auto max-w-3xl text-center">
          {company.tagline ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-forest-50 px-4 py-1.5 text-xs font-semibold text-forest-700">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {company.tagline}
            </p>
          ) : null}

          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-text sm:text-5xl">
            Tu espacio, <span className="text-accent-600">impecable</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-text-muted">
            Profesionales verificados en tu casa. Agenda cuando te venga bien y sigue cada etapa
            del servicio en tiempo real.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/reservar"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent-600 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-700"
            >
              <CalendarCheck className="size-4" aria-hidden="true" />
              Solicitar un servicio
            </Link>
            <WhatsAppButton label="Escríbenos por WhatsApp" />
          </div>

          <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-border pt-8 text-xs font-medium text-text-subtle">
            {TRUST_BADGES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2">
                <Icon className="size-4 text-forest-600" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-text">Nuestros servicios</h2>
          <p className="mt-2 text-sm text-text-muted">
            Elige lo que necesitas y reserva en un par de minutos.
          </p>
        </div>

        {services.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center text-sm text-text-muted">
            No hay servicios disponibles en este momento. Escríbenos y te avisamos en cuanto
            volvamos a abrir la agenda.
          </p>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => {
              const Icon = SERVICE_ICONS[service.icon] ?? Sparkles;
              return (
                <article
                  key={service.code}
                  className="flex flex-col justify-between rounded-2xl border border-border bg-surface-raised p-7 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-raised)]"
                >
                  <div>
                    {service.imageUrl ? (
                      <img
                        src={service.imageUrl}
                        alt=""
                        className="mb-5 h-32 w-full rounded-xl object-cover"
                      />
                    ) : (
                      <span className="flex size-12 items-center justify-center rounded-xl bg-forest-50 text-forest-600">
                        <Icon className="size-6" aria-hidden="true" />
                      </span>
                    )}
                    <h3 className="mt-5 text-lg font-semibold text-text">{service.label}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-text-muted">
                      {service.description}
                    </p>
                  </div>

                  <Link
                    to={`/reservar?servicio=${service.code}`}
                    className="mt-6 inline-flex items-center gap-1 border-t border-border pt-4 text-sm font-medium text-forest-700 hover:text-forest-600"
                  >
                    Reservar <span aria-hidden="true">→</span>
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <CompanyFooter company={company} />
    </div>
  );
}

/** Pie con los datos de contacto administrables. Se omite lo no configurado. */
function CompanyFooter({ company }) {
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
          © {new Date().getFullYear()} {company.name}. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}
