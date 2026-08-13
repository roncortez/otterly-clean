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

-- =============================================================================
-- 0. RECONCILIACION DE INTEGRACION
--
-- Esta migracion nacio en `fix/booking-flow` y da por hecho que existe
-- `properties`. Hay bases de desarrollo donde no existe: son las que llegaron a
-- aplicar la 006 de `feat/maplibre-geoapify`, que resolvia el mismo problema al
-- reves -sustituir `properties` por `address_cleaning_profiles`, 1:1 con la
-- direccion- y terminaba con DROP TABLE properties. La integracion conserva el
-- modelo de `fix/booking-flow` (ver la nota en la migracion 011), asi que en esas
-- bases hay que deshacer aquel paso antes de continuar.
--
-- Se recrea la tabla con la forma que tenia en la 002 -no con la actual- porque
-- lo que viene despues en este mismo archivo la transforma, y saltarse esos
-- pasos dejaria un esquema distinto segun por donde hubiera pasado cada base.
-- Los datos que aquella tabla guardaba NO se pierden: las columnas que ya
-- existen en la 002 se recuperan aqui, y el resto (acceso, mascotas, superficie)
-- en la migracion 015, cuando las columnas que las alojan ya existen.
--
-- En una base nueva, o en una que nunca aplico aquella 006, este bloque no hace
-- nada.
-- =============================================================================
DO $$
BEGIN
  IF to_regclass('public.properties') IS NOT NULL THEN
    RETURN;
  END IF;

  CREATE TABLE properties (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    property_type       TEXT NOT NULL,
    bedrooms            INTEGER DEFAULT 1,
    bathrooms           INTEGER DEFAULT 1,
    street_address      TEXT NOT NULL,
    dependent_locality  TEXT,
    locality            TEXT NOT NULL,
    administrative_area TEXT,
    postal_code         TEXT,
    access_code         TEXT,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Cada ficha de limpieza vuelve a ser un inmueble. `street_address` se toma
  -- de la direccion a la que colgaba, que es justo lo que el backfill del punto
  -- 2 usa para volver a enlazarlos: se reaprovecha esa logica en vez de
  -- duplicarla aqui.
  IF to_regclass('public.address_cleaning_profiles') IS NOT NULL THEN
    INSERT INTO properties (
      user_id, name, property_type, bedrooms, bathrooms,
      street_address, dependent_locality, locality, administrative_area, postal_code,
      access_code, notes
    )
    SELECT
      a.user_id,
      COALESCE(NULLIF(btrim(a.label), ''), 'Mi casa'),
      acp.property_type,
      acp.bedrooms,
      acp.bathrooms,
      a.street_line1,
      a.neighborhood,
      COALESCE(NULLIF(btrim(a.city), ''), 'Quito'),
      a.administrative_area,
      a.postal_code,
      -- Ya estaba cifrado con la misma clave y el mismo formato: se copia tal
      -- cual, sin descifrarlo por el camino.
      acp.access_secret_encrypted,
      acp.notes
    FROM address_cleaning_profiles acp
    JOIN addresses a ON a.id = acp.address_id
    WHERE a.archived_at IS NULL;
  END IF;
END $$;

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
