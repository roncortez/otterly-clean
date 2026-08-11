import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Sparkles, Shirt, ArrowRight, CalendarX2 } from 'lucide-react';
import { useApiQuery } from '@/shared/api/useApiQuery';
import { useAuth } from '@/shared/auth/AuthContext';
import { useConfig } from '@/shared/config/ConfigContext';
import { Alert, Card, EmptyState, Spinner, StatusBadge } from '@/shared/ui';
import { StatusTimeline } from '@/shared/ui/StatusTimeline';
import { ServiceCard } from '@/shared/ui/ServiceCard';
import { formatLongDate, formatTimeWindow, isToday } from '@/shared/format';

/**
 * Panel del cliente.
 *
 * La pregunta que responde arriba del todo es "¿qué está pasando ahora?".
 * Si hay un servicio en curso, ocupa el lugar principal con su timeline
 * desplegado; el resto queda por debajo.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const { money } = useConfig();

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
        <h1 className="mt-0.5 text-2xl font-semibold text-text sm:text-3xl">
          {active.length > 0 ? 'Tus servicios en curso' : 'Todo en orden'}
        </h1>
      </header>

      {error && <Alert tone="danger">{error}</Alert>}

      {/* Servicio activo con timeline: el corazón de la pantalla */}
      {liveDetail && (
        <Card className="overflow-hidden">
          <div className="border-b border-border bg-forest-800 px-5 py-4 text-text-inverse sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs tracking-[0.14em] text-forest-300 uppercase">
                  {isToday(liveDetail.order.scheduledDate) ? 'Hoy' : 'Próximo servicio'}
                </p>
                <p className="mt-1 text-lg font-semibold">{liveDetail.order.planName}</p>
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
                  <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-text-subtle uppercase">
                    Quién lo atiende
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-full bg-forest-100 font-semibold text-forest-700">
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

              <Link
                to={`/servicios/${liveDetail.order.id}`}
                className="flex h-10 w-full items-center justify-center rounded-xl border border-border-strong bg-surface-raised text-sm font-medium text-text transition-colors hover:bg-surface-sunken"
              >
                Ver todos los detalles
              </Link>
            </div>
          </div>
        </Card>
      )}

      {/* Acciones rápidas */}
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-[0.12em] text-text-subtle uppercase">
          Reservar un servicio
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <QuickAction
            to="/reservar?servicio=CLEANING"
            icon={Sparkles}
            title="Limpieza"
            description="Estándar o profunda, en el horario que elijas."
          />
          <QuickAction
            to="/reservar?servicio=LAUNDRY"
            icon={Shirt}
            title="Lavandería"
            description="Recogemos, lavamos y te la devolvemos doblada."
          />
        </div>
      </section>

      {/* Próximos */}
      {active.length > (liveDetail ? 1 : 0) && (
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-[0.12em] text-text-subtle uppercase">
            Próximas reservas
          </h2>
          <div className="space-y-3">
            {active
              .filter((order) => order.id !== liveDetail?.order.id)
              .map((order) => (
                <ServiceCard
                  key={order.id}
                  order={order}
                  to={`/servicios/${order.id}`}
                  money={money}
                />
              ))}
          </div>
        </section>
      )}

      {/* Historial */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-[0.12em] text-text-subtle uppercase">
            Historial
          </h2>
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
            icon={active.length === 0 ? CalendarPlus : CalendarX2}
            title={active.length === 0 ? 'Todavía no has reservado nada' : 'Sin servicios anteriores'}
            description="Cuando termines un servicio aparecerá aquí, con su historial completo."
            action={
              active.length === 0 ? (
                <Link
                  to="/reservar"
                  className="inline-flex h-11 items-center rounded-xl bg-forest-600 px-4 text-sm font-medium text-white hover:bg-forest-700"
                >
                  Reservar mi primer servicio
                </Link>
              ) : null
            }
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

function QuickAction({ to, icon: Icon, title, description }) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-4 rounded-2xl border border-border bg-surface-raised p-5 transition-all hover:border-forest-300 hover:shadow-[var(--shadow-card)]"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-600 transition-colors group-hover:bg-forest-100">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-text">{title}</span>
        <span className="mt-0.5 block text-sm text-text-muted">{description}</span>
      </span>
      <ArrowRight
        className="size-4 shrink-0 self-center text-text-subtle transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}
