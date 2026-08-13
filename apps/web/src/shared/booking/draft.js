/**
 * El borrador de la reserva.
 *
 * Rellenar una reserva de limpieza son más de veinte datos. Perderlos por
 * recargar, por abrir otra pestaña o por tener que iniciar sesión a mitad es la
 * forma más cara de abandonar, así que lo que se ha escrito se guarda y se
 * recupera.
 *
 * DÓNDE. `localStorage`, no `sessionStorage`: el visitante que crea una cuenta
 * puede acabar en otra pestaña (el correo de activación), y quien deja la
 * reserva a medias vuelve al día siguiente. `sessionStorage` muere al cerrar la
 * pestaña y no cubriría ninguno de los dos casos.
 *
 * CUÁNTO. Un día. Pasado ese plazo el borrador se descarta solo, porque una
 * reserva de hace dos semanas ya no describe lo que la persona quiere hoy —y la
 * fecha que eligió probablemente ya pasó—. Un borrador viejo que reaparece en
 * silencio es peor que no tener borrador: parece que la aplicación decide por ti.
 *
 * QUÉ NO SE GUARDA. Los secretos de acceso. Ver `SENSITIVE_FIELDS`.
 */

const STORAGE_KEY = 'otterly.booking.draft.v1';

/** Un día. Ver la nota de arriba sobre por qué caduca. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Lo que nunca toca el disco del navegador.
 *
 * `accessSecret` es el código de la puerta, la clave de la alarma o dónde está
 * escondida la llave (así lo describe `cleaning_details.access_secret_encrypted`).
 * El backend lo cifra con AES-256-GCM y no lo devuelve jamás en una respuesta
 * —ver docs/SECURITY.md—, de modo que escribirlo en `localStorage` en claro,
 * solo para no volver a preguntarlo, tiraría por tierra esa garantía entera:
 * cualquier XSS lo leería, y en un ordenador compartido sobreviviría al cierre
 * de sesión.
 *
 * El precio es que quien empiece una reserva, la deje y vuelva tiene que volver
 * a escribir ese dato. Es el precio correcto: es el único campo del formulario
 * que abre una puerta.
 *
 * `accessInstructions` sí se conserva. No es lo mismo: es la explicación que
 * lee el trabajador ("es la puerta verde, tocar el timbre dos veces") y el
 * sistema ya la trata como texto normal —viaja sin cifrar y se muestra en la
 * orden—. Si alguien escribe ahí un código, el problema está en ese campo y se
 * arregla en el formulario, no ocultándolo aquí.
 */
export const SENSITIVE_FIELDS = Object.freeze(['accessSecret', 'accessCode']);

function isBrowser() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

/** Copia sin los campos sensibles, a cualquier profundidad. */
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_FIELDS.includes(key))
        .map(([key, nested]) => [key, redact(nested)]),
    );
  }
  return value;
}

/**
 * Guarda el borrador.
 *
 * Falla en silencio a propósito: en modo privado de Safari `setItem` lanza al
 * llegar a la cuota, y que reservar reviente por no poder guardar un borrador
 * sería cambiar una molestia por un error.
 */
export function saveDraft(booking) {
  if (!isBrowser() || !booking?.serviceType) return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ savedAt: Date.now(), booking: redact(booking) }),
    );
  } catch {
    // Sin espacio o sin permiso: se sigue sin borrador.
  }
}

/**
 * Devuelve el borrador guardado, o null si no hay, caducó o está corrupto.
 *
 * Un JSON ilegible se trata como "no hay": es lo que es, y arrastrar un error
 * de parseo hasta la pantalla no ayudaría a nadie.
 */
export function loadDraft() {
  if (!isBrowser()) return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.booking?.serviceType) return null;

    if (Date.now() - (parsed.savedAt ?? 0) > MAX_AGE_MS) {
      clearDraft();
      return null;
    }

    return { savedAt: parsed.savedAt, booking: parsed.booking };
  } catch {
    clearDraft();
    return null;
  }
}

export function clearDraft() {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nada que hacer si el navegador no deja escribir.
  }
}
