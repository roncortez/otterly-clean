import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner, Textarea } from '@/shared/ui';
import { formatDateTime } from '@/shared/format';

const CATEGORY_LABELS = {
  NO_ACCESS: 'Sin acceso',
  DAMAGE: 'Daño',
  MISSING_ITEM: 'Falta una prenda',
  CUSTOMER_ABSENT: 'Cliente ausente',
  UNSAFE_CONDITIONS: 'Condiciones inseguras',
  INCOMPLETE_SERVICE: 'Servicio incompleto',
  EQUIPMENT: 'Equipo',
  OTHER: 'Otro',
};

export default function IncidentsPage() {
  const [resolving, setResolving] = useState(null);
  const [resolution, setResolution] = useState('');

  const { data, loading, error: loadError, reload } = useApiQuery('/operations/incidents');
  const { busy, error: actionError, execute } = useApiAction();

  const incidents = data?.incidents ?? [];
  const error = loadError ?? actionError;

  async function handleResolve(incidentId) {
    await execute(
      () =>
        api.post(`/operations/incidents/${incidentId}/resolve`, {
          status: 'RESOLVED',
          resolution: resolution || null,
        }),
      {
        onSuccess: () => {
          setResolving(null);
          setResolution('');
          reload();
        },
      },
    );
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Incidencias"
        eyebrow="Operaciones"
        description="Ordenadas por gravedad y antigüedad."
      />

      {error && (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {incidents.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Sin incidencias abiertas"
          description="Cuando un trabajador o un cliente reporte algo, aparecerá aquí."
        />
      ) : (
        <div className="space-y-3">
          {incidents.map((incident) => (
            <Card key={incident.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={incident.severity === 'HIGH' ? 'danger' : 'warning'}>
                      {CATEGORY_LABELS[incident.category] ?? incident.category}
                    </Badge>
                    <Link
                      to={`/operaciones/solicitudes/${incident.order_id}`}
                      className="font-mono text-xs font-medium text-forest-700 hover:underline"
                    >
                      {incident.reference}
                    </Link>
                    <span className="text-xs text-text-subtle">
                      {formatDateTime(incident.created_at)}
                    </span>
                  </div>

                  <p className="mt-2 text-text">{incident.description}</p>
                  <p className="mt-1 text-sm text-text-subtle">
                    Reportado por {incident.first_name} {incident.last_name}
                  </p>
                </div>

                {resolving !== incident.id && (
                  <Button size="sm" variant="outline" onClick={() => setResolving(incident.id)}>
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    Resolver
                  </Button>
                )}
              </div>

              {resolving === incident.id && (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  <Textarea
                    placeholder="¿Qué se hizo para resolverlo?"
                    value={resolution}
                    onChange={(event) => setResolution(event.target.value)}
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" loading={busy} onClick={() => handleResolve(incident.id)}>
                      Marcar como resuelta
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setResolving(null);
                        setResolution('');
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
