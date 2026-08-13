import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarSearch } from 'lucide-react';
import { useApiQuery } from '@/shared/api/useApiQuery';
import { useConfig } from '@/shared/config/ConfigContext';
import { Alert, ButtonLink, EmptyState, PageHeader, Spinner, cx } from '@/shared/ui';
import { ServiceCard } from '@/shared/ui/ServiceCard';
import { SERVICE_EXPERIENCES, bookingPath, serviceExperience } from '@/shared/services';

/**
 * Historial de reservas.
 *
 * La misma pantalla sirve dos cosas: dentro de un servicio muestra solo lo suyo
 * (`serviceType`), y en `/servicios` muestra todo, que sigue siendo útil porque
 * "¿qué tengo pendiente?" es una pregunta que no distingue de servicio.
 */

/** Filtros de la vista global. Los de servicio salen de las experiencias. */
const GLOBAL_FILTERS = [
  { id: 'all', label: 'Todos', params: {} },
  { id: 'active', label: 'En curso', params: { activeOnly: true } },
  ...SERVICE_EXPERIENCES.map((experience) => ({
    id: experience.code,
    label: experience.label,
    params: { serviceType: experience.code },
  })),
];

const SERVICE_FILTERS = [
  { id: 'all', label: 'Todos', params: {} },
  { id: 'active', label: 'En curso', params: { activeOnly: true } },
];

export default function OrdersPage({ serviceType = null }) {
  const { money } = useConfig();
  const [filter, setFilter] = useState('all');

  const experience = serviceType ? serviceExperience(serviceType) : null;
  const filters = serviceType ? SERVICE_FILTERS : GLOBAL_FILTERS;

  const params = useMemo(
    () => ({
      ...(filters.find((entry) => entry.id === filter)?.params ?? {}),
      ...(serviceType ? { serviceType } : {}),
      limit: 50,
    }),
    [filter, filters, serviceType],
  );

  const { data, loading, error } = useApiQuery('/customer/orders', { params });
  const orders = data?.data ?? [];
  const reservar = serviceType ? bookingPath(serviceType) : '/inicio';

  return (
    <div>
      <PageHeader
        eyebrow={experience?.label}
        title={serviceType === 'LAUNDRY' ? 'Tus pedidos' : 'Tus reservas'}
        description={
          serviceType
            ? `Todo lo que has pedido de ${experience?.label.toLowerCase()}.`
            : 'Todo lo que has reservado, en un solo lugar.'
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {filters.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setFilter(entry.id)}
            aria-pressed={filter === entry.id}
            className={cx(
              'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              filter === entry.id
                ? 'border-service bg-service text-white'
                : 'border-border bg-surface-raised text-text-muted hover:border-border-strong',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {loading ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={CalendarSearch}
          title="No hay servicios aquí"
          description="Prueba con otro filtro o reserva un servicio nuevo."
          action={
            reservar ? (
              <ButtonLink as={Link} to={reservar} variant="accent">
                Reservar un servicio
              </ButtonLink>
            ) : null
          }
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <ServiceCard key={order.id} order={order} to={`/servicios/${order.id}`} money={money} />
          ))}
        </div>
      )}
    </div>
  );
}
