-- =============================================================================
-- Migration 005: Los inmuebles viven en una direccion
--
-- Problema: la residencia del cliente estaba partida en dos tablas sin
-- relacion. `addresses` tenia la geolocalizacion y el texto de la calle (lo que
-- usa la reserva para cobertura y asignacion), y `properties` copiaba ese texto
-- de direccion (`street_address`, `locality`, ...) junto con el perfil del
-- inmueble (tipo, habitaciones, codigo de acceso cifrado). Copiar la direccion
-- es lo que producia las inconsistencias: se editaba una y la otra quedaba
-- desactualizada, y la reserva no tenia forma de vincularlas.
--
-- Solucion: un solo origen de verdad. La direccion se queda en `addresses` y el
-- inmueble la referencia por `address_id`. Los campos de texto de direccion
-- duplicados se eliminan; el inmueble conserva lo que si es suyo: nombre, tipo,
-- habitaciones, banos, codigo de acceso cifrado y notas.
-- =============================================================================

-- 1. Columna de enlace: un inmueble vive en una direccion.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS address_id BIGINT REFERENCES addresses(id) ON DELETE SET NULL;

-- Un solo inmueble por direccion: dos direcciones distintas del mismo edificio
-- son filas distintas de `addresses`, asi que cada una puede tener su inmueble.
CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_address
  ON properties (address_id) WHERE address_id IS NOT NULL;

-- 2. Backfill: vincular los inmuebles existentes a la direccion del mismo
-- usuario cuyo texto de calle coincida. Cuando hay varias candidatas manda la
-- predeterminada y, en empate, la mas reciente.
--
-- De paso se normalizan los valores antiguos de property_type (Studio, "1
-- Bedroom", "4+ Bedrooms", ...) al enum del dominio (HOUSE, APARTMENT, SUITE,
-- OFFICE) y se deriva el numero de habitaciones que el nombre llevaba dentro.
UPDATE properties p
SET
  address_id = (
    SELECT a.id
    FROM addresses a
    WHERE a.user_id = p.user_id
      AND a.archived_at IS NULL
      AND LOWER(BTRIM(a.street_line1)) = LOWER(BTRIM(p.street_address))
    ORDER BY a.is_default DESC, a.created_at DESC
    LIMIT 1
  ),
  property_type = CASE
    WHEN p.property_type IN ('Studio', 'Suite') THEN 'SUITE'
    WHEN p.property_type IN ('Office', 'Oficina') THEN 'OFFICE'
    WHEN p.property_type IN ('House', 'Casa') THEN 'HOUSE'
    ELSE 'APARTMENT'
  END,
  bedrooms = CASE
    WHEN p.property_type = '1 Bedroom' THEN 1
    WHEN p.property_type = '2 Bedrooms' THEN 2
    WHEN p.property_type = '3 Bedrooms' THEN 3
    WHEN p.property_type = '4+ Bedrooms' THEN 4
    ELSE p.bedrooms
  END
WHERE p.address_id IS NULL;

-- 3. Los inmuebles que quedaron sin coincidencia se conservan (sin direccion,
-- no se pueden reservar sobre ellos) pero ya no arrastran texto de direccion.
ALTER TABLE properties
  DROP COLUMN IF EXISTS street_address,
  DROP COLUMN IF EXISTS dependent_locality,
  DROP COLUMN IF EXISTS locality,
  DROP COLUMN IF EXISTS administrative_area,
  DROP COLUMN IF EXISTS postal_code;

CREATE INDEX IF NOT EXISTS idx_properties_user ON properties(user_id);
