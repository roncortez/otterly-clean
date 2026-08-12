import { useApiQuery } from '@/shared/api/useApiQuery';
import { Alert, Spinner } from '@/shared/ui';
import ServiceSettingsCard from './ServiceSettingsCard';

/**
 * Servicios de la plataforma.
 *
 * Son siempre los mismos tres: limpieza, lavandería y arreglo de prendas. No
 * hay botón de "crear servicio" a propósito — un tipo nuevo necesita máquina de
 * estados, tabla de detalle y flujo de reserva, y eso es código, no una
 * pantalla de configuración.
 */
export default function ServicesSettingsPage() {
  const servicesQuery = useApiQuery('/operations/services');

  if (servicesQuery.loading) return <Spinner label="Cargando servicios" />;
  if (servicesQuery.error) return <Alert tone="danger">{servicesQuery.error}</Alert>;

  const services = servicesQuery.data?.services ?? [];

  return (
    <div className="max-w-4xl space-y-5">
      <Alert tone="info" title="Qué se puede cambiar aquí">
        Si el servicio se ofrece, cómo se presenta al cliente y los parámetros de precio de cada
        plan. Las reglas de cada servicio —sus estados, su flujo y sus validaciones— siguen
        viviendo en el código.
      </Alert>

      {services.map((service) => (
        <ServiceSettingsCard
          key={service.code}
          service={service}
          onSaved={servicesQuery.reload}
        />
      ))}
    </div>
  );
}
