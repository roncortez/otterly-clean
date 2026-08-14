/**
 * Formateo de fechas y textos.
 *
 * Todo pasa por el locale de la región; no hay meses ni días escritos a mano.
 */

const DEFAULT_LOCALE = 'es-EC';

/** Convierte 'AAAA-MM-DD' o Date en Date local, sin desplazamiento de zona. */
export function toLocalDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  // Marca de tiempo en milisegundos (`Date.now()`, como la del borrador de
  // reserva). Sin esto acababa en `new Date("1755130000000")`, que es fecha
  // inválida, y quien la formateaba se quedaba sin texto: el aviso de borrador
  // decía "Guardamos lo que habías empezado ." con el hueco a la vista.
  if (typeof value === 'number') return new Date(value);

  const iso = String(value);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  if (dateOnly) {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value, locale = DEFAULT_LOCALE, options) {
  const date = toLocalDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(locale, options ?? { day: 'numeric', month: 'long' }).format(date);
}

export function formatLongDate(value, locale = DEFAULT_LOCALE) {
  return formatDate(value, locale, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatDateTime(value, locale = DEFAULT_LOCALE) {
  const date = toLocalDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatTime(value, locale = DEFAULT_LOCALE) {
  if (!value) return '';
  // Las horas llegan como 'HH:MM:SS' desde PostgreSQL.
  const [hours, minutes] = String(value).split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
}

/** "8:00 a. m. – 12:00 p. m." */
export function formatTimeWindow(start, end, locale = DEFAULT_LOCALE) {
  if (!start) return '—';
  return `${formatTime(start, locale)} – ${formatTime(end, locale)}`;
}

/** "hace 5 minutos", "en 2 días" */
export function formatRelative(value, locale = DEFAULT_LOCALE) {
  const date = toLocalDate(value);
  if (!date) return '';

  const diffMs = date.getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const units = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];

  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) {
      return formatter.format(Math.round(diffMs / ms), unit);
    }
  }
  return 'ahora mismo';
}

export function isToday(value) {
  const date = toLocalDate(value);
  if (!date) return false;
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/** Fecha en formato 'AAAA-MM-DD' respetando la zona local. */
export function toDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(days, from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * Dinero en formularios de administración.
 *
 * El backend guarda enteros en centavos y nunca coma flotante. Estas dos
 * funciones son el único punto donde se hace la conversión, para que ningún
 * formulario acabe enviando 11.0000000002 como precio por hora.
 */
export function centsToInput(cents) {
  if (cents === null || cents === undefined || cents === '') return '';
  return (Number(cents) / 100).toFixed(2);
}

/** Devuelve null si el texto no es un importe válido. */
export function inputToCents(value) {
  if (value === '' || value === null || value === undefined) return null;
  const amount = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

/**
 * Cantidad con su unidad, en singular o plural.
 *
 * "1 baños" delata que el texto lo escribió una plantilla y no una persona, y
 * aparece justo donde el cliente lee lo que va a pagar.
 */
export function counted(value, singular, plural) {
  return `${value} ${Number(value) === 1 ? singular : plural}`;
}

/** Dirección en una línea, para listados. */
export function shortAddress(address) {
  if (!address) return '—';
  return [address.streetLine1 ?? address.street_line1, address.neighborhood ?? address.neighborhood]
    .filter(Boolean)
    .join(' · ');
}

export function fullName(person) {
  if (!person) return '';
  return [person.firstName ?? person.first_name, person.lastName ?? person.last_name]
    .filter(Boolean)
    .join(' ');
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
