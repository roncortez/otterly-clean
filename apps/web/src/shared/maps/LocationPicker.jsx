import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Loader2, MapPin } from 'lucide-react';
import { Alert, Button, cx } from '@/shared/ui';
import AddressAutocomplete from './AddressAutocomplete';
import { FALLBACK_CENTER, GEOCODING_PROVIDER, hasGeocodingKey, zoomForRadius } from './config';
import { toCoordinates } from './addressComponents';
import { reverseGeocode } from './geoapify';

/**
 * El motor del mapa pesa cerca de un megabyte y solo hace falta aquí: se carga
 * cuando esta pantalla se abre, no en la portada ni en el resto de la
 * aplicación. Mientras llega, el buscador ya funciona.
 */
const MapCanvas = lazy(() => import('./MapCanvas'));

/**
 * Selector de ubicación: buscador + mapa.
 *
 * Su único trabajo es responder *dónde está la casa*. No escribe la dirección:
 * propone una y quien manda sobre el texto es el formulario que hay debajo.
 *
 * Avisa al formulario solo cuando la persona hace algo explícito —elegir una
 * sugerencia, tocar el mapa, arrastrar el pin o pedir su ubicación—, nunca por
 * su cuenta. Esa es la regla que impide que una corrección escrita a mano
 * ("Urbanización Los Jardines, casa 18") desaparezca sola.
 *
 * Ninguna de las tres piezas es imprescindible: sin clave configurada se
 * retira entero, si el mapa no carga queda el buscador, y si la geocodificación
 * inversa falla se conserva la coordenada marcada. La dirección se puede
 * escribir a mano en cualquiera de esos casos, porque el mapa es una ayuda y no
 * un requisito.
 */
export default function LocationPicker({
  value,
  bias,
  regionCode = 'ec',
  onSelect,
  className,
  height = 'h-64 sm:h-72',
}) {
  const configured = hasGeocodingKey();

  const [mapFailed, setMapFailed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [notice, setNotice] = useState(null);

  // El callback cambia en cada render del padre; guardarlo en una ref evita
  // arrastrar ese cambio hasta el mapa.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  /**
   * Geocodificación inversa en curso. Tocar el mapa dos veces seguidas no debe
   * dejar dos peticiones compitiendo: la vieja se cancela, así no se gasta
   * cuota de más ni llega tarde una propuesta que ya no corresponde al punto.
   */
  const reverseRef = useRef(null);
  useEffect(() => () => reverseRef.current?.abort(), []);

  const point = useMemo(
    () => toCoordinates({ latitude: value?.latitude, longitude: value?.longitude }),
    [value?.latitude, value?.longitude],
  );

  const center = bias?.center ?? FALLBACK_CENTER;
  const zoom = zoomForRadius(bias?.radiusMeters, center.latitude);

  /**
   * Convierte un punto en una propuesta de dirección.
   *
   * Si la sugerencia ya viene resuelta (el resultado del buscador la trae), no
   * se vuelve a preguntar: es la misma información y una petición menos.
   *
   * Si la geocodificación inversa falla, se emite igualmente la coordenada sin
   * propuesta: perder la sugerencia es un inconveniente, perder el punto que la
   * persona acaba de marcar es un error.
   */
  const emit = useCallback(async ({ coordinates, placeId = null, fields = null, source }) => {
    const publish = (payload) =>
      onSelectRef.current?.({
        coordinates,
        placeId: payload.placeId ?? null,
        // El proveedor solo se declara si hay identificador que atribuir.
        provider: payload.placeId ? GEOCODING_PROVIDER : null,
        fields: payload.fields ?? null,
        source,
      });

    if (fields) {
      publish({ placeId, fields });
      return;
    }

    reverseRef.current?.abort();
    const controller = new AbortController();
    reverseRef.current = controller;

    setResolving(true);
    try {
      const place = await reverseGeocode(coordinates, { signal: controller.signal });
      setNotice(null);
      publish({ placeId: place?.placeId ?? placeId, fields: place?.fields ?? null });
    } catch (error) {
      // Si la sustituyó otra petición más reciente, es esa la que manda.
      if (error?.name === 'AbortError') return;
      publish({ placeId, fields: null });
      setNotice('No pudimos leer la dirección de ese punto. Escríbela tú abajo.');
    } finally {
      if (reverseRef.current === controller) setResolving(false);
    }
  }, []);

  const handlePick = useCallback(
    (coordinates) => {
      emit({ coordinates, source: 'MAP' });
    },
    [emit],
  );

  const handleSuggestion = useCallback(
    (suggestion) => {
      setNotice(null);
      emit({
        coordinates: suggestion.coordinates,
        placeId: suggestion.placeId,
        fields: suggestion.fields,
        source: 'SEARCH',
      });
    },
    [emit],
  );

  const handleMapUnavailable = useCallback(() => setMapFailed(true), []);

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
        const coordinates = toCoordinates(position.coords);
        if (coordinates) emit({ coordinates, source: 'GEOLOCATION' });
      },
      () => {
        setLocating(false);
        // Rechazar el permiso no puede impedir registrar la dirección.
        setNotice('No pudimos obtener tu ubicación. Búscala o marca el punto en el mapa.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  if (!configured) {
    return (
      <Alert tone="info" title="Mapa no disponible">
        Escribe la dirección a mano; podrás marcar el punto exacto más adelante.
      </Alert>
    );
  }

  return (
    <div className={cx('space-y-3', className)}>
      <AddressAutocomplete bias={bias} countryCode={regionCode} onSelect={handleSuggestion} />

      {mapFailed ? (
        <Alert tone="info" title="El mapa no cargó">
          Puedes buscar la dirección arriba o escribirla a mano; la ubicación exacta se puede
          marcar más adelante.
        </Alert>
      ) : (
        <Suspense
          fallback={
            <div
              className={cx(
                'w-full animate-pulse rounded-xl border border-border bg-surface-sunken',
                height,
              )}
            />
          }
        >
          <MapCanvas
            point={point}
            center={center}
            zoom={zoom}
            height={height}
            onPick={handlePick}
            onUnavailable={handleMapUnavailable}
          />
        </Suspense>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-text-subtle">
          {resolving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Buscando la dirección de ese punto…
            </>
          ) : (
            <>
              <MapPin className="size-3.5" aria-hidden="true" />
              {point
                ? 'Arrastra el pin hasta la puerta exacta.'
                : 'Toca el mapa para marcar el lugar.'}
            </>
          )}
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
