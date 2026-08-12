import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarSearch } from 'lucide-react';
import { useApiQuery } from '@/shared/api/useApiQuery';
import { useConfig } from '@/shared/config/ConfigContext';
import { Alert, ButtonLink, EmptyState, PageHeader, Spinner, cx } from '@/shared/ui';
import { ServiceCard } from '@/shared/ui/ServiceCard';

const FILTERS = [
  { id: 'all', label: 'Todos', params: {} },
  { id: 'active', label: 'En curso', params: { activeOnly: true } },
  { id: 'cleaning', label: 'Limpieza', params: { serviceType: 'CLEANING' } },
  { id: 'laundry', label: 'Lavandería', params: { serviceType: 'LAUNDRY' } },
];

export default function OrdersPage() {
  const { money } = useConfig();
  const [filter, setFilter] = useState('all');

  const params = useMemo(
    () => ({ ...(FILTERS.find((entry) => entry.id === filter)?.params ?? {}), limit: 50 }),
    [filter],
  );

  const { data, loading, error } = useApiQuery('/customer/orders', { params });
  const orders = data?.data ?? [];

  return (
    <div>
      <PageHeader title="Tus servicios" description="Todo lo que has reservado, en un solo lugar." />

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setFilter(entry.id)}
            aria-pressed={filter === entry.id}
            className={cx(
              'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              filter === entry.id
                ? 'border-forest-600 bg-forest-600 text-white'
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
            <ButtonLink as={Link} to="/reservar" variant="accent">
              Reservar un servicio
            </ButtonLink>
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
