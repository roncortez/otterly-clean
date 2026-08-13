import { useMemo } from 'react';
import {
  Sparkles,
  Shirt,
  Scissors,
  CalendarPlus,
  Home,
  Package,
  MapPin,
  ListChecks,
  UserRound,
  DoorOpen,
} from 'lucide-react';
import { useConfig } from '@/shared/config/ConfigContext';

/**
 * Dónde está el cliente y qué puede hacer ahí.
 *
 * La aplicación del cliente tiene cuatro contextos y solo cuatro: su cuenta y
 * los tres servicios. Comparten sesión, direcciones, historial y componentes —no
 * son tres aplicaciones—, pero cada uno tiene su vocabulario, sus acciones y su
 * color, y todo eso vive aquí, en una tabla, en lugar de repartido por las
 * pantallas.
 *
 * Esa distinción es también la de la navegación, y por eso se declara una sola
 * vez:
 *
 *   **cuenta** → lo que no pertenece a ningún servicio: dónde vives, todo lo que
 *   has pedido, quién eres.
 *   **servicio** → lo que solo tiene sentido dentro de él: reservar una
 *   limpieza, los espacios que limpiamos, tus pedidos de lavandería.
 *
 * Ninguna opción aparece en los dos niveles. Direcciones es de la cuenta porque
 * una dirección sirve para limpiar, para recoger ropa y para lo que venga; los
 * espacios son de limpieza porque solo limpieza necesita saber cuántos baños
 * tiene un lugar.
 *
 * Los tipos de servicio son los mismos tres que declara el dominio
 * (`serviceTypes.js` en el backend). Esto no los inventa ni los amplía: les pone
 * nombre de cara al cliente y decide por dónde se entra.
 *
 * Lo que NO se decide aquí: si un servicio se puede reservar. Eso lo dice el
 * backend en `GET /api/catalog/config` (`implemented` + `active` → `bookable`),
 * y las pantallas lo consultan con `useServiceExperiences`.
 */

/**
 * La cuenta: el contexto al que se vuelve cuando no estás dentro de un servicio.
 *
 * `code: null` no es un hueco, es lo que significa: aquí no hay servicio, y por
 * eso el acento vuelve al verde de la marca (ver `--service` en index.css).
 */
export const ACCOUNT_CONTEXT = Object.freeze({
  code: null,
  slug: 'cuenta',
  path: '/inicio',
  label: 'Mi cuenta',
  icon: UserRound,
  nav: [
    { to: '/inicio', label: 'Inicio', icon: Home, end: true },
    { to: '/direcciones', label: 'Direcciones', icon: MapPin },
    { to: '/servicios', label: 'Mis servicios', icon: ListChecks },
  ],
});

/** Rutas por servicio. El slug va en español porque es una URL que se lee. */
export const SERVICE_EXPERIENCES = Object.freeze([
  {
    code: 'CLEANING',
    slug: 'limpieza',
    path: '/limpieza',
    label: 'Limpieza',
    // Se usa en títulos: "Reservar una limpieza".
    article: 'una limpieza',
    tagline: 'Tu casa al día, la sigas desde donde la sigas.',
    icon: Sparkles,
    /**
     * "Mis espacios" y no "Mi hogar": una persona tiene su departamento, la casa
     * de sus padres y a veces una oficina, y el singular decía justo lo
     * contrario. Direcciones no está aquí: es de la cuenta.
     */
    nav: [
      { to: '/limpieza', label: 'Resumen', icon: Home, end: true },
      { to: '/limpieza/reservar', label: 'Reservar', icon: CalendarPlus },
      { to: '/limpieza/reservas', label: 'Mis reservas', icon: ListChecks },
      { to: '/limpieza/espacios', label: 'Mis espacios', icon: DoorOpen },
    ],
  },
  {
    code: 'LAUNDRY',
    slug: 'lavanderia',
    path: '/lavanderia',
    label: 'Lavandería',
    article: 'una recogida',
    tagline: 'Recogemos, lavamos y te la devolvemos doblada.',
    icon: Shirt,
    /**
     * Lavandería usa la dirección y nada más: recogemos donde vives. No
     * pregunta cuántas habitaciones tiene la casa ni cómo se entra, porque no
     * necesita entrar.
     */
    nav: [
      { to: '/lavanderia', label: 'Resumen', icon: Home, end: true },
      { to: '/lavanderia/recogida', label: 'Pedir recogida', icon: CalendarPlus },
      { to: '/lavanderia/pedidos', label: 'Mis pedidos', icon: Package },
    ],
  },
  {
    code: 'ALTERATION',
    slug: 'arreglos',
    path: '/arreglos',
    label: 'Arreglos',
    article: 'un arreglo',
    tagline: 'Ajustes, cierres y costura para la ropa que ya tienes.',
    icon: Scissors,
    /**
     * Sin flujo de reserva todavía: el dominio no sabe crear una orden de
     * arreglo (le falta su máquina de estados y su cotización). La navegación
     * lo refleja en lugar de inventar pantallas vacías para que las tres se
     * parezcan.
     */
    nav: [{ to: '/arreglos', label: 'Resumen', icon: Home, end: true }],
  },
]);

