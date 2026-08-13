import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarPlus, Home, Info, Package } from 'lucide-react';
import { useApiQuery } from '@/shared/api/useApiQuery';
import { useConfig } from '@/shared/config/ConfigContext';
import {
  Alert,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Eyebrow,
  PageHeader,
  Spinner,
} from '@/shared/ui';
import { ServiceCard } from '@/shared/ui/ServiceCard';
import { useServiceExperience, ordersPath } from '@/shared/services';
import WhatsAppButton from '@/shared/ui/WhatsAppButton';

/**
 * Portada de un servicio dentro de la aplicación.
 *
 * Una sola pantalla para los tres: lo que cambia es el vocabulario, las
 * acciones y el bloque propio de cada uno. Tres copias de este archivo con
 * distinto texto habrían sido tres sitios donde arreglar el mismo fallo.
 */
export default function ServiceOverviewPage({ serviceType }) {
  const experience = useServiceExperience(serviceType);
  const { money } = useConfig();

  const params = useMemo(() => ({ serviceType, limit: 5 }), [serviceType]);
  const ordersQuery = useApiQuery('/customer/orders', { params });
  const orders = ordersQuery.data?.data ?? [];
  const activos = orders.filter((order) => !order.isTerminal);

  if (!experience) return null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={experience.label}
        title={experience.description}
        action={
          experience.bookingPath ? (
            <ButtonLink as={Link} to={experience.bookingPath} variant="accent">
              <CalendarPlus className="size-4" aria-hidden="true" />
              Reservar {experience.article}
            </ButtonLink>
          ) : null
        }
      />

      {ordersQuery.error && <Alert tone="danger">{ordersQuery.error}</Alert>}

      {/* Un servicio que no se puede reservar lo dice, y dice por qué. */}
      {!experience.bookable && (
        <Alert
          tone="info"
          title={experience.implemented ? 'Ahora mismo no lo estamos ofreciendo' : 'Todavía no se puede reservar aquí'}
        >
          {experience.implemented ? (
            <>Volverá a estar disponible en cuanto reabramos este servicio.</>
          ) : (
            <>
              Estamos terminando este servicio dentro de la aplicación. Mientras tanto, escríbenos y
              lo coordinamos contigo.
            </>
          )}
          <div className="mt-3">
            <WhatsAppButton
              size="sm"
              label="Escribirnos"
              message={`Hola, quiero información sobre ${experience.label.toLowerCase()}.`}
            />
          </div>
        </Alert>
      )}

      {experience.customerInfo && (
        <Card>
          <CardHeader title="Cómo funciona" />
          <p className="px-5 pb-5 text-sm leading-relaxed whitespace-pre-line text-text-muted">
            {experience.customerInfo}
          </p>
        </Card>
      )}

      {/* Bloque propio del servicio */}
      {serviceType === 'CLEANING' && <HomeShortcut />}
      {serviceType === 'LAUNDRY' && <LaundryHint />}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <Eyebrow>{serviceType === 'LAUNDRY' ? 'Tus pedidos' : 'Tus reservas'}</Eyebrow>
          <Link
            to={ordersPath(serviceType)}
            className="flex items-center gap-1 text-sm font-medium text-service-strong hover:opacity-80"
          >
            Ver todo
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        {ordersQuery.loading ? (
          <Spinner />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={serviceType === 'LAUNDRY' ? Package : CalendarPlus}
            title={`Todavía no tienes ${serviceType === 'LAUNDRY' ? 'pedidos' : 'reservas'} de ${experience.label.toLowerCase()}`}
            description={experience.tagline}
            action={
              experience.bookingPath ? (
                <ButtonLink as={Link} to={experience.bookingPath} variant="accent">
                  Reservar {experience.article}
                </ButtonLink>
              ) : null
            }
          />
        ) : (
          <div className="space-y-3">
            {(activos.length > 0 ? activos : orders).map((order) => (
              <ServiceCard key={order.id} order={order} to={`/servicios/${order.id}`} money={money} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Los datos del hogar viven en las direcciones; aquí solo se entra a ellos. */
function HomeShortcut() {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-service-soft text-service-strong">
          <Home className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-text">Los datos de tu casa</p>
          <p className="mt-0.5 text-sm text-text-muted">
            Habitaciones, baños, mascotas y cómo se entra. Se guardan en cada dirección y rellenan
            tu próxima reserva.
          </p>
        </div>
      </div>
      <ButtonLink as={Link} to="/limpieza/hogar" variant="outline" size="sm">
        Revisar
      </ButtonLink>
    </Card>
  );
}

function LaundryHint() {
  return (
    <Card className="flex items-start gap-3 p-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-service-soft text-service-strong">
        <Info className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-text">Cada bolsa lleva su código</p>
        <p className="mt-0.5 text-sm text-text-muted">
          Al recoger tu ropa se registra bolsa por bolsa, con un código derivado de tu pedido. Puedes
          seguirlas desde el detalle mientras se lavan, se secan y vuelven.
        </p>
      </div>
    </Card>
  );
}
