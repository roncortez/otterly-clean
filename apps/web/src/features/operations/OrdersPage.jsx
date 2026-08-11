import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Inbox } from 'lucide-react';
import { useApiQuery } from '@/shared/api/useApiQuery';
import { useDebounced } from '@/shared/hooks/useDebounced';
import { useConfig } from '@/shared/config/ConfigContext';
import {
  Alert,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  cx,
} from '@/shared/ui';
import { SERVICE_LABELS } from '@/shared/ui/ServiceCard';
import { formatDate, formatTimeWindow } from '@/shared/format';

const CLEANING_STATUSES = [
  'REQUESTED',
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'CONFIRMED',
  'ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_ACCESS',
  'INCIDENT_REPORTED',
  'REQUIRES_REVIEW',
];

const LAUNDRY_STATUSES = [
  'REQUESTED',
  'PICKUP_SCHEDULED',
  'ASSIGNED',
  'PICKUP_CONFIRMED',
  'PICKED_UP',
  'RECEIVED',
  'PROCESSING',
  'WASHING',
  'DRYING',
  'FOLDING',
  'READY_FOR_DELIVERY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'ISSUE_REPORTED',
];

export default function OrdersPage() {
  const [searchParams] = useSearchParams();
  const { money } = useConfig();

  const [filters, setFilters] = useState({
    serviceType: '',
    status: '',
    from: '',
    to: '',
    search: '',
    unassignedOnly: searchParams.get('sinAsignar') === '1',
    activeOnly: false,
  });

  const debouncedSearch = useDebounced(filters.search, 300);

  // Solo se envían los filtros con valor: los vacíos no viajan.
  const params = useMemo(
    () =>
      Object.fromEntries(
        Object.entries({ ...filters, search: debouncedSearch, limit: 50 }).filter(
          ([, value]) => value !== '' && value !== false,
        ),
      ),
    [filters, debouncedSearch],
  );

  const { data: result, loading, error } = useApiQuery('/operations/orders', { params });

  const update = (patch) => setFilters((current) => ({ ...current, ...patch }));
  const statuses = filters.serviceType === 'LAUNDRY' ? LAUNDRY_STATUSES : CLEANING_STATUSES;

  return (
    <div>
      <PageHeader
        title="Solicitudes"
        eyebrow="Operaciones"
        description="Filtra por servicio, estado o fecha para encontrar lo que buscas."
      />

      <Card className="mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="relative lg:col-span-2">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              placeholder="Buscar por referencia o cliente"
              value={filters.search}
              onChange={(event) => update({ search: event.target.value })}
            />
          </label>

          <Select
            value={filters.serviceType}
            onChange={(event) => update({ serviceType: event.target.value, status: '' })}
            aria-label="Servicio"
          >
            <option value="">Todos los servicios</option>
            <option value="CLEANING">Limpieza</option>
            <option value="LAUNDRY">Lavandería</option>
          </Select>

          <Select
            value={filters.status}
            onChange={(event) => update({ status: event.target.value })}
            aria-label="Estado"
          >
            <option value="">Todos los estados</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>

          <Input
            type="date"
            value={filters.from}
            onChange={(event) => update({ from: event.target.value })}
            aria-label="Desde"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <FilterChip
            active={filters.unassignedOnly}
            onClick={() => update({ unassignedOnly: !filters.unassignedOnly })}
          >
            Sin asignar
          </FilterChip>
          <FilterChip
            active={filters.activeOnly}
            onClick={() => update({ activeOnly: !filters.activeOnly })}
          >
            Solo activos
          </FilterChip>
        </div>
      </Card>

      {error && <Alert tone="danger">{error}</Alert>}

      {loading ? (
        <Spinner />
      ) : result?.data.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No hay solicitudes con estos filtros"
          description="Prueba a quitar algún filtro."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-sm">
              <thead className="bg-surface-sunken">
                <tr className="text-left text-xs tracking-wide text-text-subtle uppercase">
                  <th className="px-4 py-2.5 font-medium">Referencia</th>
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Servicio</th>
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="px-4 py-2.5 font-medium">Trabajador</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result?.data.map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-surface-sunken/60">
                    <td className="px-4 py-3">
                      <Link
                        to={`/operaciones/solicitudes/${order.id}`}
                        className="font-mono text-xs font-medium text-forest-700 hover:underline"
                      >
                        {order.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-text">{order.customerName}</td>
                    <td className="px-4 py-3 text-text-muted">
                      {SERVICE_LABELS[order.serviceType]}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-text-muted">
                      {formatDate(order.scheduledDate)}
                      <span className="block text-xs text-text-subtle tnum">
                        {formatTimeWindow(order.scheduledWindowStart, order.scheduledWindowEnd)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {order.assignedStaff.length > 0 ? (
                        <span className="text-text">{order.assignedStaff[0].name}</span>
                      ) : (
                        <span className="font-medium text-accent-600">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} label={order.statusLabel} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-text tnum">
                      {money(order.totalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result && (
            <div className="border-t border-border px-4 py-3 text-xs text-text-subtle">
              {result.pagination.total} solicitud(es)
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-forest-600 bg-forest-600 text-white'
          : 'border-border bg-surface-raised text-text-muted hover:border-border-strong',
      )}
    >
      {children}
    </button>
  );
}
