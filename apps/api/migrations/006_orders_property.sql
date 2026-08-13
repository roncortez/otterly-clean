-- =============================================================================
-- Migration 006: Las ordenes referencian el inmueble
--
-- La orden siempre guarda un snapshot de los datos con que se confirmo (la
-- direccion se copia, el detalle de limpieza se copia). Sobre eso, ahora
-- referencia tambien al inmueble cuando existe: sirve para trazabilidad
-- ("esta orden es de este inmueble") sin cambiar el hecho de que el historial
-- es intocable. El inmueble se puede borrar o editar despues; la orden conserva
-- su snapshot y, como mucho, pierde el puntero (ON DELETE SET NULL).
-- =============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS property_id BIGINT REFERENCES properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_property ON orders(property_id);
