import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { useApiQuery } from '@/shared/api/useApiQuery';
import { useDebounced } from '@/shared/hooks/useDebounced';
import { Alert, Card, EmptyState, Input, PageHeader, Spinner } from '@/shared/ui';
import { formatDate } from '@/shared/format';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  // No se consulta en cada tecla.
  const debouncedSearch = useDebounced(search, 300);

  const params = useMemo(
    () => ({ search: debouncedSearch || undefined, limit: 50 }),
    [debouncedSearch],
  );

  const { data: result, loading, error } = useApiQuery('/operations/customers', { params });

  return (
    <div>
      <PageHeader title="Clientes" eyebrow="Operaciones" />

      <label className="relative mb-5 block max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle"
          aria-hidden="true"
        />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre, correo o teléfono"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>

      {error && <Alert tone="danger">{error}</Alert>}

      {loading ? (
        <Spinner />
      ) : result?.data.length === 0 ? (
        <EmptyState icon={Users} title="No hay clientes con esa búsqueda" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface-sunken">
                <tr className="text-left text-xs tracking-wide text-text-subtle uppercase">
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Correo</th>
                  <th className="px-4 py-2.5 font-medium">Teléfono</th>
                  <th className="px-4 py-2.5 font-medium">Registro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result?.data.map((customer) => (
                  <tr key={customer.id} className="transition-colors hover:bg-surface-sunken/60">
                    <td className="px-4 py-3 font-medium text-text">
                      {customer.first_name} {customer.last_name}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{customer.email}</td>
                    <td className="px-4 py-3 text-text-muted tnum">{customer.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-text-subtle">{formatDate(customer.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
