import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarPlus } from 'lucide-react';
import { useApiQuery } from '@/shared/api/useApiQuery';
import { useAuth } from '@/shared/auth/AuthContext';
import { useConfig } from '@/shared/config/ConfigContext';
import { Alert, ButtonLink, Card, EmptyState, Eyebrow, Spinner, StatusBadge, cx } from '@/shared/ui';
import { StatusTimeline } from '@/shared/ui/StatusTimeline';
import { ServiceCard } from '@/shared/ui/ServiceCard';
import { useServiceExperiences } from '@/shared/services';
import { formatLongDate, formatTimeWindow, isToday } from '@/shared/format';

/**
 * Inicio del cliente.
 *
 * Responde dos preguntas en este orden: "¿qué está pasando ahora?" y "¿qué
 * puedo pedir?". Lo segundo se presenta como tres puertas —limpieza, lavandería
 * y arreglos—, porque para el cliente son servicios distintos aunque compartan
 * cuenta, direcciones e historial.
 *
 * Un servicio que el dominio todavía no sabe crear se muestra, pero no ofrece
 * una acción de reserva que iba a fallar: quien decide si hay botón es el
 * backend (`bookable`), no esta pantalla.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const { money } = useConfig();
  const experiences = useServiceExperiences();

  const activeParams = useMemo(() => ({ activeOnly: true, limit: 10 }), []);
  const historyParams = useMemo(() => ({ limit: 5 }), []);

  const activeQuery = useApiQuery('/customer/orders', { params: activeParams });
  const historyQuery = useApiQuery('/customer/orders', { params: historyParams });

  const active = activeQuery.data?.data ?? [];
  const past = (historyQuery.data?.data ?? []).filter((order) => order.isTerminal);

  // El servicio que ocurre hoy es el que se muestra con su timeline desplegado.
  const live = active.find((order) => isToday(order.scheduledDate)) ?? active[0];
  const liveQuery = useApiQuery(live ? `/customer/orders/${live.id}` : null);
  const liveDetail = liveQuery.data;

  const loading = activeQuery.loading || historyQuery.loading;
  const error = activeQuery.error ?? historyQuery.error;

  if (loading) return <Spinner label="Cargando tus servicios" />;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-text-muted">Hola, {user?.firstName}</p>
        <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-text sm:text-3xl">
          {active.length > 0 ? 'Tus servicios en curso' : '¿Qué necesitas hoy?'}
        </h1>
      </header>

      {error && <Alert tone="danger">{error}</Alert>}

      {/* Servicio activo con timeline: el corazón de la pantalla */}
      {liveDetail && (
        <Card className="overflow-hidden" data-service={liveDetail.order.serviceType}>
          <div className="border-b border-border bg-forest-800 px-5 py-4 text-text-inverse sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-forest-200 uppercase">
                  {isToday(liveDetail.order.scheduledDate) ? 'Hoy' : 'Próximo servicio'}
                </p>
                <p className="mt-1 text-lg font-bold tracking-tight">{liveDetail.order.planName}</p>
                <p className="text-sm text-forest-200">
                  {formatLongDate(liveDetail.order.scheduledDate)} ·{' '}
                  {formatTimeWindow(
                    liveDetail.order.scheduledWindowStart,
                    liveDetail.order.scheduledWindowEnd,
                  )}
                </p>
              </div>
              <StatusBadge status={liveDetail.order.status} label={liveDetail.statusLabel} />
            </div>
          </div>

          <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[1fr_260px]">
            <StatusTimeline steps={liveDetail.timeline} />

            <div className="space-y-4 md:border-l md:border-border md:pl-6">
              {liveDetail.assignedStaff?.[0] ? (
                <div>
                  <Eyebrow className="mb-2 block">Quién lo atiende</Eyebrow>
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-full bg-service-soft font-semibold text-service-strong">
                      {liveDetail.assignedStaff[0].displayName?.[0]}
                    </span>
                    <div>
                      <p className="font-medium text-text">
                        {liveDetail.assignedStaff[0].displayName}
                      </p>
                      {liveDetail.assignedStaff[0].isVerified && (
                        <p className="text-xs text-success">Profesional verificado</p>
                      )}
                    </div>
                  </div>
                  {liveDetail.assignedStaff[0].bio && (
                    <p className="mt-3 text-sm text-text-muted">{liveDetail.assignedStaff[0].bio}</p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-surface-sunken p-4">
                  <p className="text-sm font-medium text-text">Asignando profesional</p>
                  <p className="mt-1 text-sm text-text-muted">
                    Te avisamos en cuanto tengamos a alguien confirmado para tu servicio.
                  </p>
                </div>
              )}

              <ButtonLink
                as={Link}
                to={`/servicios/${liveDetail.order.id}`}
                variant="outline"
                size="sm"
                className="w-full"
              >
                Ver todos los detalles
              </ButtonLink>
            </div>
          </div>
        </Card>
      )}

      {/* Las tres puertas */}
      <section>
        <Eyebrow className="mb-3 block">Nuestros servicios</Eyebrow>
        <div className="grid gap-4 md:grid-cols-3">
          {experiences.map((experience) => (
            <ServiceEntry key={experience.code} experience={experience} />
          ))}
        </div>
      </section>

      {/* Próximos */}
      {active.length > (liveDetail ? 1 : 0) && (
        <section>
          <Eyebrow className="mb-3 block">Próximas reservas</Eyebrow>
          <div className="space-y-3">
            {active
              .filter((order) => order.id !== liveDetail?.order.id)
              .map((order) => (
                <ServiceCard key={order.id} order={order} to={`/servicios/${order.id}`} money={money} />
              ))}
          </div>
        </section>
      )}

      {/* Historial */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <Eyebrow>Historial</Eyebrow>
          <Link
            to="/servicios"
            className="flex items-center gap-1 text-sm font-medium text-forest-600 hover:text-forest-700"
          >
            Ver todo
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        {past.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title={active.length === 0 ? 'Todavía no has reservado nada' : 'Sin servicios anteriores'}
            description="Cuando termines un servicio aparecerá aquí, con su historial completo."
          />
        ) : (
          <div className="space-y-3">
            {past.map((order) => (
              <ServiceCard key={order.id} order={order} to={`/servicios/${order.id}`} money={money} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Puerta de entrada a un servicio.
 *
 * Siempre se puede entrar a ver de qué va; reservar solo aparece si el backend
 * dice que ese servicio es reservable hoy. Un servicio apagado por Operaciones
 * y uno que el dominio aún no implementa se explican distinto, porque para el
 * cliente son cosas distintas: uno vuelve pronto, el otro todavía no existe.
 */
function ServiceEntry({ experience }) {
  const Icon = experience.icon;

  return (
    <Card
      data-service={experience.code}
      className={cx(
        'flex flex-col gap-4 p-5 transition-shadow hover:shadow-[var(--shadow-raised)]',
        !experience.bookable && 'opacity-95',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-service-soft text-service-strong">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        {!experience.bookable && (
          <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-text-muted">
            {experience.implemented ? 'No disponible ahora' : 'Muy pronto'}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="font-bold tracking-tight text-text">{experience.label}</h3>
        <p className="mt-1 text-sm text-text-muted">{experience.description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink as={Link} to={experience.path} variant="outline" size="sm">
          Ver {experience.label.toLowerCase()}
        </ButtonLink>
        {experience.bookingPath && (
          <ButtonLink as={Link} to={experience.bookingPath} variant="accent" size="sm">
            Reservar
          </ButtonLink>
        )}
      </div>
    </Card>
  );
}
