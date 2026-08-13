'use strict';

/**
 * Que constituye el perfil de limpieza de un espacio.
 *
 * Un espacio es una direccion del cliente mas lo que hay que saber para
 * limpiarla: cuantas habitaciones tiene, cuantos banos, como se entra, si hay
 * mascotas. Eso describe el lugar y no cambia de una visita a la siguiente.
 *
 * Frente a eso, una reserva concreta pide otras cosas: que tipo de limpieza,
 * que areas priorizar hoy, si el cliente estara en casa, cuanto tiempo. Eso es
 * de la visita y se pregunta cada vez.
 *
 * La regla que este modulo hace cumplir:
 *
 *   **un dato estable del espacio no se vuelve a preguntar en cada reserva.**
 *
 * Y por eso vive aqui y no repartido entre el formulario, el asistente de
 * reserva y la creacion de la orden: los tres hablan el mismo idioma porque los
 * tres leen esta tabla. Tres consumidores:
 *
 *   1. `addressService.saveCleaningProfile` — escribir la ficha del espacio.
 *   2. `orderService` — rellenar la foto de la orden con lo que ya sabemos y
 *      recordar lo que el cliente corrija al reservar.
 *   3. `http/schemas.js` — validar; una prueba comprueba que los tres conjuntos
 *      de campos siguen coincidiendo (ver tests/domain.test.js).
 *
 * La orden guarda una **copia**, no una referencia (ver `cleaning_details`):
 * cambiar manana los datos del espacio no reescribe lo que se acordo en una
 * reserva pasada.
 */

/**
 * Los datos estables del espacio.
 *
 *   `key`    — como se llama en la API (cuerpo de la reserva y de la ficha).
 *   `column` — columna en `address_cleaning_profiles`.
 *   `detail` — campo equivalente en el detalle de la orden (`cleaning_details`).
 *   `fallback` — que vale si no lo sabemos ni por la ficha ni por la peticion.
 *
 * `notes` y `specialInstructions` son el mismo dato con dos nombres heredados:
 * las instrucciones fijas del lugar ("el timbre no funciona, llamar al llegar").
 * Se unifican aqui en lugar de dejar que cada capa invente el suyo.
 */
const HOME_FIELDS = Object.freeze([
  { key: 'propertyType', column: 'property_type', detail: 'propertyType', fallback: 'APARTMENT' },
  { key: 'bedrooms', column: 'bedrooms', detail: 'bedrooms', fallback: 0, numeric: true },
  { key: 'bathrooms', column: 'bathrooms', detail: 'bathrooms', fallback: 0, numeric: true },
  { key: 'areaValue', column: 'area_value', detail: 'areaValue', fallback: null, numeric: true },
  { key: 'areaUnit', column: 'area_unit', detail: 'areaUnit', fallback: null },
  { key: 'hasPets', column: 'has_pets', detail: 'hasPets', fallback: false },
  { key: 'pets', column: 'pets', detail: 'pets', fallback: [] },
  { key: 'petInstructions', column: 'pet_instructions', detail: 'petInstructions', fallback: null },
  { key: 'accessMethod', column: 'access_method', detail: 'accessMethod', fallback: 'CUSTOMER_OPENS' },
  {
    key: 'accessInstructions',
    column: 'access_instructions',
    detail: 'accessInstructions',
    fallback: null,
  },
  {
    key: 'parkingInstructions',
    column: 'parking_instructions',
    detail: 'parkingInstructions',
    fallback: null,
  },
  { key: 'notes', column: 'notes', detail: 'specialInstructions', fallback: null },
]);

/**
 * Lo que se pregunta en cada reserva porque cambia de una visita a otra.
 *
 * Se declara aqui aunque este modulo no lo escriba: es la otra mitad de la
 * frontera, y tenerla escrita es lo que permite comprobar que ningun campo se
 * queda en tierra de nadie.
 */
const VISIT_FIELDS = Object.freeze([
  'cleaningType',
  'sizeTier',
  'priorityAreas',
  'suppliesProvidedBy',
  'productPreferences',
  'fragrancePreference',
  'customerPresent',
  'petsSecured',
  'delicateItems',
]);