const BY_CODE = new Map(SERVICE_EXPERIENCES.map((service) => [service.code, service]));
const BY_PATH = [...SERVICE_EXPERIENCES].sort((a, b) => b.path.length - a.path.length);

export function serviceExperience(code) {
  return BY_CODE.get(code) ?? null;
}

/** Servicio al que pertenece una ruta, o null si es una pantalla de la cuenta. */
export function experienceForPath(pathname = '') {
  return BY_PATH.find((service) => pathname === service.path || pathname.startsWith(`${service.path}/`)) ?? null;
}

/**
 * Contexto en el que estás: un servicio o tu cuenta.
 *
 * Siempre devuelve uno. Que "fuera de un servicio" tenga nombre y navegación
 * propios —y no sea la ausencia de contexto— es lo que permite dibujar un solo
 * sistema de navegación en lugar de dos barras que se pisan.
 */
export function navContextForPath(pathname = '') {
  return experienceForPath(pathname) ?? ACCOUNT_CONTEXT;
}

/** Dónde se reserva cada servicio. Null si el flujo todavía no existe. */
export function bookingPath(code) {
  if (code === 'CLEANING') return '/limpieza/reservar';
  if (code === 'LAUNDRY') return '/lavanderia/recogida';
  return null;
}

/** Dónde vive el historial de un servicio. */
export function ordersPath(code) {
  if (code === 'CLEANING') return '/limpieza/reservas';
  if (code === 'LAUNDRY') return '/lavanderia/pedidos';
  return '/servicios';
}

/**
 * Las experiencias, ya cruzadas con lo que dice el backend.
 *
 * Une tres cosas que no se pueden mezclar en el código: cómo se presenta el
 * servicio (esta tabla), cómo lo llama y describe Operaciones
 * (`service_settings`) y si hoy se puede reservar (`bookable`). Lo que
 * Operaciones edita manda sobre el texto por defecto; lo que decide si hay
 * botón de reservar es siempre el backend.
 */
export function useServiceExperiences() {
  const { serviceTypes } = useConfig();

  return useMemo(() => {
    const byCode = new Map((serviceTypes ?? []).map((entry) => [entry.code, entry]));

    return SERVICE_EXPERIENCES.map((experience) => {
      const config = byCode.get(experience.code);
      return {
        ...experience,
        // El nombre comercial lo pone Operaciones; si no lo cambió, el nuestro.
        label: config?.label || experience.label,
        description: config?.description || experience.tagline,
        customerInfo: config?.customerInfo ?? null,
        imageUrl: config?.imageUrl ?? null,
        displayOrder: config?.displayOrder ?? 99,
        // `implemented` lo decide el código; `active`, Operaciones. Solo con
        // los dos hay reserva posible, y esa cuenta la hace el backend.
        implemented: config?.implemented ?? false,
        active: config?.active ?? false,
        bookable: config?.bookable ?? false,
        bookingPath: config?.bookable ? bookingPath(experience.code) : null,
      };
    }).sort((a, b) => a.displayOrder - b.displayOrder);
  }, [serviceTypes]);
}

/** La experiencia de un servicio concreto, con la configuración aplicada. */
export function useServiceExperience(code) {
  const experiences = useServiceExperiences();
  return experiences.find((experience) => experience.code === code) ?? null;
}

/**
 * Los contextos de la aplicación, en el orden en que se presentan: primero la
 * cuenta, después los servicios como los ordena Operaciones.
 *
 * Es la lista que dibuja el conmutador del encabezado. Vive aquí y no en el
 * layout para que el layout no tenga que saber que existe algo llamado "cuenta".
 */
export function useNavContexts() {
  const experiences = useServiceExperiences();
  return useMemo(() => [ACCOUNT_CONTEXT, ...experiences], [experiences]);
}
