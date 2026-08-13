/**
 * Traducción de lo que devuelve el geocodificador a los campos del negocio.
 *
 * Es deliberadamente una *propuesta*, no una verdad: los proveedores aciertan
 * con la ciudad y la provincia, y fallan a menudo con urbanizaciones, conjuntos
 * y numeraciones de Quito. Por eso lo que sale de aquí rellena el formulario y
 * el cliente lo corrige encima.
 *
 * Aquí se concentra la única parte que conoce la forma de la respuesta del
 * proveedor. El resto de la aplicación ve `{ coordinates, fields, placeId }` y
 * no sabe quién los produjo.
 */

/** El primer valor no vacío de una lista de candidatos. */
function firstOf(...values) {
  return values.find((value) => typeof value === 'string' && value.trim() !== '') ?? '';
}

/**
 * Campos de dirección a partir de las propiedades de un resultado.
 *
 * @param {object} properties propiedades tal como llegan del proveedor
 * @returns {{streetLine1: string, neighborhood: string, city: string,
 *            administrativeArea: string, postalCode: string}}
 */
export function toAddressFields(properties = {}) {
  // La calle con su número. Si el proveedor no da ninguna de las dos partes se
  // usa la primera línea de la dirección formateada: peor dato, pero mejor que
  // nada que corregir.
  const streetAndNumber = [properties.street, properties.housenumber].filter(Boolean).join(' ');
  const formattedFirstLine = firstOf(properties.formatted).split(',')[0] ?? '';

  return {
    streetLine1: firstOf(streetAndNumber, properties.address_line1, formattedFirstLine),
    // En Quito el "sector" suele venir como suburb; en otras zonas, como
    // district o quarter. Se prueban en orden y gana el primero que exista.
    neighborhood: firstOf(
      properties.suburb,
      properties.district,
      properties.quarter,
      properties.neighbourhood,
    ),
    city: firstOf(
      properties.city,
      properties.town,
      properties.village,
      properties.municipality,
      properties.county,
    ),
    administrativeArea: firstOf(properties.state, properties.province, properties.region),
    postalCode: firstOf(properties.postcode),
  };
}

/**
 * Coordenadas en nuestro formato, vengan como vengan.
 *
 * Acepta `{latitude, longitude}` (lo nuestro), `{lat, lon}` (el proveedor) y
 * `{lat, lng}` (el mapa), porque los tres aparecen en este flujo y convertir en
 * un solo sitio evita confundir un `lon` con un `lng` a las once de la noche.
 */
export function toCoordinates(source) {
  if (!source) return null;

  const latitude = Number(source.latitude ?? source.lat);
  const longitude = Number(source.longitude ?? source.lon ?? source.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  // Siete decimales: unos centímetros, que es la precisión que guarda la base.
  return {
    latitude: Number(latitude.toFixed(7)),
    longitude: Number(longitude.toFixed(7)),
  };
}

/**
 * Un resultado del proveedor, ya masticado para la interfaz.
 *
 * @returns {{id: string, placeId: string|null, title: string, subtitle: string,
 *            coordinates: {latitude: number, longitude: number},
 *            fields: object}|null} null si el resultado no trae punto, que sin
 *            coordenadas no sirve para lo que se está haciendo aquí.
 */
export function toSuggestion(feature) {
  const properties = feature?.properties ?? feature ?? {};
  const [longitude, latitude] = feature?.geometry?.coordinates ?? [];

  const coordinates = toCoordinates(properties) ?? toCoordinates({ latitude, longitude });
  if (!coordinates) return null;

  const formatted = firstOf(properties.formatted);

  return {
    // El identificador del proveedor sirve de clave de lista; si no lo trae, la
    // coordenada distingue igual de bien un resultado de otro.
    id: firstOf(properties.place_id) || `${coordinates.latitude},${coordinates.longitude}`,
    placeId: firstOf(properties.place_id) || null,
    title: firstOf(properties.address_line1, properties.name, formatted),
    subtitle: firstOf(
      properties.address_line2,
      [properties.city, properties.state, properties.country].filter(Boolean).join(', '),
    ),
    formatted,
    coordinates,
    fields: toAddressFields(properties),
  };
}
