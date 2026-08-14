import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarPlus,
  CalendarCheck,
  CheckCircle2,
  Shirt,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { useApiQuery } from '@/shared/api/useApiQuery';
import { useAuth } from '@/shared/auth/AuthContext';
import { useConfig } from '@/shared/config/ConfigContext';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Eyebrow,
  Spinner,
  StatusBadge,
} from '@/shared/ui';
import { StatusTimeline } from '@/shared/ui/StatusTimeline';
import { ServiceCard } from '@/shared/ui/ServiceCard';
import ServicePicker from '@/shared/services/ServicePicker';
import { formatLongDate, formatTimeWindow, isToday } from '@/shared/format';

/**
 * Inicio del cliente.
 *
 * Dos bloques, y el reparto no es estético: a la izquierda lo que resume su
 * relación con nosotros (unas pocas cifras), a la derecha lo que está pasando
 * ahora mismo. Lo segundo pesa más porque es lo que se viene a mirar; las
 * cifras contestan «¿cómo voy?» de un vistazo y no piden acción.
 *
 * Las métricas salen de `GET /api/customer/summary`, que las cuenta en la base.
 * No hay ninguna que el backend no sepa calcular: nada de medias mensuales ni
 * comparativas que habría que inventarse en el navegador.
 *
 * En móvil los dos bloques se apilan y el servicio en curso va primero: en una
 * pantalla estrecha, lo urgente no puede quedar debajo del resumen.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const { money } = useConfig();
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeParams = useMemo(() => ({ activeOnly: true, limit: 10 }), []);
  const historyParams = useMemo(() => ({ limit: 5 }), []);

  const summaryQuery = useApiQuery('/customer/summary');
  const activeQuery = useApiQuery('/customer/orders', { params: activeParams });
  const historyQuery = useApiQuery('/customer/orders', { params: historyParams });

  const summary = summaryQuery.data?.summary ?? null;
  const active = activeQuery.data?.data ?? [];
  const past = (historyQuery.data?.data ?? []).filter((order) => order.isTerminal);

  // El servicio que ocurre hoy es el que se muestra con su timeline desplegado.
  const live = active.find((order) => isToday(order.scheduledDate)) ?? active[0];
  const liveQuery = useApiQuery(live ? `/customer/orders/${live.id}` : null);
  const liveDetail = liveQuery.data;

  const loading = activeQuery.loading || historyQuery.loading;
  const error = activeQuery.error ?? historyQuery.error ?? summaryQuery.error;

  if (loading) return <Spinner label="Cargando tus servicios" />;

  return (
    <div className="space-y-8">
      {/*
        Sin botón de reserva aquí: la barra superior ya lleva «¿Qué necesitas?»
        y estaba a dos dedos de este, repitiendo la misma llamada dos veces en
        la misma pantalla.
      */}
      <header>
        <p className="text-sm text-text-muted">Hola, {user?.firstName}</p>
        <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-text sm:text-3xl">
          {active.length > 0 ? 'Tus servicios en curso' : '¿Qué necesitas hoy?'}
        </h1>
      </header>

      {error && <Alert tone="danger">{error}</Alert>}

      {/*
        `order-*` invierte el orden en móvil: el servicio en curso primero. En
        escritorio vuelve a la izquierda-derecha que describe el comentario de
        arriba.
      */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
        <section className="order-2 lg:order-1">
          <Eyebrow className="mb-3 block">Tu resumen</Eyebrow>
          <SummaryMetrics summary={summary} money={money} />
        </section>

        <section className="order-1 lg:order-2">
          <Eyebrow className="mb-3 block">
            {liveDetail && isToday(liveDetail.order.scheduledDate) ? 'Hoy' : 'Próximo servicio'}
          </Eyebrow>
          {liveDetail ? (
            <LiveServiceCard detail={liveDetail} />
          ) : (
            <Card className="p-6">
              <EmptyState
                icon={CalendarPlus}
                title="No tienes nada agendado"
                description="Cuando reserves un servicio lo verás aquí, con su estado al día."
                action={
                  <Button variant="accent" onClick={() => setPickerOpen(true)}>
                    <Sparkles className="size-4" aria-hidden="true" />
                    ¿Qué necesitas?
                  </Button>
                }
              />
            </Card>
          )}
        </section>
      </div>

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

      <ServicePicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}

/**
 * Las cifras del cliente.
 *
 * Cuatro y ninguna más. Cada una contesta algo que se pregunta de verdad:
 * cuántos servicios tengo en marcha, cuántos han salido bien, cuánto llevo
 * gastado y cuántas veces he usado lavandería —el segundo servicio, el que dice
 * si la cuenta es de limpieza o de las dos cosas—.
 *
 * Los pedidos de lavandería se ocultan si son cero: una métrica en cero no
 * informa de nada y ocupa el sitio de las que sí.
 */
function SummaryMetrics({ summary, money }) {
  if (!summary) return null;

  const metrics = [
    { label: 'Servicios activos', value: summary.activeOrders, icon: CalendarCheck },
    { label: 'Servicios completados', value: summary.completedOrders, icon: CheckCircle2 },
    { label: 'Total en servicios', value: money(summary.totalSpent), icon: Wallet },
  ];

  if (summary.laundryOrders > 0) {
    metrics.push({ label: 'Pedidos de lavandería', value: summary.laundryOrders, icon: Shirt });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
      {metrics.map(({ label, value, icon: Icon }) => (
        <Card key={label} className="flex items-center gap-3.5 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xl font-extrabold tracking-tight text-text tnum">{value}</p>
            <p className="text-xs text-text-muted">{label}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}

/** El servicio que está en marcha, con su progreso. Es la pieza principal. */
function LiveServiceCard({ detail }) {
  return (
    <Card className="overflow-hidden" data-service={detail.order.serviceType}>
      <div className="border-b border-border bg-forest-800 px-5 py-4 text-text-inverse sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold tracking-tight">{detail.order.planName}</p>
            <p className="text-sm text-forest-200">
              {formatLongDate(detail.order.scheduledDate)} ·{' '}
              {formatTimeWindow(
                detail.order.scheduledWindowStart,
                detail.order.scheduledWindowEnd,
              )}
            </p>
          </div>
          <StatusBadge status={detail.order.status} label={detail.statusLabel} />
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[1fr_240px]">
        <StatusTimeline steps={detail.timeline} />

        <div className="space-y-4 md:border-l md:border-border md:pl-6">
          {detail.assignedStaff?.[0] ? (
            <div>
              <Eyebrow className="mb-2 block">Quién lo atiende</Eyebrow>
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-forest-50 font-semibold text-forest-700">
                  {detail.assignedStaff[0].displayName?.[0]}
                </span>
                <div>
                  <p className="font-medium text-text">{detail.assignedStaff[0].displayName}</p>
                  {detail.assignedStaff[0].isVerified && (
                    <p className="text-xs text-success">Profesional verificado</p>
                  )}
                </div>
              </div>
              {detail.assignedStaff[0].bio && (
                <p className="mt-3 text-sm text-text-muted">{detail.assignedStaff[0].bio}</p>
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
            to={`/servicios/${detail.order.id}`}
            variant="outline"
            size="sm"
            className="w-full"
          >
            Ver todos los detalles
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}