/** El secreto de acceso no viaja como los demas: se cifra y nunca vuelve. */
const ACCESS_SECRET = Object.freeze({
  key: 'accessSecret',
  column: 'access_secret_encrypted',
  detail: 'accessSecretEncrypted',
});

/** Formas de entrar que necesitan un dato secreto guardado. */
const ACCESS_METHODS_WITH_SECRET = Object.freeze(['KEY', 'DOOR_CODE', 'LOCKBOX']);

const HOME_KEYS = Object.freeze(HOME_FIELDS.map((field) => field.key));
const HOME_DETAIL_KEYS = Object.freeze(HOME_FIELDS.map((field) => field.detail));

function needsAccessSecret(accessMethod) {
  return ACCESS_METHODS_WITH_SECRET.includes(accessMethod);
}

/** Un numero de PostgreSQL llega como cadena; se emite como numero o no se emite. */
function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Columnas que hay que escribir en la ficha, a partir de un cuerpo de peticion.
 *
 * Solo lo que viene: un campo ausente se deja fuera y el repositorio no lo
 * toca. Es lo que permite que la reserva aporte lo que pregunta y la pantalla
 * del espacio lo que muestra sin que ninguna borre lo que guardo la otra.
 */
function homeFieldsToColumns(payload = {}) {
  const columns = {};
  for (const field of HOME_FIELDS) {
    if (payload[field.key] !== undefined) columns[field.column] = payload[field.key];
  }
  return columns;
}

/**
 * Los datos estables ya resueltos, listos para la foto de la orden.
 *
 * Precedencia: lo que el cliente envia en esta reserva, luego lo que ya sabemos
 * del espacio, y por ultimo el valor por defecto. Ese orden es justo lo que
 * hace que no haya que repreguntar: enviar nada significa "sigue siendo como te
 * dije", no "empieza de cero".
 */
function resolveHomeFields({ payload = {}, profile = null, areaUnit = null } = {}) {
  const resolved = {};

  for (const field of HOME_FIELDS) {
    const fromPayload = payload[field.key];
    const fromProfile = profile ? profile[field.column] : undefined;

    let value = fromPayload !== undefined ? fromPayload : fromProfile;
    if (value === undefined || value === null) value = field.fallback;
    if (field.numeric && value !== null) value = toNumber(value);

    resolved[field.detail] = value;
  }

  // La unidad de area la manda la region cuando hay medida y nadie dijo cual.
  if (resolved.areaValue !== null && !resolved.areaUnit) resolved.areaUnit = areaUnit;

  return resolved;
}

/**
 * La ficha del espacio tal como la ve el cliente.
 *
 * Se construye campo a campo en lugar de reenviar la fila: `access_secret_encrypted`
 * no puede salir de aqui ni por descuido. Lo que viaja es si hay algo guardado,
 * no que es.
 */
function projectHomeProfile(profile) {
  if (!profile) return null;

  const projected = {};
  for (const field of HOME_FIELDS) {
    const value = profile[field.column];
    projected[field.key] = field.numeric ? toNumber(value) : (value ?? field.fallback);
  }

  return {
    ...projected,
    pets: profile.pets ?? [],
    hasAccessSecret: Boolean(profile[ACCESS_SECRET.column]),
    /**
     * Si con esta ficha se puede reservar sin volver a preguntar nada del lugar.
     *
     * Se mide por los banos y no por un campo "completado": una fila puede
     * existir con todo a cero porque una reserva antigua la creo de paso, y un
     * espacio sin banos no es un espacio a medio describir, es uno que nadie ha
     * descrito. Las habitaciones no sirven para esto —una suite tiene cero—.
     */
    complete: isHomeProfileComplete(profile),
    updatedAt: profile.updated_at,
  };
}

function isHomeProfileComplete(profile) {
  if (!profile) return false;
  return toNumber(profile.bathrooms) >= 1;
}

module.exports = {
  HOME_FIELDS,
  HOME_KEYS,
  HOME_DETAIL_KEYS,
  VISIT_FIELDS,
  ACCESS_SECRET,
  ACCESS_METHODS_WITH_SECRET,
  needsAccessSecret,
  homeFieldsToColumns,
  resolveHomeFields,
  projectHomeProfile,
  isHomeProfileComplete,
};
