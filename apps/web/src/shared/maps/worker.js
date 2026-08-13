/**
 * Dónde quedó el worker de MapLibre.
 *
 * MapLibre parsea las teselas en un web worker que carga por su cuenta,
 * buscándolo *al lado de su propio archivo*. Esa ruta se construye en tiempo de
 * ejecución, así que el empaquetador no puede verla: en la build el worker no
 * llega a emitirse y la petición acaba en un 404.
 *
 * El síntoma es desconcertante y por eso merece este archivo: el mapa aparece
 * con sus controles y su atribución, pero **en gris y sin pin**, sin ningún
 * error visible. Sin worker nadie pide ni dibuja una sola tesela, y el evento
 * `load` no llega a emitirse nunca.
 *
 * `?worker&url` hace que Vite lo empaquete como worker de verdad y devuelva su
 * URL final, la misma en desarrollo y en producción.
 *
 * Vive aparte de `MapCanvas` para que sea un efecto de importación explícito y
 * para que las pruebas puedan sustituirlo sin arrastrar el empaquetado del
 * worker entero.
 */

import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);
