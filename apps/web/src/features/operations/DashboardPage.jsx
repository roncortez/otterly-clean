import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, AlertTriangle, CheckCircle2, Users, ArrowRight } from 'lucide-react';
import { useApiQuery } from '@/shared/api/useApiQuery';
import {
  Alert,
  Card,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
  Spinner,
  StatusBadge,
  cx,
} from '@/shared/ui';
import { SERVICE_LABELS } from '@/shared/ui/ServiceCard';
import { formatTimeWindow, toDateInput, formatRelative } from '@/shared/format';

/**
 * Panel operativo.
 *
 * Está construido alrededor de las cuatro preguntas que un operador se hace al
 * empezar el día, en este orden:
 *   1. ¿Qué servicios tengo hoy?
 *   2. ¿Cuáles están sin asignar?     <- lo urgente, va primero
 *   3. ¿Quién está trabajando?
 *   4. ¿Qué tiene problemas?
 */
export default function DashboardPage() {
  const [date, setDate] = useState(toDateInput());
  const params = useMemo(() => ({ date }), [date]);

  const { data, loading, error } = useApiQuery('/operations/dashboard', { params });

  if (loading) return <Spinner label="Cargando el día" />;
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return null;

  const { summary, unassigned, openIncidents, todayOrders } = data;
  const totalToday = summary.byService.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hoy"
        eyebrow="Operaciones"
        description="Lo que hay que resolver ahora mismo."
        action={
          <Input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-auto"
          />
        }
      />

      {/* Métricas: lo urgente destaca en color, el resto es neutro. Entran en
          cascada de izquierda a derecha, en el orden en que se leen. */}
      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Servicios del día" value={totalToday} icon={CheckCircle2} />
        <Metric
          label="Sin asignar"
          value={summary.unassigned}
          icon={UserPlus}
          tone={summary.unassigned > 0 ? 'accent' : 'neutral'}
          to="/operaciones/solicitudes?sinAsignar=1"
        />
        <Metric label="Trabajando ahora" value={summary.activeStaff} icon={Users} />
        <Metric
          label="Incidencias abiertas"
          value={summary.openIncidents}
          icon={AlertTriangle}
          tone={summary.openIncidents > 0 ? 'danger' : 'neutral'}
          to="/operaciones/incidencias"
        />
      </div>

      {/* Sin asignar: la cola de trabajo real del operador */}
      <Card>
        <CardHeader
          title="Sin asignar"
          description={
            unassigned.length === 0
              ? 'Todo el día está cubierto.'
              : `${unassigned.length} servicio(s) esperando un trabajador.`
          }
        />
        <div className="p-4 sm:p-5">
          {unassigned.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nada pendiente de asignar"
              description="Cuando entre una solicitud nueva aparecerá aquí."
            />
          ) : (
            /* La cola real del operador. La cascada la hace contable de un
               vistazo —se ve cuántas son mientras entran— sin obligar a leer el
               número de la cabecera. */
            <ul className="stagger space-y-2">
              {unassigned.map((order) => (
                <li key={order.id}>
                  <Link
                    to={`/operaciones/solicitudes/${order.id}`}
                    className="press group flex items-center justify-between gap-4 rounded-xl border border-accent-200 bg-accent-50/60 px-4 py-3 transition-colors hover:bg-accent-50"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text">
                        {order.customerName}
                        <span className="font-mono text-xs font-normal text-text-subtle">
                          {order.reference}
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm text-text-muted">
                        {SERVICE_LABELS[order.serviceType]} ·{' '}
                        {formatTimeWindow(order.scheduledWindowStart, order.scheduledWindowEnd)}
                        {order.zoneName && ` · ${order.zoneName}`}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent-600 px-3.5 py-1.5 text-xs font-semibold text-white">
                      Asignar
                      <ArrowRight className="nudge size-3.5" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Agenda del día */}
      <Card>
        <CardHeader
          title="Agenda del día"
          description="Todos los servicios activos, con quién los atiende."
          action={
            <Link
              to="/operaciones/solicitudes"
              className="text-sm font-medium text-forest-600 hover:text-forest-700"
            >
              Ver todas
            </Link>
          }
        />
        <div className="p-4 sm:p-5">
          {todayOrders.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No hay servicios este día" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs tracking-wide text-text-subtle uppercase">
                    <th className="pb-2 font-medium">Hora</th>
                    <th className="pb-2 font-medium">Cliente</th>
                    <th className="pb-2 font-medium">Servicio</th>
                    <th className="pb-2 font-medium">Trabajador</th>
                    <th className="pb-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {todayOrders.map((order) => (
                    /* Las filas NO entran escalonadas. Esta tabla se relee
                       decenas de veces al día y con cada cambio de fecha; una
                       cascada aquí sería una espera diaria. Lo único que se
                       añade es el fondo al pasar por encima, que ayuda a no
                       perder la fila en una tabla de cinco columnas. */
                    <tr
                      key={order.id}
                      className="group transition-colors hover:bg-surface-sunken/60"
                    >
                      <td className="py-3 whitespace-nowrap text-text-muted tnum">
                        {formatTimeWindow(order.scheduledWindowStart, order.scheduledWindowEnd)}
                      </td>
                      <td className="py-3">
                        <Link
                          to={`/operaciones/solicitudes/${order.id}`}
                          className="font-medium text-text group-hover:text-forest-700"
                        >
                          {order.customerName}
                        </Link>
                        <p className="font-mono text-xs text-text-subtle">{order.reference}</p>
                      </td>
                      <td className="py-3 text-text-muted">{SERVICE_LABELS[order.serviceType]}</td>
                      <td className="py-3">
                        {order.assignedStaff.length > 0 ? (
                          <span className="text-text">{order.assignedStaff[0].name}</span>
                        ) : (
                          <span className="text-accent-600">Sin asignar</span>
                        )}
                      </td>
                      <td className="py-3">
                        <StatusBadge status={order.status} label={order.statusLabel} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Incidencias */}
      {openIncidents.length > 0 && (
        <Card>
          <CardHeader
            title="Incidencias abiertas"
            description="Ordenadas por gravedad."
            action={
              <Link
                to="/operaciones/incidencias"
                className="text-sm font-medium text-forest-600 hover:text-forest-700"
              >
                Gestionar
              </Link>
            }
          />
          <ul className="divide-y divide-border p-4 sm:p-5">
            {openIncidents.slice(0, 5).map((incident) => (
              <li key={incident.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                {/* Sin clasificar tambien pide atencion: nadie sabe aun si es grave. */}
                <span
                  className={cx(
                    'mt-1 size-2 shrink-0 rounded-full',
                    incident.severity === 'HIGH' || !incident.severity ? 'bg-danger' : 'bg-warning',
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/operaciones/solicitudes/${incident.order_id}`}
                    className="text-sm font-medium text-text hover:text-forest-700"
                  >
                    {incident.reference} · {incident.category}
                  </Link>
                  <p className="mt-0.5 text-sm text-text-muted">{incident.description}</p>
                </div>
                <span className="shrink-0 text-xs text-text-subtle">
                  {formatRelative(incident.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon, tone = 'neutral', to }) {
  const tones = {
    neutral: 'border-border bg-surface-raised text-text',
    accent: 'border-accent-200 bg-accent-50 text-accent-700',
    danger: 'border-danger/20 bg-danger-soft text-danger',
  };

  const content = (
    <div className={cx('rounded-2xl border p-4', tones[tone], to && 'lift')}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium opacity-80">{label}</p>
        <Icon className="size-4 opacity-60" aria-hidden="true" />
      </div>
      <p className="mt-2 text-3xl font-extrabold tracking-tight tnum">{value}</p>
    </div>
  );

  return to ? <Link to={to}>{content}</Link> : content;
}
