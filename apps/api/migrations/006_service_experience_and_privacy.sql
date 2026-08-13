-- =============================================================================
-- Migration 006: privacidad de la incidencia, sesion que sobrevive a la
--                recarga, y los inmuebles dejan de ser una lista paralela
--
-- Tres cambios que vienen de la misma revision del producto:
--
--   1. La gravedad de una incidencia la clasifica Operaciones, no quien la
--      reporta. Pasa a admitir NULL ("sin clasificar") y se registra quien la
--      clasifico y cuando.
--   2. La rotacion del refresh token distingue "rotado" de "revocado", para que
--      dos peticiones legitimas en paralelo -dos pestanas, un reintento tras un
--      401- no se cierren la sesion la una a la otra. Revocar sigue siendo
--      inmediato.
--   3. `properties` era un segundo modelo de direccion, en paralelo al de
--      `addresses` y sin relacion con ninguna reserva. Sus datos utiles son los
--      del hogar para limpieza, asi que pasan a colgar de la direccion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Incidencias: reportar el hecho != clasificar su gravedad
--
-- Quien reporta describe lo que paso; la gravedad es una decision operativa con
-- consecuencias (a quien se avisa, que se compensa) y corresponde a ADMIN. El
-- DEFAULT desaparece a proposito: "MEDIA porque nadie dijo otra cosa" es
-- exactamente la mentira que se quiere evitar. Las filas ya existentes
-- conservan su valor; lo que no tienen es `classified_at`, asi que se pueden
-- distinguir de las que Operaciones si reviso.
-- -----------------------------------------------------------------------------
ALTER TABLE incidents ALTER COLUMN severity DROP DEFAULT;
ALTER TABLE incidents ALTER COLUMN severity DROP NOT NULL;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS classified_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;

-- Las que esperan clasificacion son la cola de trabajo de Operaciones.
CREATE INDEX IF NOT EXISTS idx_incidents_unclassified
  ON incidents (created_at DESC)
  WHERE severity IS NULL AND status IN ('OPEN', 'IN_REVIEW');

-- -----------------------------------------------------------------------------
-- 2. Sesiones: rotar no es lo mismo que revocar
--
-- El refresh token rota en cada uso y el anterior deja de servir. Eso esta
-- bien, pero deja una ventana de carrera real: dos pestanas que recargan a la
-- vez, o dos peticiones que reciben 401 juntas, presentan el MISMO token; una
-- gana y la otra recibia "sesion expirada" y cerraba la sesion del usuario.
--
-- `rotated_at` marca la revocacion que provoco una rotacion. El servicio admite
-- reusar un token rotado durante unos segundos (ver authService.ROTATION_GRACE_MS)
-- y solo entonces. Cerrar sesion o cambiar la contrasena escriben `revoked_at`
-- sin `rotated_at`: esos siguen muriendo en el acto.
-- -----------------------------------------------------------------------------
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ;

