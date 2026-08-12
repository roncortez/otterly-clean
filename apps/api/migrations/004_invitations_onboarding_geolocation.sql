-- =============================================================================
-- Migration 004: Invitaciones, onboarding, foto de perfil y geolocalizacion
--
-- Tres cambios que comparten una misma idea: los datos personales los aporta su
-- dueno, no un tercero.
--
--   1. El ADMIN crea la cuenta del trabajador con lo minimo (contacto, roles,
--      capacidades) y le envia una INVITACION. El trabajador pone su clave y
--      completa su perfil.
--   2. Onboarding: cada perfil sabe si ya esta completo. Se marca en la ficha
--      correspondiente (staff_profiles / customer_profiles) y no en `users`,
--      porque una misma persona puede ser trabajadora y clienta a la vez y cada
--      faceta se completa por separado.
--   3. La direccion pasa a tener dos mitades complementarias: el punto exacto
--      del mapa y el texto que escribe el cliente. Las coordenadas ya existian
--      (addresses.latitude/longitude); aqui solo se anade la referencia del
--      lugar de Google y una cobertura geografica simple para las zonas.
-- =============================================================================

-- =============================================================================
-- 1. INVITACIONES
--
-- Nunca viaja una contrasena por correo o WhatsApp. Se envia un enlace con un
-- token de alta entropia del que la base solo guarda el HASH: un volcado de la
-- tabla no permite activar ninguna cuenta.
--
-- Una invitacion vive mientras no este aceptada, revocada ni vencida. Generar
-- una nueva revoca la anterior (lo hace el servicio, dentro de la transaccion),
-- de modo que en todo momento hay como mucho un enlace utilizable por persona.
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_invitations (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- SHA-256 del token. El token real solo existe en el enlace que se envia.
  token_hash  TEXT NOT NULL UNIQUE,
  -- Por donde se intento entregar. WHATSAPP queda declarado pero hoy no hay
  -- proveedor: la notificacion se registra y NO se marca como enviada.
  channel     TEXT NOT NULL DEFAULT 'EMAIL' CHECK (channel IN ('EMAIL', 'WHATSAPP')),
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- La consulta caliente es "la invitacion viva de esta persona".
CREATE INDEX IF NOT EXISTS idx_user_invitations_pending
  ON user_invitations (user_id)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- WhatsApp entra como canal posible de notificacion. Que exista el canal no
-- significa que haya proveedor: mientras no lo haya, la notificacion se guarda
-- PENDING con el motivo y jamas se marca como enviada (ver notifications/drivers.js).
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_channel_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_channel_check
  CHECK (channel IN ('IN_APP', 'EMAIL', 'SMS', 'PUSH', 'WHATSAPP'));

-- =============================================================================
-- 2. ONBOARDING Y FOTO DE PERFIL
--
-- `photo_url` ya existia en staff_profiles y se reutiliza tal cual: es la foto
-- que el cliente ve del profesional asignado. Se le anade el identificador del
-- archivo en el almacenamiento para poder reemplazarlo y borrarlo sin dejar
-- huerfanos. La imagen NUNCA se guarda en la base: solo su referencia.
-- =============================================================================

ALTER TABLE staff_profiles
  ADD COLUMN IF NOT EXISTS photo_public_id        TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS photo_url               TEXT,
  ADD COLUMN IF NOT EXISTS photo_public_id         TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Las cuentas que ya existen no deben quedar atrapadas en un onboarding que
-- nunca pidieron: se consideran completas y el sistema solo exigira el flujo a
-- quienes se creen a partir de ahora.
UPDATE staff_profiles    SET onboarding_completed_at = NOW() WHERE onboarding_completed_at IS NULL;
UPDATE customer_profiles SET onboarding_completed_at = NOW() WHERE onboarding_completed_at IS NULL;

-- =============================================================================
-- 3. UBICACION DE LA DIRECCION
--
-- La coordenada y el texto son dos cosas distintas y complementarias:
--
--   * latitude/longitude (ya existian) -> donde esta la casa de verdad.
--   * street_line1, street_line2, neighborhood, city, administrative_area,
--     reference (ya existian) -> como la describe y la corrige el cliente.
--
-- Google no siempre acierta con urbanizaciones, conjuntos o numeraciones, asi
-- que el texto lo manda el cliente y la aplicacion no lo sobrescribe salvo que
-- el lo pida. `google_place_id` conserva la referencia del lugar elegido, pero
-- la direccion sigue siendo utilizable aunque Google no responda.
--
-- No se anaden columnas de numero, edificio o departamento: street_line1 y
-- street_line2 ya cubren eso y duplicarlas obligaria a decidir cual manda.
-- =============================================================================

ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS google_place_id TEXT;

-- =============================================================================
-- 4. COBERTURA GEOGRAFICA DE LAS ZONAS
--
-- Elegir un punto valido en Google Maps no significa que la empresa opere alli.
-- Para responderlo hace falta que las zonas tengan geografia, y hoy no la
-- tienen: son etiquetas (ciudad, provincia).
--
-- Se modela como circulo (centro + radio) y no como poligono con PostGIS: es
-- suficiente para "atendemos Quito y los valles", se consulta con aritmetica
-- simple y no anade una extension a la base. Cuando el negocio necesite
-- fronteras reales, el circulo se sustituye por geometria sin tocar el resto.
--
-- Una zona sin centro ni radio sigue siendo valida: simplemente no participa en
-- la comprobacion geografica. Mientras NINGUNA zona activa de la region tenga
-- cobertura definida, no se rechaza ninguna ubicacion: la restriccion aparece
-- cuando Operaciones la configura, no por defecto.
-- =============================================================================

ALTER TABLE service_zones
  ADD COLUMN IF NOT EXISTS center_latitude  NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS center_longitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS radius_km        NUMERIC(6,2);

ALTER TABLE service_zones
  ADD CONSTRAINT service_zones_radius_positive CHECK (radius_km IS NULL OR radius_km > 0);

-- Cobertura inicial aproximada de las zonas de Quito que ya existen, para que
-- la comprobacion funcione desde el primer arranque. Son datos, no estructura:
-- Operaciones puede ajustarlos.
UPDATE service_zones SET center_latitude = -0.1500, center_longitude = -78.4800, radius_km = 9
  WHERE region_code = 'EC' AND code = 'UIO-NORTE' AND center_latitude IS NULL;
UPDATE service_zones SET center_latitude = -0.2200, center_longitude = -78.5100, radius_km = 7
  WHERE region_code = 'EC' AND code = 'UIO-CENTRO' AND center_latitude IS NULL;
UPDATE service_zones SET center_latitude = -0.2900, center_longitude = -78.5400, radius_km = 9
  WHERE region_code = 'EC' AND code = 'UIO-SUR' AND center_latitude IS NULL;
-- Cumbaya, Tumbaco y el Valle de los Chillos entran en el mismo circulo.
UPDATE service_zones SET center_latitude = -0.2500, center_longitude = -78.4400, radius_km = 13
  WHERE region_code = 'EC' AND code = 'UIO-VALLES' AND center_latitude IS NULL;
