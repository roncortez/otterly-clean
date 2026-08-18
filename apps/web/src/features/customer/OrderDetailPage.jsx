import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Headset, MapPin, Package, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import { useConfig } from '@/shared/config/ConfigContext';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  DataRow,
  Field,
  Modal,
  Spinner,
  StatusBadge,
  Textarea,
  Divider,
} from '@/shared/ui';
import { StatusTimeline } from '@/shared/ui/StatusTimeline';
import { MAX_VISIBLE_STEPS } from '@/shared/ui/timelineWindow';
import { SERVICE_LABELS } from '@/shared/ui/ServiceCard';
import WhatsAppButton from '@/shared/ui/WhatsAppButton';
import { counted, formatLongDate, formatTimeWindow } from '@/shared/format';
import { useFragranceLabel } from '@/shared/catalog/options';

/**
 * La fragancia se guarda por codigo (`LAVENDER`), no por su etiqueta, para que
 * renombrarla no reescriba ordenes pasadas. Aqui se traduce; si el catalogo ya
 * no la conoce se muestra el codigo, que es feo pero no pierde el dato.
 */
function FragranceRow({ code }) {
  const label = useFragranceLabel(code);
  if (!label) return null;
  return <DataRow label="Fragancia">{label}</DataRow>;
}

/**
 * Detalle del servicio para el cliente.
 * Responde, en orden: qué pedí, cuándo, quién lo hace, en qué estado va.
 */
