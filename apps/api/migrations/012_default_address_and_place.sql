-- =============================================================================
-- Migration 012: "el predeterminado" deja de ser una convencion y pasa a serlo
--                de verdad, para direcciones y para lugares de limpieza
--
-- `addresses.is_default` existia desde la 001 pero nada impedia que un cliente
-- tuviera dos marcadas -o ninguna teniendo direcciones-. Se sostenia solo con
-- que el repositorio se acordara de desmarcar la anterior; cualquier camino que
-- no pasara por ahi dejaba la base en un estado que la aplicacion no sabe leer:
-- con dos predeterminadas, "la direccion del cliente" depende del ORDER BY.
--
-- `properties` no tenia el concepto siquiera. La reserva de limpieza necesita
-- preseleccionar un lugar, y "el mas reciente" no es una respuesta: el cliente
-- tiene su casa, la de su madre y a veces una oficina, y quiere que la reserva
-- empiece en la que usa siempre.
--
-- Las dos reglas son la misma, y se escriben donde no se pueden saltar:
--
--   * como mucho uno   -> indice unico parcial (lo garantiza Postgres)
--   * al menos uno     -> lo mantiene el servicio, porque depende de cuantos
--                         quedan vivos: crear el primero lo marca, archivar el
--                         marcado asciende a otro. Un CHECK no puede expresar
--                         "existe al menos una fila del mismo usuario".
--
-- Ver addressService/propertyService y sus pruebas en tests/properties.e2e.test.js.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Direcciones: como mucho una predeterminada por cliente
-- -----------------------------------------------------------------------------

-- Antes del indice hay que dejar los datos en un estado que lo admita: si algun
-- cliente arrastra dos marcadas, se conserva la mas reciente. No se elige al
-- azar ni se desmarcan todas, que dejaria a ese cliente peor de lo que estaba.
UPDATE addresses SET is_default = FALSE
 WHERE is_default
   AND archived_at IS NULL
   AND id NOT IN (
     SELECT DISTINCT ON (user_id) id
       FROM addresses
      WHERE is_default AND archived_at IS NULL
      ORDER BY user_id, created_at DESC
   );

-- Una direccion archivada ya no cuenta: puede quedar marcada en el historial
-- sin bloquear a la que la sustituye.
CREATE UNIQUE INDEX IF NOT EXISTS idx_addresses_one_default
  ON addresses (user_id) WHERE is_default AND archived_at IS NULL;

-- Quien tenga direcciones pero ninguna marcada (posible hasta ahora) recibe la
-- mas reciente como predeterminada.
UPDATE addresses SET is_default = TRUE
 WHERE id IN (
   SELECT DISTINCT ON (a.user_id) a.id
     FROM addresses a
    WHERE a.archived_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM addresses d
         WHERE d.user_id = a.user_id AND d.archived_at IS NULL AND d.is_default
      )
    ORDER BY a.user_id, a.created_at DESC
 );

-- -----------------------------------------------------------------------------
-- 2. Lugares de limpieza: el mismo concepto, ahora que existe
--
-- El lugar es el perfil de limpieza (que limpiamos y como se entra) y vive en
-- una direccion (migracion 005). Su predeterminado es SUYO y no se deriva del
-- de la direccion: el cliente puede recibir la ropa en la oficina -direccion
-- predeterminada- y querer que la limpieza empiece siempre en su casa.
-- -----------------------------------------------------------------------------
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_one_default
  ON properties (user_id) WHERE is_default;

-- Los lugares que ya existen se quedan sin predeterminado, asi que se asciende
-- uno por cliente: el de la direccion predeterminada si lo hay, y si no el mas
-- reciente. Nadie acaba esta migracion con lugares y ninguno marcado.
UPDATE properties SET is_default = TRUE
 WHERE id IN (
   SELECT DISTINCT ON (p.user_id) p.id
     FROM properties p
     LEFT JOIN addresses a ON a.id = p.address_id
    WHERE NOT EXISTS (
      SELECT 1 FROM properties d WHERE d.user_id = p.user_id AND d.is_default
    )
    ORDER BY p.user_id, COALESCE(a.is_default, FALSE) DESC, p.created_at DESC
 );

-- -----------------------------------------------------------------------------
-- 3. El tamano del lugar es del lugar
--
-- `cleaning_details` guarda `area_value`/`area_unit` desde la 001, pero el lugar
-- no los tenia: cuantos metros mide una casa no cambia entre una visita y la
-- siguiente, asi que preguntarlo en cada reserva era pedir dos veces el mismo
-- dato. Con estas columnas el lugar puede responder por si mismo y la reserva
-- solo lo sobreescribe si el cliente lo corrige (ver domain/cleaning/placeProfile).
-- -----------------------------------------------------------------------------
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS area_value NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS area_unit  TEXT;
