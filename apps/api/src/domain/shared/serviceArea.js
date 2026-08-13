'use strict';

/**
 * Cobertura geografica.
 *
 * Elegir un punto valido en un mapa no significa que la empresa opere alli. La
 * pregunta "¿atendemos esta ubicacion?" se responde aqui, en el dominio, sin
 * saber nada de HTTP ni de base de datos.
 *
 * Una zona se describe como circulo (centro + radio en km) y no como poligono:
 * es suficiente para "Quito y los valles", se calcula con aritmetica y evita
 * meter PostGIS en la primera version. El dia que el negocio necesite fronteras
 * reales se sustituye este modulo; nada mas cambia.
 *
 * Regla deliberada: **si ninguna zona activa tiene cobertura definida, no se
 * rechaza nada**. La restriccion aparece cuando Operaciones la configura, no
 * por defecto, para que anadir una ciudad no exija tocar codigo.
 */

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/** Distancia en km entre dos coordenadas sobre la superficie terrestre. */
function distanceKm(from, to) {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** ¿Esta zona sabe donde esta? Sin centro ni radio no puede opinar. */
function hasCoverage(zone) {
  return (
    zone?.center_latitude !== null &&
    zone?.center_latitude !== undefined &&
    zone?.center_longitude !== null &&
    zone?.center_longitude !== undefined &&
    Number(zone?.radius_km) > 0
  );
}

/**
 * ¿Hay punto?
 *
 * Se comprueba el vacio ANTES de convertir a numero: `Number(null)` es 0, y un
 * cero colado como coordenada situaria la casa en mitad del Atlantico, frente
 * a la costa de Africa. Una direccion sin coordenadas es legitima y tiene que
 * distinguirse de una en el punto (0, 0).
 */
function isValidPoint(point) {
  if (!point) return false;
  const { latitude, longitude } = point;
  if (latitude === null || latitude === undefined || latitude === '') return false;
  if (longitude === null || longitude === undefined || longitude === '') return false;
  return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
}

/**
 * Decide si un punto cae dentro de alguna zona con cobertura.
 *
 * @param {{latitude:number, longitude:number}|null} point
 * @param {Array<object>} zones zonas activas de la region
 * @returns {{ checked: boolean, covered: boolean, zone: object|null, distanceKm: number|null }}
 *   `checked` es false cuando no habia nada que comprobar (sin coordenadas o
 *   sin cobertura configurada); en ese caso `covered` es true porque no hay
 *   motivo para rechazar.
 */
function locateZone(point, zones = []) {
  const withCoverage = zones.filter((zone) => hasCoverage(zone));

  if (!isValidPoint(point) || withCoverage.length === 0) {
    return { checked: false, covered: true, zone: null, distanceKm: null };
  }

  const target = { latitude: Number(point.latitude), longitude: Number(point.longitude) };

  // La zona mas cercana entre las que contienen el punto: si dos circulos se
  // solapan, gana la que tiene el domicilio mas cerca de su centro.
  let best = null;
  for (const zone of withCoverage) {
    const distance = distanceKm(target, {
      latitude: Number(zone.center_latitude),
      longitude: Number(zone.center_longitude),
    });
    if (distance <= Number(zone.radius_km) && (best === null || distance < best.distanceKm)) {
      best = { zone, distanceKm: distance };
    }
  }

  return best
    ? { checked: true, covered: true, zone: best.zone, distanceKm: best.distanceKm }
    : { checked: true, covered: false, zone: null, distanceKm: null };
}

/**
 * Circulo que envuelve toda la operacion de una region.
 *
 * Lo usa el frontend para orientar el buscador de direcciones hacia donde la
 * empresa trabaja de verdad, en lugar de llevar una restriccion escrita a mano
 * que impediria abrir una ciudad nueva desde la pantalla de zonas.
 *
 * @returns {{center:{latitude:number, longitude:number}, radiusKm:number}|null}
 */
function coverageEnvelope(zones = []) {
  const withCoverage = zones.filter((zone) => hasCoverage(zone));
  if (withCoverage.length === 0) return null;

  const center = withCoverage.reduce(
    (acc, zone) => ({
      latitude: acc.latitude + Number(zone.center_latitude) / withCoverage.length,
      longitude: acc.longitude + Number(zone.center_longitude) / withCoverage.length,
    }),
    { latitude: 0, longitude: 0 },
  );

  const radiusKm = withCoverage.reduce((max, zone) => {
    const reach =
      distanceKm(center, {
        latitude: Number(zone.center_latitude),
        longitude: Number(zone.center_longitude),
      }) + Number(zone.radius_km);
    return Math.max(max, reach);
  }, 0);

  return { center, radiusKm: Math.round(radiusKm * 100) / 100 };
}

module.exports = { distanceKm, hasCoverage, isValidPoint, locateZone, coverageEnvelope };
