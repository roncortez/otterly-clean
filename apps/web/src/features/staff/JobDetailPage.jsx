import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Phone,
  KeyRound,
  PawPrint,
  AlertTriangle,
  Eye,
  Package,
  Plus,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  DataRow,
  Field,
  Input,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
} from '@/shared/ui';
import { StatusTimeline } from '@/shared/ui/StatusTimeline';
import { SERVICE_LABELS } from '@/shared/ui/ServiceCard';
import { formatLongDate, formatTimeWindow } from '@/shared/format';

/**
 * Detalle del trabajo.
 *
 * La acción principal es un botón grande al fondo, siempre visible: el
 * trabajador suele usar esto de pie, con una mano, y con prisa. El resto de la
 * pantalla es información de consulta.
 */
export default function JobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [accessSecret, setAccessSecret] = useState(null);
  const [showIncident, setShowIncident] = useState(false);
  const [showBagForm, setShowBagForm] = useState(false);

  const [incident, setIncident] = useState({ category: 'OTHER', severity: 'MEDIUM', description: '' });
  const [newBag, setNewBag] = useState({ label: '', weight: '', itemCount: '' });

  const jobQuery = useApiQuery(`/staff/jobs/${id}`);
  const detail = jobQuery.data;

  const bagsQuery = useApiQuery(
    detail?.order.serviceType === 'LAUNDRY' ? `/staff/jobs/${id}/bags` : null,
  );
  const bags = bagsQuery.data?.bags ?? [];

  const { busy, error: actionError, execute } = useApiAction();
  const error = jobQuery.error ?? actionError;

  async function handleAccept() {
    await execute(() => api.post(`/staff/jobs/${id}/accept`), {
      onSuccess: () => {
        setAccessSecret(null);
        jobQuery.reload();
      },
    });
  }

  async function handleTransition(status) {
    await execute(() => api.post(`/staff/jobs/${id}/status`, { status }), {
      onSuccess: jobQuery.reload,
    });
  }

  async function handleRevealSecret() {
    const { ok, result } = await execute(() => api.get(`/staff/jobs/${id}/access-secret`));
    if (ok) setAccessSecret(result.data.accessSecret);
  }

  async function handleReportIncident(event) {
    event.preventDefault();
    await execute(() => api.post(`/staff/jobs/${id}/incidents`, incident), {
      onSuccess: () => {
        setShowIncident(false);
        setIncident({ category: 'OTHER', severity: 'MEDIUM', description: '' });
        jobQuery.reload();
      },
    });
  }

  async function handleAddBag(event) {
    event.preventDefault();
    await execute(
      () =>
        api.post(`/staff/jobs/${id}/bags`, {
          bags: [
            {
              label: newBag.label || null,
              weight: newBag.weight ? Number(newBag.weight) : null,
              weightUnit: newBag.weight ? 'kg' : null,
              itemCount: newBag.itemCount ? Number(newBag.itemCount) : null,
            },
          ],
        }),
      {
        onSuccess: () => {
          setNewBag({ label: '', weight: '', itemCount: '' });
          setShowBagForm(false);
          bagsQuery.reload();
        },
      },
    );
  }

  if (jobQuery.loading) return <Spinner />;
  if (error && !detail) return <Alert tone="danger">{error}</Alert>;
  if (!detail) return null;

  const { order, details, timeline, statusLabel, availableTransitions } = detail;
  const needsAccept = order.status === 'ASSIGNED';
  const primaryAction = availableTransitions?.[0];

  return (
    <div className="space-y-5 pb-32">
      <button
        type="button"
        onClick={() => navigate('/trabajo')}
        className="flex items-center gap-1.5 text-sm font-medium text-text-muted"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Mis trabajos
      </button>

      {error && <Alert tone="danger">{error}</Alert>}

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-text">{SERVICE_LABELS[order.serviceType]}</h1>
          <StatusBadge status={order.status} label={statusLabel} />
        </div>
        <p className="mt-1 text-text-muted capitalize">
          {formatLongDate(order.scheduledDate)} ·{' '}
          {formatTimeWindow(order.scheduledWindowStart, order.scheduledWindowEnd)}
        </p>
        <p className="mt-0.5 font-mono text-xs text-text-subtle">{order.reference}</p>
      </div>

      {/* Dirección: lo primero que necesita para llegar */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-forest-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-text">
              {[order.address.streetLine1, order.address.streetLine2].filter(Boolean).join(' y ')}
            </p>
            <p className="text-sm text-text-muted">
              {[order.address.neighborhood, order.address.city].filter(Boolean).join(' · ')}
            </p>
            {order.address.reference && (
              <p className="mt-1 text-sm text-text-subtle">{order.address.reference}</p>
            )}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                [order.address.streetLine1, order.address.neighborhood, order.address.city]
                  .filter(Boolean)
                  .join(', '),
              )}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm font-medium text-forest-600"
            >
              Abrir en mapas
            </a>
          </div>
        </div>

        {order.customer?.phone && (
          <a
            href={`tel:${order.customer.phone}`}
            className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-sm font-medium text-forest-700"
          >
            <Phone className="size-4" aria-hidden="true" />
            Llamar a {order.customer.firstName}
          </a>
        )}
      </Card>

      {/* Acceso: solo si hay algo que consultar */}
      {details?.hasAccessSecret && (
        <Card className="border-warning/25 bg-warning-soft p-4">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-warning">Acceso al domicilio</p>
              <p className="mt-0.5 text-sm text-warning/90">
                {details.access_method === 'DOOR_CODE'
                  ? 'Hay un código de puerta guardado.'
                  : 'Hay instrucciones de llave guardadas.'}
              </p>

              {accessSecret ? (
                <p className="mt-2 rounded-lg bg-white px-3 py-2 font-mono text-lg font-semibold text-text">
                  {accessSecret}
                </p>
              ) : (
                details.canRevealAccessSecret && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={handleRevealSecret}>
                    <Eye className="size-4" aria-hidden="true" />
                    Ver código
                  </Button>
                )
              )}
              <p className="mt-2 text-xs text-warning/80">
                Queda registrado que lo consultaste. No lo compartas con nadie.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Instrucciones del servicio */}
      {order.serviceType === 'CLEANING' && details && (
        <Card>
          <CardHeader title="El servicio" />
          <dl className="divide-y divide-border px-4 pb-2">
            <DataRow label="Espacio">
              {details.bedrooms} hab · {details.bathrooms} baños
            </DataRow>
            {details.priority_areas?.length > 0 && (
              <DataRow label="Prioridad">{details.priority_areas.join(', ')}</DataRow>
            )}
            <DataRow label="Productos">
              {details.supplies_provided_by === 'COMPANY' ? 'Los llevas tú' : 'Los pone el cliente'}
            </DataRow>
            {details.fragrance_preference && (
              <DataRow label="Fragancia">{details.fragrance_preference}</DataRow>
            )}
            <DataRow label="Cliente en casa">{details.customer_present ? 'Sí' : 'No'}</DataRow>
            {details.access_instructions && (
              <DataRow label="Cómo entrar">{details.access_instructions}</DataRow>
            )}
            {details.parking_instructions && (
              <DataRow label="Estacionamiento">{details.parking_instructions}</DataRow>
            )}
            {details.delicate_items && (
              <DataRow label="Cuidado con">{details.delicate_items}</DataRow>
            )}
            {details.special_instructions && (
              <DataRow label="Instrucciones">{details.special_instructions}</DataRow>
            )}
          </dl>

          {details.has_pets && (
            <div className="mx-4 mb-4 rounded-xl bg-sage-100 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-sage-700">
                <PawPrint className="size-4" aria-hidden="true" />
                Hay mascotas
              </p>
              {details.pets?.[0] && (
                <p className="mt-0.5 text-sm text-sage-700/90">
                  {details.pets[0].count} {details.pets[0].type}
                  {details.pets_secured ? ' · estarán en un espacio aparte' : ''}
                </p>
              )}
              {details.pet_instructions && (
                <p className="mt-1 text-sm text-sage-700/90">{details.pet_instructions}</p>
              )}
            </div>
          )}
        </Card>
      )}

      {order.serviceType === 'LAUNDRY' && details && (
        <Card>
          <CardHeader title="Cómo tratar la ropa" />
          <dl className="divide-y divide-border px-4 pb-2">
            <DataRow label="Temperatura">{details.wash_temperature}</DataRow>
            <DataRow label="Detergente">{details.detergent_preference}</DataRow>
            <DataRow label="Suavizante">{details.use_fabric_softener ? 'Sí' : 'No'}</DataRow>
            <DataRow label="Cloro">{details.use_bleach ? 'Permitido' : 'No usar'}</DataRow>
            <DataRow label="Separar colores">{details.separate_colors ? 'Sí' : 'No'}</DataRow>
            <DataRow label="Secado">{details.drying_preference}</DataRow>
            {details.hang_dry_items && <DataRow label="Colgar">{details.hang_dry_items}</DataRow>}
            {details.delicate_items && <DataRow label="Delicadas">{details.delicate_items}</DataRow>}
            {details.pickup_instructions && (
              <DataRow label="Recogida">{details.pickup_instructions}</DataRow>
            )}
          </dl>

          {details.do_not_process_items && (
            <div className="mx-4 mb-4 rounded-xl border border-danger/25 bg-danger-soft p-3">
              <p className="text-sm font-medium text-danger">No procesar</p>
              <p className="mt-0.5 text-sm text-danger/90">{details.do_not_process_items}</p>
            </div>
          )}
        </Card>
      )}

      {/* Bolsas */}
      {order.serviceType === 'LAUNDRY' && (
        <Card>
          <CardHeader
            title="Bolsas"
            description="Registra cada bolsa para que no se mezcle con otro pedido."
          />
          <div className="space-y-2 p-4">
            {bags.map((bag) => (
              <div
                key={bag.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-surface-sunken px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Package className="size-4 shrink-0 text-text-subtle" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">
                      {bag.label ?? 'Bolsa'}
                    </p>
                    <p className="font-mono text-xs text-text-subtle">{bag.bag_code}</p>
                  </div>
                </div>
                {bag.weight && (
                  <span className="shrink-0 text-sm text-text tnum">
                    {bag.weight} {bag.weight_unit}
                  </span>
                )}
              </div>
            ))}

            {showBagForm ? (
              <form onSubmit={handleAddBag} className="space-y-3 rounded-xl border border-border p-3">
                <Field label="Etiqueta">
                  <Input
                    value={newBag.label}
                    onChange={(event) => setNewBag({ ...newBag, label: event.target.value })}
                    placeholder="Ropa de color"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Peso (kg)">
                    <Input
                      type="number"
                      step="0.1"
                      value={newBag.weight}
                      onChange={(event) => setNewBag({ ...newBag, weight: event.target.value })}
                    />
                  </Field>
                  <Field label="Prendas">
                    <Input
                      type="number"
                      value={newBag.itemCount}
                      onChange={(event) => setNewBag({ ...newBag, itemCount: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" loading={busy}>
                    Registrar bolsa
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowBagForm(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowBagForm(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong py-3 text-sm font-medium text-text-muted"
              >
                <Plus className="size-4" aria-hidden="true" />
                Registrar una bolsa
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Seguimiento */}
      <Card>
        <CardHeader title="Progreso" />
        <div className="p-4">
          <StatusTimeline steps={timeline} />
        </div>
      </Card>

      {/* Incidencia */}
      {showIncident ? (
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-text">Reportar una incidencia</h2>
          <form onSubmit={handleReportIncident} className="space-y-3">
            <Field label="¿Qué pasó?">
              <Select
                value={incident.category}
                onChange={(event) => setIncident({ ...incident, category: event.target.value })}
              >
                <option value="NO_ACCESS">No pude entrar</option>
                <option value="CUSTOMER_ABSENT">El cliente no estaba</option>
                <option value="DAMAGE">Algo se dañó</option>
                <option value="MISSING_ITEM">Falta una prenda</option>
                <option value="UNSAFE_CONDITIONS">Condiciones inseguras</option>
                <option value="INCOMPLETE_SERVICE">No pude terminar</option>
                <option value="EQUIPMENT">Problema con el equipo</option>
                <option value="OTHER">Otra cosa</option>
              </Select>
            </Field>
            <Field label="Gravedad">
              <Select
                value={incident.severity}
                onChange={(event) => setIncident({ ...incident, severity: event.target.value })}
              >
                <option value="LOW">Baja</option>
                <option value="MEDIUM">Media</option>
                <option value="HIGH">Alta</option>
              </Select>
            </Field>
            <Field label="Cuéntanos qué ocurrió" required>
              <Textarea
                required
                value={incident.description}
                onChange={(event) => setIncident({ ...incident, description: event.target.value })}
                placeholder="La recepción no tenía autorización para dejarme entrar."
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="danger" loading={busy}>
                Enviar reporte
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowIncident(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setShowIncident(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/20 bg-danger-soft py-3 text-sm font-medium text-danger"
        >
          <AlertTriangle className="size-4" aria-hidden="true" />
          Reportar una incidencia
        </button>
      )}

      {/* Acción principal fija: siempre a mano */}
      {(needsAccept || primaryAction) && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface-raised/95 px-4 pt-3 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            {needsAccept ? (
              <Button size="lg" variant="accent" className="w-full" loading={busy} onClick={handleAccept}>
                Confirmar que haré este trabajo
              </Button>
            ) : (
              <Button
                size="lg"
                variant="accent"
                className="w-full"
                loading={busy}
                onClick={() => handleTransition(primaryAction.to)}
              >
                {primaryAction.label}
              </Button>
            )}

            {availableTransitions?.length > 1 && (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {availableTransitions.slice(1).map((transition) => (
                  <button
                    key={transition.to}
                    type="button"
                    disabled={busy}
                    onClick={() => handleTransition(transition.to)}
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted disabled:opacity-50"
                  >
                    {transition.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
