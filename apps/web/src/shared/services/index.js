import { useMemo } from 'react';
import { Sparkles, Shirt, Scissors, Package } from 'lucide-react';
import { useConfig } from '@/shared/config/ConfigContext';

/**
 * Qué puede pedir el cliente, y por dónde entra a pedirlo.
 *
 * Una sola tabla, consumida por los tres sitios que hacen la misma pregunta:
 * la portada, el botón «¿Qué necesitas?» de la cabecera y el modal de selección
 * de servicio. Antes cada uno llevaba su propia lista escrita a mano y por eso
 * se desincronizaban —así es como «Kits» acabó navegando al asistente de
 * reserva de otro servicio—.
 *
 * Los tipos de servicio son los que declara el dominio (`serviceTypes.js` en el
 * backend). Esto no los inventa ni los amplía: les pone nombre de cara al
 * cliente y decide por dónde se entra.
 *
 * PRODUCTS es la excepción y conviene entender por qué: no es un tipo de
 * servicio del dominio ni crea una orden. Es un catálogo que se navega. Aparece
 * en esta tabla porque para el cliente es una opción más del mismo menú, pero
 * lleva `serviceType: null`, y eso es lo que impide que el asistente de reserva
 * intente tratarlo como un servicio reservable.
 *
 * Lo que NO se decide aquí: si un servicio se puede reservar. Eso lo dice el
 * backend en `GET /api/catalog/config` (`implemented` + `active` → `bookable`),
 * y las pantallas lo consultan con `useServiceExperiences`.
 */

/**
 * El asistente de reserva vive en una sola ruta y recibe el servicio por query.
 *
 * Se construye aquí para que ninguna pantalla escriba el nombre del parámetro a
 * mano. `BookingWizard` lee `servicio` (y acepta `service` por compatibilidad
 * con enlaces antiguos).
 */
export function bookingPath(serviceType) {
  return `/reservar?servicio=${serviceType}`;
}

export const SERVICE_EXPERIENCES = Object.freeze([
  {
    code: 'CLEANING',
    serviceType: 'CLEANING',
    slug: 'limpieza',
    label: 'Limpieza',
    short: 'Residencial completa',
    tagline: 'Tu casa al día, la sigas desde donde la sigas.',
    icon: Sparkles,
    path: bookingPath('CLEANING'),
  },
  {
    code: 'LAUNDRY',
    serviceType: 'LAUNDRY',
    slug: 'lavanderia',
    label: 'Lavandería',
    short: 'Ropa impecable',
    tagline: 'Recogemos, lavamos y te la devolvemos doblada.',
    icon: Shirt,
    path: bookingPath('LAUNDRY'),
  },
  {
    /**
     * Antes se llamaba «Kits» y abría el asistente con `servicio=KITS`, que es
     * un tipo de servicio real: el cliente pedía productos y acababa en un flujo
     * de reserva con fecha y franja horaria. Ahora es lo que siempre fue, un
     * catálogo, y por eso `serviceType` es null y la ruta es una página propia.
     */
    code: 'PRODUCTS',
    serviceType: null,
    slug: 'productos',
    label: 'Productos',
    short: 'Insumos de limpieza',
    tagline: 'Los mismos productos que usamos, en tu casa.',
    icon: Package,
    path: '/productos',
  },
  {
    code: 'ALTERATION',
    serviceType: 'ALTERATION',
    slug: 'arreglos',
    label: 'Arreglos',
    short: 'Ajustes y costura',
    tagline: 'Ajustes, cierres y costura para la ropa que ya tienes.',
    icon: Scissors,
    // Sin flujo de reserva todavía: el dominio no sabe crear una orden de
    // arreglo (le falta su máquina de estados). Se refleja en lugar de
    // inventar una pantalla vacía para que las cuatro se parezcan.
    path: null,
  },
]);

const BY_CODE = new Map(SERVICE_EXPERIENCES.map((service) => [service.code, service]));

export function serviceExperience(code) {
  return BY_CODE.get(code) ?? null;
}

/**
 * Las experiencias, ya cruzadas con lo que dice el backend.
 *
 * Une tres cosas que no se pueden mezclar en el código: cómo se presenta la
 * opción (esta tabla), cómo la llama y describe Operaciones (`service_settings`)
 * y si hoy se puede reservar (`bookable`). Lo que Operaciones edita manda sobre
 * el texto por defecto; lo que decide si hay botón de reservar es siempre el
 * backend.
 *
 * PRODUCTS no tiene fila en `service_settings` —no es un servicio— así que
 * conserva sus textos y está siempre disponible: un catálogo no se «reserva».
 */
export function useServiceExperiences() {
  const { serviceTypes } = useConfig();

  return useMemo(() => {
    const byCode = new Map((serviceTypes ?? []).map((entry) => [entry.code, entry]));

    return SERVICE_EXPERIENCES.map((experience) => {
      if (!experience.serviceType) {
        return { ...experience, description: experience.tagline, available: true, displayOrder: 3 };
      }

      const config = byCode.get(experience.serviceType);
      return {
        ...experience,
        // El nombre comercial lo pone Operaciones; si no lo cambió, el nuestro.
        label: config?.label || experience.label,
        description: config?.description || experience.tagline,
        customerInfo: config?.customerInfo ?? null,
        imageUrl: config?.imageUrl ?? null,
        displayOrder: config?.displayOrder ?? 99,
        // `implemented` lo decide el código; `active`, Operaciones. Solo con los
        // dos hay reserva posible, y esa cuenta la hace el backend.
        implemented: config?.implemented ?? false,
        active: config?.active ?? false,
        available: Boolean(config?.bookable) && Boolean(experience.path),
      };
    }).sort((a, b) => a.displayOrder - b.displayOrder);
  }, [serviceTypes]);
}

/** La experiencia de una opción concreta, con la configuración aplicada. */
export function useServiceExperience(code) {
  const experiences = useServiceExperiences();
  return experiences.find((experience) => experience.code === code) ?? null;
}

/**
 * Las opciones que se ofrecen en el selector «¿Qué necesitas?».
 *
 * Son las que el cliente puede empezar hoy: las reservables más el catálogo.
 * Arreglos queda fuera mientras el dominio no sepa crear su orden —ofrecerlo
 * sería prometer algo que la siguiente pantalla no puede cumplir—.
 */
export function useBookableChoices() {
  const experiences = useServiceExperiences();
  return useMemo(() => experiences.filter((experience) => experience.available), [experiences]);
}
