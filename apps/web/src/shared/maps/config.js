/**
 * Configuración del mapa y del geocodificador.
 *
 * Todo lo que ata la aplicación a un proveedor concreto vive aquí: la clave, la
 * URL del estilo cartográfico y la del servicio de geocodificación. Ningún
 * componente escribe una URL de proveedor, así que cambiar de proveedor es
 * reescribir este archivo, no perseguir cadenas por la interfaz.
 *
 * Hoy el mapa lo dibuja MapLibre GL JS y los datos —teselas, búsqueda y
 * geocodificación inversa— los pone Geoapify. Se eligió un único proveedor de
 * datos a propósito: dos serían dos claves, dos cuotas y dos formas distintas
 * de fallar.
 *
 * La clave la usa el navegador, así que **no es un secreto**: viaja en cada
 * petición y cualquiera puede leerla. Lo que la protege son las restricciones
 * de dominio del proveedor (ver docs/SECURITY.md). Aun así no se escribe en el
 * código: llega por variable de entorno, y sin ella la pantalla de direcciones
 * sigue funcionando escribiéndola a mano.
 */

/**
 * Quién geocodificó un punto. Se guarda junto al identificador del lugar para
 * que un `provider_place_id` antiguo no se confunda con uno nuevo: el de un
 * proveedor no significa nada en otro.
 */
export const GEOCODING_PROVIDER = 'GEOAPIFY';

/**
 * La clave se lee en cada llamada y no al cargar el módulo: así una pantalla
 * puede preguntar por ella en cualquier momento y las pruebas pueden simular
 * "no configurado" sin recargar módulos.
 */
export function geocodingApiKey() {
  return (import.meta.env.VITE_GEOAPIFY_API_KEY ?? '').trim();
}

export function hasGeocodingKey() {
  return Boolean(geocodingApiKey());
}

/** Base del servicio de geocodificación (autocompletado e inversa). */
export const GEOCODING_URL = 'https://api.geoapify.com/v1/geocode';

/**
 * Estilo cartográfico para MapLibre.
 *
 * Se usa la infraestructura del mismo proveedor de la clave —está pensada para
 * uso comercial y entra en el mismo plan— en lugar de los servidores públicos
 * de OpenStreetMap, que no son un CDN de producción de nadie.
 *
 * `VITE_GEOAPIFY_MAP_STYLE` permite cambiar de estilo (osm-bright-smooth,
 * positron, dark-matter…) sin tocar código.
 *
 * @returns {string|null} URL del estilo, o null si no hay clave configurada.
 */
export function mapStyleUrl() {
  const key = geocodingApiKey();
  if (!key) return null;

  const style = (import.meta.env.VITE_GEOAPIFY_MAP_STYLE ?? '').trim() || 'osm-bright-smooth';
  return `https://maps.geoapify.com/v1/styles/${style}/style.json?apiKey=${encodeURIComponent(key)}`;
}

/**
 * Centro de último recurso.
 *
 * Solo se usa cuando el backend no da orientación: normalmente el mapa se abre
 * sobre las zonas donde la empresa opera de verdad
 * (`GET /api/catalog/config` → `maps.bias`), que salen de `service_zones` y
 * cambian sin desplegar.
 */
export const FALLBACK_CENTER = Object.freeze({ latitude: -0.1807, longitude: -78.4678 });

/** Zoom de apertura y zoom al que se mira un punto ya elegido. */
export const MAP_ZOOM = Object.freeze({ overview: 12, focused: 17, min: 8, max: 19 });

/**
 * Frenos del buscador. Existen para no gastar cuota en peticiones que no
 * ayudan a nadie: ni una por tecla, ni una por "av".
 */
export const SEARCH = Object.freeze({
  minLength: 3,
  debounceMs: 350,
  limit: 5,
});

/**
 * Zoom que encuadra un círculo de cobertura.
 *
 * Aprovecha el radio que ya viaja en `maps.bias` para abrir el mapa mostrando
 * justo donde trabajamos, en lugar de un zoom fijo que en una ciudad se queda
 * corto y en un valle se pasa.
 */
export function zoomForRadius(radiusMeters, latitude = 0) {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return MAP_ZOOM.overview;

  // Ancho típico del mapa en la pantalla; el ajuste fino lo hace la persona.
  const viewportPx = 640;
  const metersPerPixelAtZoom0 = 156543.03 * Math.cos((latitude * Math.PI) / 180);
  const zoom = Math.log2((metersPerPixelAtZoom0 * viewportPx) / (2 * radiusMeters));

  return Math.min(MAP_ZOOM.max, Math.max(MAP_ZOOM.min, Math.round(zoom)));
}
