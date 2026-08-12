import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, MapPin, Search } from 'lucide-react';
import { Alert, Button, cx } from '@/shared/ui';
import { loadGoogleMaps, hasMapsKey, MAPS_MAP_ID } from './loader';
import { toAddressFields, toCoordinates } from './addressComponents';

/**
 * Selector de ubicación sobre el mapa.
 *
 * Su único trabajo es responder *dónde está la casa*. No escribe la dirección:
 * propone una y quien manda sobre el texto es el formulario que hay debajo.
 *
 * Avisa al formulario solo cuando la persona hace algo explícito —elegir una
 * sugerencia, tocar el mapa, arrastrar el pin o pedir su ubicación—, nunca por
 * su cuenta. Esa es la regla que impide que una corrección escrita a mano
 * ("Urbanización Los Jardines, casa 18") desaparezca sola.
 *
 * Si no hay clave de Google configurada o la carga falla, el componente se
 * retira con un aviso y la dirección se sigue pudiendo escribir a mano: el mapa
 * es una ayuda, no un requisito.
 */
export default function LocationPicker({
  value,
  bias,
  regionCode = 'ec',
  onSelect,
  className,
  height = 'h-64 sm:h-72',
}) {
  const mapNodeRef = useRef(null);
  const searchNodeRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);
  // El callback cambia en cada render del padre; guardarlo en una ref evita
  // rehacer el mapa entero cada vez que se escribe una letra en el formulario.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const [status, setStatus] = useState(hasMapsKey() ? 'loading' : 'unavailable');
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState(null);

  const hasPoint = Number.isFinite(Number(value?.latitude)) && Number.isFinite(Number(value?.longitude));

  /**
   * Convierte un punto en una propuesta de dirección.
   *
   * Si el geocodificador inverso falla, se emite igualmente la coordenada sin
   * propuesta: perder la sugerencia es un inconveniente, perder el punto que la
   * persona acaba de marcar es un error.
   */
  const emit = useCallback(async ({ coordinates, placeId = null, fields = null, source }) => {
    if (fields) {
      onSelectRef.current?.({ coordinates, placeId, fields, source });
      return;
    }

    try {
      const { results } = await geocoderRef.current.geocode({
        location: { lat: coordinates.latitude, lng: coordinates.longitude },
      });
      const best = results?.[0];
      onSelectRef.current?.({
        coordinates,
        placeId: placeId ?? best?.place_id ?? null,
        fields: best ? toAddressFields(best.address_components, best.formatted_address) : null,
        source,
      });
    } catch {
      onSelectRef.current?.({ coordinates, placeId, fields: null, source });
    }
  }, []);

  const moveMarker = useCallback((coordinates) => {
    const position = { lat: coordinates.latitude, lng: coordinates.longitude };
    if (markerRef.current) markerRef.current.position = position;
    mapRef.current?.panTo(position);
  }, []);

  // --- Montaje del mapa ----------------------------------------------------
  useEffect(() => {
    if (!hasMapsKey()) return undefined;

    let cancelled = false;
    const listeners = [];

    (async () => {
      try {
        const maps = await loadGoogleMaps({ region: regionCode.toUpperCase() });
        if (cancelled || !mapNodeRef.current) return;

        const [{ Map }, { AdvancedMarkerElement }, { Geocoder }] = await Promise.all([
          maps.importLibrary('maps'),
          maps.importLibrary('marker'),
          maps.importLibrary('geocoding'),
        ]);
        if (cancelled || !mapNodeRef.current) return;

        const center = hasPoint
          ? { lat: Number(value.latitude), lng: Number(value.longitude) }
          : { lat: bias?.center?.latitude ?? -0.1807, lng: bias?.center?.longitude ?? -78.4678 };

        const map = new Map(mapNodeRef.current, {
          center,
          zoom: hasPoint ? 17 : 12,
          mapId: MAPS_MAP_ID,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          // En móvil el mapa vive dentro de una página que se desplaza: un dedo
          // arrastra la página, dos mueven el mapa. Así no se queda atrapado.
          gestureHandling: 'cooperative',
        });
        mapRef.current = map;
        geocoderRef.current = new Geocoder();

        const marker = new AdvancedMarkerElement({
          map,
          position: center,
          gmpDraggable: true,
          title: 'Arrastra el pin hasta la puerta',
        });
        markerRef.current = marker;
        // Sin punto todavía: el pin aparece cuando se elige uno.
        marker.map = hasPoint ? map : null;

        listeners.push(
          marker.addListener('dragend', () => {
            const coordinates = toCoordinates(marker.position);
            if (coordinates) emit({ coordinates, source: 'MAP' });
          }),
        );

        listeners.push(
          map.addListener('click', (event) => {
            const coordinates = toCoordinates(event.latLng);
            if (!coordinates) return;
            marker.map = map;
            marker.position = event.latLng;
            emit({ coordinates, source: 'MAP' });
          }),
        );

        // --- Buscador -------------------------------------------------------
        try {
          const { PlaceAutocompleteElement } = await maps.importLibrary('places');
          if (cancelled || !searchNodeRef.current) return;

          const autocomplete = new PlaceAutocompleteElement({
            // Sesga hacia donde opera la empresa, sin encerrar la búsqueda: las
            // zonas de servicio pueden crecer y esto sale de ellas, no de una
            // constante escrita aquí.
            includedRegionCodes: [regionCode],
          });

          if (bias?.center) {
            autocomplete.locationBias = {
              center: { lat: bias.center.latitude, lng: bias.center.longitude },
              // El sesgo admite hasta 50 km; más allá deja de ser una pista útil.
              radius: Math.min(bias.radiusMeters ?? 25000, 50000),
            };
          }

          autocomplete.style.width = '100%';
          searchNodeRef.current.replaceChildren(autocomplete);

          autocomplete.addEventListener('gmp-select', async ({ placePrediction }) => {
            try {
              const place = placePrediction.toPlace();
              await place.fetchFields({
                fields: ['location', 'addressComponents', 'formattedAddress', 'id'],
              });

              const coordinates = toCoordinates(place.location);
              if (!coordinates) return;

              marker.map = map;
              moveMarker(coordinates);
              map.setZoom(17);

              emit({
                coordinates,
                placeId: place.id ?? null,
                fields: toAddressFields(place.addressComponents, place.formattedAddress),
                source: 'SEARCH',
              });
            } catch {
              setNotice('No pudimos leer ese lugar. Marca el punto en el mapa.');
            }
          });
        } catch {
          // Sin buscador el mapa sigue sirviendo: se toca y se arrastra.
          setNotice('El buscador no está disponible. Toca el mapa para marcar el punto.');
        }

        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
    })();

    return () => {
      cancelled = true;
      for (const listener of listeners) listener.remove?.();
      if (markerRef.current) markerRef.current.map = null;
      markerRef.current = null;
      mapRef.current = null;
    };
    // Se monta una vez: el punto inicial y el sesgo solo importan al crear el
    // mapa, y rehacerlo con cada tecla del formulario sería absurdo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El pin sigue al valor cuando cambia desde fuera (por ejemplo, al editar
  // otra dirección con el mismo formulario).
  useEffect(() => {
    if (status !== 'ready' || !hasPoint || !markerRef.current || !mapRef.current) return;
    markerRef.current.map = mapRef.current;
    moveMarker({ latitude: Number(value.latitude), longitude: Number(value.longitude) });
  }, [status, hasPoint, value?.latitude, value?.longitude, moveMarker]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setNotice('Tu navegador no permite compartir la ubicación.');
      return;
    }

    setLocating(true);
    setNotice(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const coordinates = {
          latitude: Number(position.coords.latitude.toFixed(7)),
          longitude: Number(position.coords.longitude.toFixed(7)),
        };
        if (markerRef.current && mapRef.current) {
          markerRef.current.map = mapRef.current;
          moveMarker(coordinates);
          mapRef.current.setZoom(17);
        }
        emit({ coordinates, source: 'GEOLOCATION' });
      },
      () => {
        setLocating(false);
        // Rechazar el permiso no puede impedir registrar la dirección.
        setNotice('No pudimos obtener tu ubicación. Búscala o marca el punto en el mapa.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  if (status === 'unavailable') {
    return (
      <Alert tone="info" title="Mapa no disponible">
        Escribe la dirección a mano; podrás marcar el punto exacto más adelante.
      </Alert>
    );
  }

  return (
    <div className={cx('space-y-3', className)}>
      <div>
        <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-text">
          <Search className="size-4 text-text-subtle" aria-hidden="true" />
          Buscar dirección o lugar
        </span>
        {/* El buscador de Google se monta aquí dentro. */}
        <div ref={searchNodeRef} className="[&_gmp-place-autocomplete]:w-full" />
      </div>

      <div
        ref={mapNodeRef}
        className={cx('w-full overflow-hidden rounded-xl border border-border bg-surface-sunken', height)}
        role="application"
        aria-label="Mapa para elegir la ubicación"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-text-subtle">
          <MapPin className="size-3.5" aria-hidden="true" />
          {hasPoint ? 'Arrastra el pin hasta la puerta exacta.' : 'Toca el mapa para marcar el lugar.'}
        </p>

        <Button type="button" variant="outline" size="sm" loading={locating} onClick={useMyLocation}>
          <Crosshair className="size-4" aria-hidden="true" />
          Usar mi ubicación
        </Button>
      </div>

      {notice ? <Alert tone="info">{notice}</Alert> : null}
    </div>
  );
}
