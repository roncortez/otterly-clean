'use strict';

/**
 * Que constituye el perfil de limpieza de un lugar.
 *
 * Un lugar es una direccion del cliente mas lo que hay que saber para limpiarla:
 * cuantas habitaciones tiene, cuantos banos, como se entra, si hay mascotas. Eso
 * describe el sitio y no cambia de una visita a la siguiente.
 *
 * Frente a eso, una reserva concreta pide otras cosas: que tipo de limpieza, que
 * areas priorizar hoy, si el cliente estara en casa, que fragancia quiere. Eso es
 * de la visita y se pregunta cada vez.
 *
 * La regla que este modulo hace cumplir:
 *
 *   **un dato estable del lugar no se vuelve a preguntar en cada reserva.**
 *
 * Y por eso vive aqui y no repartido entre el formulario del lugar, el asistente
 * de reserva y la creacion de la orden: los tres hablan el mismo idioma porque
 * los tres leen esta tabla.
 *
 * La orden guarda una **copia**, no una referencia (ver `cleaning_details`):
 * cambiar manana los datos del lugar no reescribe lo que se acordo en una
 * reserva pasada.
 *
 * PROCEDENCIA: este modulo es el `domain/cleaning/homeProfile.js` de
 * `feat/maplibre-geoapify`, portado a la entidad que sobrevive a la integracion.
 * Alli el perfil colgaba de la direccion (1:1, `address_cleaning_profiles`); aqui
 * cuelga del lugar (`properties`), que es lo que permite tener varios por cliente
 * y uno predeterminado. La correccion que traia -no rellenar con ceros lo que la
 * peticion no menciona- es la razon de portarlo y se conserva entera.
 */

/**
 * Los datos estables del lugar.
 *
 *   `key`      — como se llama en la API (cuerpo de la reserva y del lugar).
 *   `column`   — columna en `properties`.
 *   `detail`   — campo equivalente en el detalle de la orden (`cleaning_details`).
 *   `fallback` — que vale si no lo sabemos ni por el lugar ni por la peticion.
 *
 * `specialInstructions` se guarda en `properties.notes`: son el mismo dato con
 * dos nombres heredados (las instrucciones fijas del sitio, "el timbre no
 * funciona, llamar al llegar"). Se unifican aqui en lugar de dejar que cada capa
 * invente el suyo.
 */
const PLACE_FIELDS = Object.freeze([
  { key: 'propertyType', column: 'property_type', detail: 'propertyType', fallback: 'APARTMENT' },
  { key: 'bedrooms', column: 'bedrooms', detail: 'bedrooms', fallback: 0, numeric: true },
  { key: 'bathrooms', column: 'bathrooms', detail: 'bathrooms', fallback: 0, numeric: true },
  { key: 'areaValue', column: 'area_value', detail: 'areaValue', fallback: null, numeric: true },
  { key: 'areaUnit', column: 'area_unit', detail: 'areaUnit', fallback: null },
  { key: 'hasPets', column: 'has_pets', detail: 'hasPets', fallback: false },
  { key: 'pets', column: 'pets', detail: 'pets', fallback: [] },
  { key: 'petInstructions', column: 'pet_instructions', detail: 'petInstructions', fallback: null },
  {
    key: 'accessMethod',
    column: 'access_method',
    detail: 'accessMethod',
    fallback: 'CUSTOMER_OPENS',
  },
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
  // Lo delicado que hay en la casa (el jarron de la entrada, el parquet) es del
  // sitio, no del dia: se pregunta una vez y se hereda.
  { key: 'delicateItems', column: 'delicate_items', detail: 'delicateItems', fallback: null },
  {
    key: 'specialInstructions',
    column: 'notes',
    detail: 'specialInstructions',
    fallback: null,
  },
]);

/**
 * Lo que se pregunta en cada reserva porque cambia de una visita a otra.
 *
 * Se declara aqui aunque este modulo no lo escriba: es la otra mitad de la
 * frontera, y tenerla escrita es lo que permite comprobar que ningun campo se
 * queda en tierra de nadie (ver tests/domain.test.js).
 *
 * `customerPresent` y `petsSecured` estan aqui y no arriba a proposito: son
 * respuestas sobre ESTE dia ("¿estaras en casa el martes?"), no propiedades del
 * inmueble, aunque la tabla `properties` guarde un valor por defecto para
 * proponerlos.
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
]);

/** El secreto de acceso no viaja como los demas: se cifra y nunca vuelve. */
const ACCESS_SECRET = Object.freeze({
  key: 'accessSecret',
  column: 'access_code',
  detail: 'accessSecretEncrypted',
});

/** Formas de entrar que necesitan un dato secreto guardado. */
const ACCESS_METHODS_WITH_SECRET = Object.freeze(['KEY', 'DOOR_CODE', 'LOCKBOX']);

const PLACE_KEYS = Object.freeze(PLACE_FIELDS.map((field) => field.key));
const PLACE_DETAIL_KEYS = Object.freeze(PLACE_FIELDS.map((field) => field.detail));

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
 * Columnas que hay que escribir en el lugar, a partir de un cuerpo de peticion.
 *
 * Solo lo que viene: un campo ausente se deja fuera y el repositorio no lo toca.
 * Es lo que permite que la reserva aporte lo que pregunta y la pantalla del lugar
 * lo que muestra sin que ninguna borre lo que guardo la otra.
 */
function placeFieldsToColumns(payload = {}) {
  const columns = {};
  for (const field of PLACE_FIELDS) {
    if (payload[field.key] !== undefined) columns[field.column] = payload[field.key];
  }
  return columns;
}

/**
 * Los datos estables ya resueltos, listos para la foto de la orden.
 *
 * Precedencia: lo que el cliente envia en esta reserva, luego lo que ya sabemos
 * del lugar, y por ultimo el valor por defecto. Ese orden es justo lo que hace
 * que no haya que repreguntar: no enviar un campo significa "sigue siendo como
 * te dije", no "empieza de cero" —que es lo que pasaba antes, cuando un `?? 0`
 * convertia el silencio en una casa sin banos—.
 */
function resolvePlaceFields({ payload = {}, place = null, areaUnit = null } = {}) {
  const resolved = {};

  for (const field of PLACE_FIELDS) {
    const fromPayload = payload[field.key];
    const fromPlace = place ? place[field.column] : undefined;

    let value = fromPayload !== undefined ? fromPayload : fromPlace;
    if (value === undefined || value === null) value = field.fallback;
    if (field.numeric && value !== null) value = toNumber(value);

    resolved[field.detail] = value;
  }

  // La unidad de area la manda la region cuando hay medida y nadie dijo cual.
  if (resolved.areaValue !== null && !resolved.areaUnit) resolved.areaUnit = areaUnit;

  return resolved;
}

/**
 * Si con este lugar se puede reservar sin volver a preguntar nada del sitio.
 *
 * Se mide por los banos y no por un campo "completado": una fila puede existir
 * con todo a cero porque una reserva antigua la creo de paso, y un lugar sin
 * banos no es uno a medio describir, es uno que nadie ha descrito. Las
 * habitaciones no sirven para esto —una suite tiene cero—.
 */
function isPlaceProfileComplete(place) {
  if (!place) return false;
  return toNumber(place.bathrooms) >= 1;
}

module.exports = {
  PLACE_FIELDS,
  PLACE_KEYS,
  PLACE_DETAIL_KEYS,
  VISIT_FIELDS,
  ACCESS_SECRET,
  ACCESS_METHODS_WITH_SECRET,
  needsAccessSecret,
  placeFieldsToColumns,
  resolvePlaceFields,
  isPlaceProfileComplete,
};