-- -----------------------------------------------------------------------------
-- 3. El inmueble deja de ser una entidad global y pasa a ser el hogar de una
--    direccion
--
-- `properties` guardaba otra vez la calle, la ciudad y la provincia que ya
-- estaban en `addresses`, sin coordenada, sin zona de cobertura y sin que
-- ninguna reserva la mirase: el cliente escribia dos veces lo mismo y el
-- inmueble no llegaba nunca al trabajador.
--
-- Lo que si aportaba -cuantas habitaciones, cuantos banos, como se entra- son
-- datos del hogar que solo usa limpieza. Por eso viven en una tabla de detalle
-- que cuelga de la direccion, igual que `cleaning_details` cuelga de la orden:
-- la direccion sigue siendo lo unico que comparten todos los servicios.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS address_cleaning_profiles (
  address_id          BIGINT PRIMARY KEY REFERENCES addresses(id) ON DELETE CASCADE,

  property_type       TEXT NOT NULL DEFAULT 'APARTMENT'
                        CHECK (property_type IN ('HOUSE', 'APARTMENT', 'SUITE', 'OFFICE')),
  bedrooms            SMALLINT NOT NULL DEFAULT 0,
  bathrooms           SMALLINT NOT NULL DEFAULT 0,
  area_value          NUMERIC(8,2),
  area_unit           TEXT,

  has_pets            BOOLEAN NOT NULL DEFAULT FALSE,
  pets                JSONB NOT NULL DEFAULT '[]'::jsonb,
  pet_instructions    TEXT,

  access_method       TEXT NOT NULL DEFAULT 'CUSTOMER_OPENS'
                        CHECK (access_method IN ('CUSTOMER_OPENS', 'KEY', 'DOOR_CODE', 'CONCIERGE', 'LOCKBOX', 'OTHER')),
  access_instructions TEXT,
  -- Mismo tratamiento que en `cleaning_details`: cifrado con AES-256-GCM por la
  -- aplicacion y jamas devuelto en una respuesta. Ver services/crypto.js.
  access_secret_encrypted TEXT,
  parking_instructions TEXT,

  notes               TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Traslado de los datos existentes. Se hace en dos pasos y sin perder nada:
--
--   a) Si el cliente ya tenia una direccion con la misma calle, el inmueble se
--      convierte en el hogar de ESA direccion: es la misma casa escrita dos
--      veces, y fusionarlas es justamente el objetivo.
--   b) Si no la tenia, la direccion se crea a partir del inmueble. Nace sin
--      coordenada -el inmueble nunca la tuvo- y el cliente podra marcarla en el
--      mapa cuando la edite.
DO $$
DECLARE
  prop      RECORD;
  target_id BIGINT;
BEGIN
  IF to_regclass('public.properties') IS NULL THEN
    RETURN;
  END IF;

  FOR prop IN SELECT * FROM properties ORDER BY id LOOP
    SELECT a.id INTO target_id
      FROM addresses a
     WHERE a.user_id = prop.user_id
       AND a.archived_at IS NULL
       AND lower(btrim(a.street_line1)) = lower(btrim(prop.street_address))
     ORDER BY a.is_default DESC, a.id
     LIMIT 1;

    IF target_id IS NULL THEN
      INSERT INTO addresses (
        user_id, label, street_line1, neighborhood, city, administrative_area,
        postal_code, reference
      ) VALUES (
        prop.user_id,
        COALESCE(NULLIF(btrim(prop.name), ''), 'Inmueble'),
        prop.street_address,
        prop.dependent_locality,
        COALESCE(NULLIF(btrim(prop.locality), ''), 'Quito'),
        prop.administrative_area,
        prop.postal_code,
        prop.notes
      )
      RETURNING id INTO target_id;
    END IF;

    -- El codigo de acceso ya estaba cifrado con la misma clave y el mismo
    -- formato (v1:iv:tag:ciphertext): se copia tal cual, sin descifrarlo.
    INSERT INTO address_cleaning_profiles (
      address_id, property_type, bedrooms, bathrooms, access_secret_encrypted, notes
    ) VALUES (
      target_id,
      CASE
        WHEN prop.property_type ILIKE '%office%'  THEN 'OFFICE'
        WHEN prop.property_type ILIKE '%studio%'  THEN 'SUITE'
        WHEN prop.property_type ILIKE '%house%'   THEN 'HOUSE'
        ELSE 'APARTMENT'
      END,
      COALESCE(prop.bedrooms, 0),
      COALESCE(prop.bathrooms, 0),
      prop.access_code,
      prop.notes
    )
    ON CONFLICT (address_id) DO UPDATE SET
      bedrooms  = GREATEST(address_cleaning_profiles.bedrooms, EXCLUDED.bedrooms),
      bathrooms = GREATEST(address_cleaning_profiles.bathrooms, EXCLUDED.bathrooms),
      access_secret_encrypted =
        COALESCE(address_cleaning_profiles.access_secret_encrypted, EXCLUDED.access_secret_encrypted),
      notes = COALESCE(address_cleaning_profiles.notes, EXCLUDED.notes),
      updated_at = NOW();
  END LOOP;
END $$;

-- Ya no queda nada que leer aqui: mantener la tabla seria conservar un segundo
-- modelo de direccion al lado del bueno, que es justo lo que se venia a quitar.
DROP TABLE IF EXISTS properties;
