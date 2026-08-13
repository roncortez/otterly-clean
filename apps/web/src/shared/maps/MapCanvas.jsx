import { useEffect, useRef, useState } from 'react';
// Importaciones con nombre y renombradas: el paquete no expone un objeto por
// defecto, y `Map` a secas taparía el `Map` del lenguaje dentro de este archivo.
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Le dice a MapLibre dónde quedó su worker tras el empaquetado. Sin esto el
// mapa se queda en gris y sin pin, sin dar ningún error: ver el archivo.
import './worker';
import { cx } from '@/shared/ui';
import { MAP_ZOOM, mapStyleUrl } from './config';
import { toCoordinates } from './addressComponents';

/**
 * El mapa, y nada más que el mapa.
 *
 * Encapsula MapLibre entero: es el único archivo de la aplicación que sabe que
 * existe. Hacia fuera ofrece una interfaz mínima —un punto que mostrar y un
 * aviso cuando la persona elige otro— para que ni `LocationPicker` ni mucho
 * menos `AddressForm` dependan de la forma de esta librería.
 *
 * No decide nada del negocio: no geocodifica, no valida cobertura y no toca el
 * formulario. Solo dibuja dónde está el pin y avisa cuándo se movió.
 */
export default function MapCanvas({
  point,
  center,
  zoom = MAP_ZOOM.overview,
  onPick,
  onUnavailable,
  className,
  height = 'h-64 sm:h-72',
  label = 'Mapa para elegir la ubicación',
}) {
  const nodeRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Los callbacks cambian en cada render del padre; guardarlos en refs evita
  // rehacer el mapa cada vez que se escribe una letra en el formulario.
  const onPickRef = useRef(onPick);
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onPickRef.current = onPick;
    onUnavailableRef.current = onUnavailable;
  }, [onPick, onUnavailable]);

  /**
   * Última coordenada que salió de este mapa.
   *
   * Cuando la persona arrastra el pin, el punto vuelve como propiedad desde el
   * formulario. Sin esta marca, el mapa "corregiría" la cámara sobre el pin que
   * ella acaba de colocar y daría un salto molesto en cada arrastre.
   */
  const emittedRef = useRef(null);

  function emit(coordinates) {
    const clean = toCoordinates(coordinates);
    if (!clean) return;
    emittedRef.current = clean;
    onPickRef.current?.(clean);
  }

  // El punto inicial solo importa al construir el mapa: después manda la
  // cámara. Se leen de una ref para no reconstruirlo cuando cambian.
  const initialRef = useRef({ point, center, zoom });

  // --- Montaje -------------------------------------------------------------
  useEffect(() => {
    const style = mapStyleUrl();
    if (!style || !nodeRef.current) {
      onUnavailableRef.current?.();
      return undefined;
    }

    const start = initialRef.current;
    const origin = start.point ?? start.center;

    let map;
    try {
      map = new MapLibreMap({
        container: nodeRef.current,
        style,
        center: [origin.longitude, origin.latitude],
        zoom: start.point ? MAP_ZOOM.focused : start.zoom,
        minZoom: MAP_ZOOM.min,
        maxZoom: MAP_ZOOM.max,
        attributionControl: { compact: true },
        // En móvil el mapa vive dentro de una página que se desplaza: un dedo
        // arrastra la página, dos mueven el mapa. Así no se queda atrapado.
        cooperativeGestures: true,
      });
    } catch {
      // Sin WebGL (navegador antiguo, aceleración desactivada) no hay mapa. La
      // dirección se sigue pudiendo escribir, que es lo que importa.
      onUnavailableRef.current?.();
      return undefined;
    }

    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    let loaded = false;
    map.on('load', () => {
      loaded = true;
      setReady(true);
    });

    // Una tesela que falla no es un mapa roto; un estilo que nunca carga, sí.
    map.on('error', () => {
      if (!loaded) onUnavailableRef.current?.();
    });

    map.on('click', (event) => emit(event.lngLat));

    return () => {
      markerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // Se monta una vez: rehacer el mapa con cada tecla del formulario sería
    // absurdo, y además tiraría la posición de la cámara. Por eso todo lo que
    // cambia con el tiempo se lee de refs y no de las dependencias.
  }, []);

  // --- El pin sigue al punto ------------------------------------------------
  //
  // Se depende de las dos coordenadas y no del objeto: el padre crea uno nuevo
  // en cada render, y con el objeto en las dependencias el mapa recolocaría la
  // cámara con cada tecla del formulario, deshaciendo el encuadre que la
  // persona acababa de elegir a mano.
  const latitude = point?.latitude ?? null;
  const longitude = point?.longitude ?? null;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (latitude === null || longitude === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const lngLat = [longitude, latitude];

    if (!markerRef.current) {
      const marker = new Marker({ draggable: true, color: '#166534' })
        .setLngLat(lngLat)
        .addTo(map);
      // Solo al soltar: geocodificar durante el arrastre sería una petición por
      // cada píxel recorrido.
      marker.on('dragend', () => emit(marker.getLngLat()));
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat(lngLat);
    }

    // Si el punto lo acaba de poner esta misma persona sobre el mapa, la cámara
    // no se mueve: ya está mirando donde toca.
    const emitted = emittedRef.current;
    const isOwnMove = emitted && emitted.latitude === latitude && emitted.longitude === longitude;

    if (!isOwnMove) {
      map.easeTo({ center: lngLat, zoom: Math.max(map.getZoom(), MAP_ZOOM.focused) });
    }
  }, [ready, latitude, longitude]);

  return (
    <div
      ref={nodeRef}
      className={cx(
        'w-full overflow-hidden rounded-xl border border-border bg-surface-sunken',
        height,
        className,
      )}
      role="application"
      aria-label={label}
    />
  );
}
