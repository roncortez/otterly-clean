import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  Textarea,
  cx,
} from '@/shared/ui';
import { formatDateTime } from '@/shared/format';

/**
 * Incidencias abiertas.
 *
 * Quien reporta describe el hecho; la gravedad la decide Operaciones aquí, y
 * queda auditada con su valor anterior. Por eso las sin clasificar salen
 * primero: son las que nadie ha mirado todavía.
 */

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

const SEVERITIES = [
  { value: 'LOW', label: 'Baja', tone: 'neutral' },
  { value: 'MEDIUM', label: 'Media', tone: 'warning' },
  { value: 'HIGH', label: 'Alta', tone: 'danger' },
];

export default function IncidentsPage() {
  const [resolving, setResolving] = useState(null);
  const [resolution, setResolution] = useState('');

  const { data, loading, error: loadError, reload } = useApiQuery('/operations/incidents');
  const { busy, error: actionError, execute } = useApiAction();

  const incidents = data?.incidents ?? [];
  const error = loadError ?? actionError;
  const pendientes = incidents.filter((incident) => !incident.severity).length;

  async function handleClassify(incidentId, severity) {
    await execute(() => api.patch(`/operations/incidents/${incidentId}/severity`, { severity }), {
      onSuccess: reload,
    });
  }

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
        description="Sin clasificar primero: la gravedad la decide el equipo, no quien reporta."
      />

      {error && (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {pendientes > 0 && (
        <div className="mb-5">
          <Alert tone="warning" title={`${pendientes} sin clasificar`}>
            Ponles gravedad para saber cuáles hay que atender primero.
          </Alert>
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
          {incidents.map((incident) => {
            const severity = SEVERITIES.find((entry) => entry.value === incident.severity);

            return (
              <Card
                key={incident.id}
                className={cx('p-5', !incident.severity && 'border-warning/40')}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">
                        {CATEGORY_LABELS[incident.category] ?? incident.category}
                      </Badge>
                      {severity ? (
                        <Badge tone={severity.tone}>Gravedad {severity.label.toLowerCase()}</Badge>
                      ) : (
                        <Badge tone="warning">
                          <AlertTriangle className="size-3.5" aria-hidden="true" />
                          Sin clasificar
                        </Badge>
                      )}
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
                      {incident.reporter_role === 'CUSTOMER' ? ' (cliente)' : ''}
                    </p>
                  </div>

                  {resolving !== incident.id && (
                    <Button size="sm" variant="outline" onClick={() => setResolving(incident.id)}>
                      <ShieldCheck className="size-4" aria-hidden="true" />
                      Resolver
                    </Button>
                  )}
                </div>

                {/* Clasificación: la decisión administrativa sobre el hecho. */}
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  <span className="text-sm text-text-muted">Gravedad:</span>
                  {SEVERITIES.map((entry) => (
                    <button
                      key={entry.value}
                      type="button"
                      disabled={busy}
                      aria-pressed={incident.severity === entry.value}
                      onClick={() => handleClassify(incident.id, entry.value)}
                      className={cx(
                        'rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
                        incident.severity === entry.value
                          ? 'border-forest-600 bg-forest-600 text-white'
                          : 'border-border text-text-muted hover:border-border-strong hover:text-text',
                      )}
                    >
                      {entry.label}
                    </button>
                  ))}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
