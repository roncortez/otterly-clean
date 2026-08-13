import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, UserPlus, ShieldCheck, History, Phone, Mail } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import { useConfig } from '@/shared/config/ConfigContext';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  DataRow,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
  cx,
} from '@/shared/ui';
import { StatusTimeline } from '@/shared/ui/StatusTimeline';
import { SERVICE_LABELS } from '@/shared/ui/ServiceCard';
import { formatLongDate, formatTimeWindow, formatDateTime, fullName } from '@/shared/format';

/** La gravedad la pone Operaciones desde /operaciones/incidencias. */
const SEVERITY_LABELS = { LOW: 'baja', MEDIUM: 'media', HIGH: 'alta' };

/**
 * Detalle operativo de una solicitud.
 * Es la pantalla donde se asigna, se corrige el estado y se ve el rastro
 * completo de quién hizo qué.
 */
export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { money } = useConfig();

  const [assignForm, setAssignForm] = useState({ staffId: '', notes: '' });
  const [statusForm, setStatusForm] = useState({ status: '', note: '' });

  const orderQuery = useApiQuery(`/operations/orders/${id}`);
  const detail = orderQuery.data;

  // Los candidatos solo tienen sentido mientras la orden siga viva.
  const isClosed = ['COMPLETED', 'CANCELLED'].includes(detail?.order.status);
  const candidatesQuery = useApiQuery(
    detail && !isClosed ? `/operations/orders/${id}/candidates` : null,
  );
  const candidates = candidatesQuery.data?.candidates ?? [];

  const { busy, error: actionError, execute } = useApiAction();
  const error = orderQuery.error ?? actionError;

  function reloadAll() {
    orderQuery.reload();
    candidatesQuery.reload();
  }

  async function handleAssign(event) {
    event.preventDefault();
    if (!assignForm.staffId) return;

    await execute(
      () =>
        api.post(`/operations/orders/${id}/assign`, {
          staffId: Number(assignForm.staffId),
          notes: assignForm.notes || null,
        }),
      {
        onSuccess: () => {
          setAssignForm({ staffId: '', notes: '' });
          reloadAll();
        },
      },
    );
  }

  async function handleStatusChange(event) {
    event.preventDefault();
    if (!statusForm.status) return;

    await execute(() => api.post(`/operations/orders/${id}/status`, statusForm), {
      onSuccess: () => {
        setStatusForm({ status: '', note: '' });
        reloadAll();
      },
    });
  }

  if (orderQuery.loading) return <Spinner />;
  if (error && !detail) return <Alert tone="danger">{error}</Alert>;
  if (!detail) return null;

  const { order, details, timeline, statusLabel, assignedStaff, availableTransitions, assignments, incidents, bags, auditTrail } =
    detail;
  const currentStaff = assignedStaff?.[0];

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-text-subtle">{order.reference}</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-text">
            {SERVICE_LABELS[order.serviceType]} · {order.planName}
          </h1>
          <p className="mt-1 text-text-muted capitalize">
            {formatLongDate(order.scheduledDate)} ·{' '}
            {formatTimeWindow(order.scheduledWindowStart, order.scheduledWindowEnd)}
          </p>
        </div>
        <StatusBadge status={order.status} label={statusLabel} />
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Asignación: la acción principal de esta pantalla */}
          <Card>
            <CardHeader
              title="Trabajador asignado"
              description={
                currentStaff
                  ? 'Puedes reasignar si hace falta; queda registrado.'
                  : 'Elige a quién le entregas este servicio.'
              }
            />
            <div className="space-y-4 p-5">
              {currentStaff && (
                <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-sunken p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-forest-100 font-semibold text-forest-700">
                      {currentStaff.displayName?.[0]}
                    </span>
                    <div>
                      <p className="font-medium text-text">
                        {currentStaff.firstName} {currentStaff.lastName}
                      </p>
                      <p className="text-xs text-text-muted">
                        {currentStaff.assignmentStatus === 'ACCEPTED'
                          ? 'Confirmado'
                          : currentStaff.assignmentStatus === 'COMPLETED'
                            ? 'Servicio completado'
                            : 'Pendiente de confirmar'}
                        {currentStaff.phone && ` · ${currentStaff.phone}`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {candidates.length > 0 && (
                <form onSubmit={handleAssign} className="space-y-3">
                  <Select
                    value={assignForm.staffId}
                    onChange={(event) => setAssignForm({ ...assignForm, staffId: event.target.value })}
                    aria-label="Trabajador"
                  >
                    <option value="">
                      {currentStaff ? 'Reasignar a…' : 'Selecciona un trabajador'}
                    </option>
                    {candidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.first_name} {candidate.last_name} — {candidate.jobs_today}{' '}
                        trabajo(s) hoy
                      </option>
                    ))}
                  </Select>

                  <Button type="submit" loading={busy} disabled={!assignForm.staffId} className="w-full">
                    <UserPlus className="size-4" aria-hidden="true" />
                    {currentStaff ? 'Reasignar' : 'Asignar trabajador'}
                  </Button>
                  <p className="text-xs text-text-subtle">
                    Solo aparecen trabajadores verificados, activos y habilitados para este servicio
                    en la zona. Se ordenan por menor carga del día.
                  </p>
                </form>
              )}
            </div>
          </Card>

          {/* Seguimiento */}
          <Card>
            <CardHeader title="Seguimiento" />
            <div className="p-5">
              <StatusTimeline steps={timeline} />
            </div>
          </Card>

          {/* Corrección manual de estado */}
          {availableTransitions?.length > 0 && (
            <Card>
              <CardHeader
                title="Cambiar estado"
                description="Solo cuando la realidad no coincide con lo que registró el trabajador."
              />
              <form onSubmit={handleStatusChange} className="space-y-3 p-5">
                <Select
                  value={statusForm.status}
                  onChange={(event) => setStatusForm({ ...statusForm, status: event.target.value })}
                  aria-label="Nuevo estado"
                >
                  <option value="">Selecciona el nuevo estado</option>
                  {availableTransitions.map((transition) => (
                    <option key={transition.to} value={transition.to}>
                      {transition.label}
                    </option>
                  ))}
                </Select>
                <Textarea
                  placeholder="Motivo del cambio (queda en el historial)"
                  value={statusForm.note}
                  onChange={(event) => setStatusForm({ ...statusForm, note: event.target.value })}
                  rows={2}
                />
                <Button type="submit" variant="outline" loading={busy} disabled={!statusForm.status}>
                  Aplicar cambio
                </Button>
              </form>
            </Card>
          )}

          {/* Incidencias */}
          {incidents?.length > 0 && (
            <Card>
              <CardHeader title="Incidencias" />
              <ul className="divide-y divide-border p-5">
                {incidents.map((incident) => (
                  <li key={incident.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cx(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          incident.severity === 'HIGH'
                            ? 'bg-danger-soft text-danger'
                            : 'bg-warning-soft text-warning',
                        )}
                      >
                        {incident.category}
                      </span>
                      {/* La gravedad es de Operaciones: si nadie la puso, se dice. */}
                      <span className="text-xs text-text-muted">
                        {incident.severity
                          ? `Gravedad ${SEVERITY_LABELS[incident.severity]}`
                          : 'Sin clasificar'}
                      </span>
                      <span className="text-xs text-text-subtle">
                        {incident.first_name} · {formatDateTime(incident.created_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-text">{incident.description}</p>
                    {incident.resolution && (
                      <p className="mt-1 text-sm text-success">Resuelta: {incident.resolution}</p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Auditoría */}
          <Card>
            <CardHeader
              title="Registro de auditoría"
              description="Quién hizo qué sobre esta solicitud."
            />
            <ul className="divide-y divide-border p-5">
              {auditTrail?.slice(0, 12).map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <History className="mt-0.5 size-3.5 shrink-0 text-text-subtle" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text">
                      <span className="font-medium">{entry.action}</span>
                      {entry.first_name && (
                        <span className="text-text-muted">
                          {' '}
                          · {entry.first_name} {entry.last_name}
                        </span>
                      )}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-text-subtle">
                    {formatDateTime(entry.created_at)}
                  </time>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Columna lateral */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Cliente" />
            <div className="p-5">
              <p className="font-medium text-text">{fullName(order.customer)}</p>
              <div className="mt-2 space-y-1.5 text-sm">
                {order.customer?.phone && (
                  <a
                    href={`tel:${order.customer.phone}`}
                    className="flex items-center gap-2 text-text-muted hover:text-forest-700"
                  >
                    <Phone className="size-3.5" aria-hidden="true" />
                    {order.customer.phone}
                  </a>
                )}
                {order.customer?.email && (
                  <a
                    href={`mailto:${order.customer.email}`}
                    className="flex items-center gap-2 text-text-muted hover:text-forest-700"
                  >
                    <Mail className="size-3.5" aria-hidden="true" />
                    {order.customer.email}
                  </a>
                )}
              </div>
              <Link
                to={`/operaciones/clientes/${order.customer?.id}`}
                className="mt-3 inline-block text-sm font-medium text-forest-600 hover:text-forest-700"
              >
                Ver historial del cliente
              </Link>
            </div>
          </Card>

          <Card>
            <CardHeader title="Dirección" />
            <div className="p-5 text-sm">
              <p className="text-text">
                {[order.address.streetLine1, order.address.streetLine2].filter(Boolean).join(' y ')}
              </p>
              <p className="text-text-muted">
                {[order.address.neighborhood, order.address.city, order.address.administrativeArea]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {order.address.reference && (
                <p className="mt-1.5 text-text-subtle italic">{order.address.reference}</p>
              )}
              {order.zoneName && (
                <p className="mt-2 text-xs text-text-subtle">Zona: {order.zoneName}</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Importe" />
            <dl className="divide-y divide-border px-5 pb-3">
              <DataRow label="Subtotal">
                <span className="tnum">{money(order.subtotalAmount)}</span>
              </DataRow>
              <DataRow label="Impuesto">
                <span className="tnum">{money(order.taxAmount)}</span>
              </DataRow>
              <DataRow label="Total">
                <span className="font-semibold tnum">{money(order.totalAmount)}</span>
              </DataRow>
              <DataRow label="Pago">{order.paymentStatus}</DataRow>
            </dl>
          </Card>

          {details && order.serviceType === 'CLEANING' && (
            <Card>
              <CardHeader title="Acceso e instrucciones" />
              <dl className="divide-y divide-border px-5 pb-3">
                <DataRow label="Cliente presente">
                  {details.customer_present ? 'Sí' : 'No'}
                </DataRow>
                <DataRow label="Método">{details.access_method}</DataRow>
                {details.hasAccessSecret && (
                  <DataRow label="Código">
                    <span className="inline-flex items-center gap-1 text-text-muted">
                      <ShieldCheck className="size-3.5" aria-hidden="true" />
                      Cifrado
                    </span>
                  </DataRow>
                )}
                {details.access_instructions && (
                  <DataRow label="Instrucciones">{details.access_instructions}</DataRow>
                )}
                {details.has_pets && <DataRow label="Mascotas">Sí</DataRow>}
                {details.special_instructions && (
                  <DataRow label="Notas">{details.special_instructions}</DataRow>
                )}
              </dl>
            </Card>
          )}

          {bags?.length > 0 && (
            <Card>
              <CardHeader title="Bolsas" />
              <ul className="divide-y divide-border px-5 pb-3">
                {bags.map((bag) => (
                  <li key={bag.id} className="flex justify-between gap-3 py-2.5 text-sm">
                    <span className="font-mono text-xs text-text-muted">{bag.bag_code}</span>
                    <span className="text-text tnum">
                      {bag.weight ? `${bag.weight} ${bag.weight_unit}` : bag.status}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {assignments?.length > 1 && (
            <Card>
              <CardHeader title="Historial de asignaciones" />
              <ul className="divide-y divide-border px-5 pb-3">
                {assignments.map((assignment) => (
                  <li key={assignment.id} className="py-2.5 text-sm">
                    <p className="text-text">
                      {assignment.first_name} {assignment.last_name}
                    </p>
                    <p className="text-xs text-text-subtle">
                      {assignment.status} · {formatDateTime(assignment.assigned_at)}
                      {assignment.assigned_by_first_name &&
                        ` · por ${assignment.assigned_by_first_name}`}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
