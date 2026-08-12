/**
 * Carga de Google Maps.
 *
 * La clave del navegador no es un secreto —viaja en la petición del mapa, así
 * que cualquiera puede verla—, pero tampoco se escribe en el código: llega por
 * variable de entorno y se protege donde toca, en la consola de Google,
 * restringiéndola a los dominios de la aplicación y a las APIs que usa. Ver
 * docs/SECURITY.md.
 *
 * Si no hay clave, esto no explota: devuelve un error controlado y la pantalla
 * de direcciones sigue funcionando sin mapa. Escribir la dirección a mano nunca
 * puede depender de un proveedor externo.
 */

const CALLBACK = '__otterlyGoogleMapsReady';

let loadPromise = null;

export const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

/**
 * Identificador de mapa, necesario para los marcadores modernos
 * (`AdvancedMarkerElement`). Se puede crear uno propio con estilo de marca en
 * la consola de Google; mientras tanto sirve el de demostración.
 */
export const MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

export function hasMapsKey() {
  return Boolean(MAPS_API_KEY);
}

/**
 * Carga la API una sola vez, aunque la pidan varias pantallas a la vez.
 *
 * @param {{language?: string, region?: string}} [options]
 * @returns {Promise<typeof google.maps>}
 */
export function loadGoogleMaps({ language = 'es', region = 'EC' } = {}) {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('MAPS_NO_BROWSER'));
      return;
    }
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }
    if (!MAPS_API_KEY) {
      reject(new Error('MAPS_MISSING_KEY'));
      return;
    }

    window[CALLBACK] = () => {
      resolve(window.google.maps);
      delete window[CALLBACK];
    };

    const script = document.createElement('script');
    const params = new URLSearchParams({
      key: MAPS_API_KEY,
      // `weekly` mantiene las APIs modernas al día sin fijar una versión que
      // envejezca. `places` incluye PlaceAutocompleteElement; `marker`,
      // AdvancedMarkerElement.
      v: 'weekly',
      libraries: 'places,marker,geocoding',
      language,
      region,
      loading: 'async',
      callback: CALLBACK,
    });

    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('MAPS_LOAD_FAILED'));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}