export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { money, taxLabel, freeCancellationHours } = useConfig();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  // El seguimiento muestra cinco estados; aquí se puede desplegar el recorrido
  // completo, que es la pantalla donde alguien viene a mirarlo con detalle.
  const [allSteps, setAllSteps] = useState(false);

  const orderQuery = useApiQuery(`/customer/orders/${id}`);
  const detail = orderQuery.data;

  // Las bolsas solo existen en lavandería.
  const bagsQuery = useApiQuery(
    detail?.order.serviceType === 'LAUNDRY' ? `/customer/orders/${id}/bags` : null,
  );
  const bags = bagsQuery.data?.bags ?? [];

  const { busy: cancelling, error: actionError, execute } = useApiAction();
  const error = orderQuery.error ?? actionError;

  async function handleCancel() {
    await execute(() => api.post(`/customer/orders/${id}/cancel`, { reason: reason || null }), {
      onSuccess: () => {
        setCancelOpen(false);
        setReason('');
        orderQuery.reload();
      },
    });
  }

  if (orderQuery.loading) return <Spinner label="Cargando tu servicio" />;
  if (error && !detail) return <Alert tone="danger">{error}</Alert>;
  if (!detail) return null;

  const { order, details, timeline, statusLabel, assignedStaff, availableTransitions } = detail;
  /**
   * Quién puede cancelar y cuándo lo decide la máquina de estados del backend,
   * que responde con las transiciones permitidas para este rol y este estado.
   * Aquí no se replica esa regla: solo se dibuja lo que el servidor permite.
   */
  const canCancel = availableTransitions?.some((transition) => transition.to === 'CANCELLED');
  const isClosed = ['COMPLETED', 'CANCELLED', 'DELIVERED'].includes(order.status);
  const staff = assignedStaff?.[0];

  return (
    /*
      Las secciones entran en cascada. Esta pantalla se abre a propósito, para
      mirar cómo va un servicio concreto, y el orden en que se leen es el orden
      en que están: qué pediste, cómo va, quién lo atiende. La cascada acompaña
      esa lectura.

      La consola de Operaciones tiene una pantalla equivalente y ahí NO se hace:
      un operador abre veinte al día y la cascada sería veinte esperas.
    */
    <div
      className="stagger mx-auto max-w-3xl space-y-6"
      data-service={order.serviceType}
    >
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="group flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text"
      >
        <ArrowLeft className="nudge-back size-4" aria-hidden="true" />
        Volver
      </button>

      {error && <Alert tone="danger">{error}</Alert>}

      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-service-strong uppercase">
            {SERVICE_LABELS[order.serviceType]}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-text">{order.planName}</h1>
          <p className="mt-1 font-mono text-sm text-text-subtle">{order.reference}</p>
        </div>
        <StatusBadge status={order.status} label={statusLabel} />
      </div>

      {/* Timeline: lo primero que el cliente quiere ver */}
      <Card>
        <CardHeader
          title="Seguimiento"
          description={
            order.status === 'COMPLETED' || order.status === 'DELIVERED'
              ? 'Servicio finalizado.'
              : 'Se actualiza automáticamente conforme avanza el servicio.'
          }
        />
        <div className="p-5 sm:p-6">
          {/*
            Se ven cinco estados: los suficientes para saber qué pasó, dónde está
            y qué falta. El resto sigue estando, a un clic, para quien quiera el
            recorrido completo.
          */}
          <StatusTimeline steps={timeline} maxVisible={allSteps ? null : undefined} />
          {timeline.length > MAX_VISIBLE_STEPS && (
            <button
              type="button"
              onClick={() => setAllSteps(!allSteps)}
              className="mt-2 text-sm font-medium text-service-strong hover:underline"
            >
              {allSteps ? 'Ver solo lo cercano' : `Ver los ${timeline.length} estados`}
            </button>
          )}
        </div>
      </Card>

      {/* Profesional asignado */}
      {staff && (
        <Card>
          <CardHeader title="Quién atiende tu servicio" />
          <div className="flex items-center gap-4 p-5 sm:p-6">
            <span className="flex size-14 items-center justify-center rounded-full bg-service-soft text-lg font-semibold text-service-strong">
              {staff.displayName?.[0]}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-text">{staff.displayName}</p>
              {staff.isVerified && (
                <p className="mt-0.5 flex items-center gap-1 text-sm text-success">
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                  Profesional verificado
                </p>
              )}
              {staff.bio && <p className="mt-1.5 text-sm text-text-muted">{staff.bio}</p>}
            </div>
          </div>
        </Card>
      )}

      {/* Cuándo y dónde */}
      <Card>
        <CardHeader title="Detalles" />
        <dl className="divide-y divide-border px-5 pb-3 sm:px-6">
          <DataRow label="Fecha">
            <span className="capitalize">{formatLongDate(order.scheduledDate)}</span>
          </DataRow>
          <DataRow label="Franja horaria">
            {formatTimeWindow(order.scheduledWindowStart, order.scheduledWindowEnd)}
          </DataRow>
          {order.estimatedDurationMinutes && (
            <DataRow label="Duración estimada">{order.estimatedDurationMinutes / 60} horas</DataRow>
          )}
          <DataRow label={order.serviceType === 'LAUNDRY' ? 'Recogida en' : 'Dirección'}>
            <span className="inline-flex items-start gap-1.5 text-right">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-text-subtle" aria-hidden="true" />
              <span>
                {[order.address.streetLine1, order.address.streetLine2].filter(Boolean).join(' y ')}
                <br />
                <span className="text-text-muted">
                  {[order.address.neighborhood, order.address.city].filter(Boolean).join(' · ')}
                </span>
              </span>
            </span>
          </DataRow>
          {order.customerNotes && <DataRow label="Tus notas">{order.customerNotes}</DataRow>}
        </dl>
      </Card>

      {/* Lo que pediste */}
      {details && <ServiceDetails serviceType={order.serviceType} details={details} />}

      {/* Bolsas de lavandería: la trazabilidad física */}
      {order.serviceType === 'LAUNDRY' && bags.length > 0 && (
        <Card>
          <CardHeader
            title="Tus bolsas"
            description="Cada bolsa lleva un código propio para que nada se mezcle."
          />
          <div className="space-y-2 p-5 sm:p-6">
            {bags.map((bag) => (
              <div
                key={bag.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-surface-sunken px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Package className="size-4 shrink-0 text-text-subtle" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-text">{bag.label ?? 'Bolsa'}</p>
                    <p className="font-mono text-xs text-text-subtle">{bag.bag_code}</p>
                  </div>
                </div>
                <div className="text-right">
                  {bag.weight && (
                    <p className="text-sm font-medium text-text tnum">
                      {bag.weight} {bag.weight_unit}
                    </p>
                  )}
                  {bag.item_count && (
                    <p className="text-xs text-text-subtle">{bag.item_count} prendas</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Precio */}
      <Card>
        <CardHeader title="Precio" />
        <dl className="divide-y divide-border px-5 pb-3 sm:px-6">
          {order.priceBreakdown?.lines?.map((line, index) => (
            <DataRow key={`${line.code}-${index}`} label={line.label}>
              <span className="tnum">{money(line.amount)}</span>
            </DataRow>
          ))}
          <DataRow label="Subtotal">
            <span className="tnum">{money(order.subtotalAmount)}</span>
          </DataRow>
          {order.taxAmount > 0 && (
            <DataRow label={`${taxLabel} (${Math.round(order.taxRate * 100)}%)`}>
              <span className="tnum">{money(order.taxAmount)}</span>
            </DataRow>
          )}
          <DataRow label="Total">
            <span className="text-base font-semibold text-forest-700 tnum">
              {money(order.totalAmount)}
            </span>
          </DataRow>
        </dl>
      </Card>

      {canCancel && (
        <>
          <Divider />
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
            <p className="text-sm text-text-muted">
              Puedes cancelar sin costo hasta {freeCancellationHours} horas antes.
            </p>
            <Button variant="danger" onClick={() => setCancelOpen(true)}>
              <XCircle className="size-4" aria-hidden="true" />
              Cancelar servicio
            </Button>
          </div>
        </>
      )}

      {/*
        Pasado el punto de no retorno, el cliente no se queda sin salida: se le
        dice a dónde acudir. Cancelar deja de ser un botón porque ya hay alguien
        en camino, y eso lo gestiona Operaciones —que además puede reagendar en
        lugar de perder el servicio—.
      */}
      {!canCancel && !isClosed && (
        <>
          <Divider />
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-semibold text-text">
                <Headset className="size-4 text-text-subtle" aria-hidden="true" />
                ¿Necesitas cambiar algo?
              </p>
              <p className="mt-1 text-sm text-text-muted">
                Tu servicio ya está en marcha, así que la cancelación o el cambio de fecha los
                gestiona nuestro equipo. Escríbenos y lo resolvemos contigo.
              </p>
            </div>
            <WhatsAppButton
              size="sm"
              label="Hablar con el equipo"
              message={`Hola, necesito ayuda con mi servicio ${order.reference}.`}
            />
          </Card>
        </>
      )}

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="¿Cancelar este servicio?"
        description={`Si faltan menos de ${freeCancellationHours} horas, la cancelación se marca como tardía.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Mejor no
            </Button>
            <Button variant="danger" loading={cancelling} onClick={handleCancel}>
              Sí, cancelar
            </Button>
          </>
        }
      >
        <Field label="¿Por qué lo cancelas?" hint="Opcional, pero nos ayuda a mejorar.">
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Cambio de planes."
          />
        </Field>
      </Modal>
    </div>
  );
}

const CLEANING_TYPE_LABELS = {
  STANDARD: 'Estándar',
  DEEP: 'Profunda',
  MOVE_IN_OUT: 'Mudanza',
  POST_CONSTRUCTION: 'Post obra',
};

const ACCESS_LABELS = {
  CUSTOMER_OPENS: 'Abres tú',
  KEY: 'Llave',
  DOOR_CODE: 'Código de puerta',
  CONCIERGE: 'Portería',
  LOCKBOX: 'Caja de seguridad',
  OTHER: 'Otro',
};

function ServiceDetails({ serviceType, details }) {
  if (serviceType === 'CLEANING') {
    return (
      <Card>
        <CardHeader title="Lo que pediste" />
        <dl className="divide-y divide-border px-5 pb-3 sm:px-6">
          <DataRow label="Tipo">{CLEANING_TYPE_LABELS[details.cleaning_type]}</DataRow>
          <DataRow label="Espacio">
            {counted(details.bedrooms, 'habitación', 'habitaciones')} ·{' '}
            {counted(details.bathrooms, 'baño', 'baños')}
          </DataRow>
          {details.area_value && (
            <DataRow label="Tamaño">
              {details.area_value} {details.area_unit}
            </DataRow>
          )}
          {details.priority_areas?.length > 0 && (
            <DataRow label="Prioridad">{details.priority_areas.join(', ')}</DataRow>
          )}
          <DataRow label="Productos">
            {details.supplies_provided_by === 'COMPANY' ? 'Los llevamos nosotros' : 'Los tuyos'}
          </DataRow>
          <FragranceRow code={details.fragrance_preference} />
          <DataRow label="Estarás en casa">{details.customer_present ? 'Sí' : 'No'}</DataRow>
          <DataRow label="Acceso">{ACCESS_LABELS[details.access_method]}</DataRow>
          {details.hasAccessSecret && (
            <DataRow label="Código de acceso">
              <span className="text-text-muted">Guardado y cifrado</span>
            </DataRow>
          )}
          {details.has_pets && (
            <DataRow label="Mascotas">
              {details.pets?.[0]
                ? `${details.pets[0].count} ${details.pets[0].type}`
                : 'Sí'}
              {details.pets_secured ? ' · en espacio aparte' : ''}
            </DataRow>
          )}
          {details.delicate_items && (
            <DataRow label="Objetos delicados">{details.delicate_items}</DataRow>
          )}
          {/* Lo que valía para todas las visitas de ese lugar el día que reservaste. */}
          {details.special_instructions && (
            <DataRow label="Del lugar">{details.special_instructions}</DataRow>
          )}
        </dl>
      </Card>
    );
  }

  const TEMPERATURE = { COLD: 'Agua fría', WARM: 'Agua tibia', HOT: 'Agua caliente' };
  const DETERGENT = {
    STANDARD: 'Estándar',
    HYPOALLERGENIC: 'Hipoalergénico',
    FRAGRANCE_FREE: 'Sin fragancia',
    CUSTOMER_PROVIDED: 'El tuyo',
  };
  const DRYING = { MACHINE: 'Secadora', HANG_DRY: 'Al aire', MIXED: 'Mixto' };

  return (
    <Card>
      <CardHeader title="Cómo tratamos tu ropa" />
      <dl className="divide-y divide-border px-5 pb-3 sm:px-6">
        {details.estimated_bags && <DataRow label="Bolsas">{details.estimated_bags}</DataRow>}
        {details.actual_weight ? (
          <DataRow label="Peso real">
            <span className="tnum">
              {details.actual_weight} {details.weight_unit}
            </span>
          </DataRow>
        ) : (
          details.estimated_weight && (
            <DataRow label="Peso estimado">
              <span className="tnum">
                {details.estimated_weight} {details.weight_unit}
              </span>
            </DataRow>
          )
        )}
        <DataRow label="Lavado">{TEMPERATURE[details.wash_temperature]}</DataRow>
        <DataRow label="Detergente">{DETERGENT[details.detergent_preference]}</DataRow>
        <FragranceRow code={details.fragrance_code} />
        <DataRow label="Suavizante">{details.use_fabric_softener ? 'Sí' : 'No'}</DataRow>
        <DataRow label="Separar colores">{details.separate_colors ? 'Sí' : 'No'}</DataRow>
        <DataRow label="Secado">{DRYING[details.drying_preference]}</DataRow>
        {details.hang_dry_items && <DataRow label="Se cuelgan">{details.hang_dry_items}</DataRow>}
        {details.delicate_items && <DataRow label="Delicadas">{details.delicate_items}</DataRow>}
        {details.do_not_process_items && (
          <DataRow label="No procesar">
            <span className="text-danger">{details.do_not_process_items}</span>
          </DataRow>
        )}
        {details.pickup_instructions && (
          <DataRow label="Recogida">{details.pickup_instructions}</DataRow>
        )}
      </dl>
    </Card>
  );
}
