-- =============================================================================
-- Migration 011: privacidad de la incidencia y sesion que sobrevive a la recarga
--
-- Dos cambios independientes que vienen de la misma revision del producto:
--
--   1. La gravedad de una incidencia la clasifica Operaciones, no quien la
--      reporta. Pasa a admitir NULL ("sin clasificar") y se registra quien la
--      clasifico y cuando.
--   2. La rotacion del refresh token distingue "rotado" de "revocado", para que
--      dos peticiones legitimas en paralelo -dos pestanas, un reintento tras un
--      401- no se cierren la sesion la una a la otra. Revocar sigue siendo
--      inmediato.
--
-- NOTA DE INTEGRACION
-- Esta migracion nacio en `feat/maplibre-geoapify` como 006 y traia un tercer
-- bloque: sustituir `properties` por una tabla `address_cleaning_profiles`
-- colgada de la direccion (1:1) y hacer DROP TABLE properties. Se ha retirado a
-- proposito. Las dos ramas resolvieron el mismo problema -la residencia estaba
-- duplicada entre `addresses` y `properties`- en direcciones opuestas, y la que
-- se conserva es la de `fix/booking-flow` (migraciones 005-007): la direccion
-- sigue siendo la fuente de verdad, pero el lugar sigue siendo una entidad con
-- nombre propio, varios por cliente y referenciable desde la orden
-- (`orders.property_id`). Un perfil 1:1 con la direccion no puede representar
-- "mis tres lugares" ni tener su propio predeterminado, que es justo lo que
-- pide el flujo de reserva de limpieza. Los dos bloques de abajo son
-- ortogonales a esa decision y se conservan intactos.
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
