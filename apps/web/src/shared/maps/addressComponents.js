/**
 * Traducción de lo que devuelve Google a los campos del negocio.
 *
 * Es deliberadamente una *propuesta*, no una verdad: Google acierta con la
 * ciudad y la provincia, y falla a menudo con urbanizaciones, conjuntos y
 * numeraciones de Quito. Por eso lo que sale de aquí rellena el formulario y el
 * cliente lo corrige encima.
 *
 * Se admiten las dos formas que devuelve la API moderna:
 *   * `addressComponents` de un `Place`  -> { longText, shortText, types }
 *   * `address_components` del Geocoder  -> { long_name, short_name, types }
 */

function readComponent(component) {
  return {
    long: component.longText ?? component.long_name ?? '',
    short: component.shortText ?? component.short_name ?? '',
    types: component.types ?? [],
  };
}

function pick(components, type) {
  const found = components.find((component) => component.types.includes(type));
  return found?.long ?? '';
}

/**
 * @param {Array} rawComponents componentes tal como llegan de Google
 * @param {string} [formattedAddress] dirección completa, como respaldo
 * @returns {{streetLine1, neighborhood, city, administrativeArea, postalCode}}
 */
export function toAddressFields(rawComponents = [], formattedAddress = '') {
  const components = rawComponents.map(readComponent);

  const streetNumber = pick(components, 'street_number');
  const route = pick(components, 'route');

  // La calle con su número. Si Google no da ninguna de las dos partes se usa la
  // primera línea de la dirección formateada: peor dato, pero mejor que nada
  // que corregir.
  const streetLine1 =
    [route, streetNumber].filter(Boolean).join(' ') || formattedAddress.split(',')[0] || '';

  return {
    streetLine1,
    // En Quito el "sector" suele venir como sublocality; en otras zonas, como
    // neighborhood. Se prueban en orden y se acepta el primero que exista.
    neighborhood:
      pick(components, 'sublocality_level_1') ||
      pick(components, 'sublocality') ||
      pick(components, 'neighborhood'),
    city:
      pick(components, 'locality') ||
      pick(components, 'administrative_area_level_2') ||
      pick(components, 'postal_town'),
    administrativeArea: pick(components, 'administrative_area_level_1'),
    postalCode: pick(components, 'postal_code'),
  };
}

/** Coordenadas de un `Place` o de un resultado del Geocoder, en nuestro formato. */
export function toCoordinates(location) {
  if (!location) return null;
  const latitude = typeof location.lat === 'function' ? location.lat() : location.lat;
  const longitude = typeof location.lng === 'function' ? location.lng() : location.lng;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  // Siete decimales: unos centímetros, que es la precisión que guarda la base.
  return {
    latitude: Number(latitude.toFixed(7)),
    longitude: Number(longitude.toFixed(7)),
  };
}
