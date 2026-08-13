/**
 * Cliente del geocodificador (Geoapify).
 *
 * Dos operaciones y nada más: buscar un texto y preguntar qué hay en un punto.
 * Devuelven siempre la misma forma —`toSuggestion`— para que la interfaz no
 * distinga de dónde salió una propuesta.
 *
 * Los errores se traducen a códigos propios porque el llamante toma decisiones
 * distintas según el caso: sin clave se esconde el buscador, con red caída se
 * ofrece reintentar, y en cualquier caso **la coordenada que la persona acaba
 * de marcar no se pierde**.
 */

import { GEOCODING_URL, SEARCH, geocodingApiKey } from './config';
import { toSuggestion } from './addressComponents';

/** Error del geocodificador con un código que el llamante puede leer. */
export class GeocodingError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = 'GeocodingError';
    this.code = code;
  }
}

async function request(operation, params, { signal } = {}) {
  const key = geocodingApiKey();
  if (!key) throw new GeocodingError('NOT_CONFIGURED');

  const query = new URLSearchParams({ ...params, apiKey: key });

  let response;
  try {
    response = await fetch(`${GEOCODING_URL}/${operation}?${query.toString()}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    // Una petición cancelada no es un fallo: es que la persona siguió
    // escribiendo. Se deja pasar tal cual para que el llamante la ignore.
    if (error?.name === 'AbortError') throw error;
    throw new GeocodingError('NETWORK');
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new GeocodingError('UNAUTHORIZED');
    }
    throw new GeocodingError(response.status === 429 ? 'RATE_LIMITED' : 'FAILED');
  }

  try {
    return await response.json();
  } catch {
    throw new GeocodingError('FAILED');
  }
}

/**
 * Búsqueda con autocompletado.
 *
 * El sesgo (`bias`) orienta los resultados hacia donde la empresa opera, pero
 * **no encierra la búsqueda**: sale de las zonas activas y es una preferencia,
 * no una frontera. El filtro por país sí acota, porque es la región en la que
 * la aplicación está operando.
 *
 * @param {string} text
 * @param {{bias?: {center?: {latitude: number, longitude: number}},
 *          countryCode?: string, lang?: string, signal?: AbortSignal}} options
 */
export async function autocomplete(text, { bias, countryCode, lang = 'es', signal } = {}) {
  const params = {
    text,
    limit: String(SEARCH.limit),
    lang,
    format: 'geojson',
  };

  if (countryCode) params.filter = `countrycode:${countryCode.toLowerCase()}`;

  const center = bias?.center;
  if (Number.isFinite(center?.latitude) && Number.isFinite(center?.longitude)) {
    params.bias = `proximity:${center.longitude},${center.latitude}`;
  }

  const data = await request('autocomplete', params, { signal });
  return (data?.features ?? []).map(toSuggestion).filter(Boolean);
}

/**
 * Qué dirección hay en un punto.
 *
 * Se llama al soltar el pin o al tocar el mapa, nunca durante el arrastre.
 *
 * @returns propuesta, o null si el proveedor no reconoce el punto (en mitad de
 *          un páramo pasa, y no es un error: la coordenada sigue siendo válida).
 */
export async function reverseGeocode({ latitude, longitude }, { lang = 'es', signal } = {}) {
  const data = await request(
    'reverse',
    { lat: String(latitude), lon: String(longitude), limit: '1', lang, format: 'geojson' },
    { signal },
  );

  const first = (data?.features ?? [])[0];
  return first ? toSuggestion(first) : null;
}
