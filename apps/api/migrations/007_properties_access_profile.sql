-- =============================================================================
-- Migration 007: El inmueble pasa a ser el perfil completo de acceso
--
-- Hasta ahora `properties` guardaba solo la identidad (tipo, habitaciones,
-- banos), el codigo de acceso cifrado y unas notas. Las instrucciones de acceso
-- al domicilio vivian unicamente en el snapshot de cada orden (cleaning_details).
-- El inmueble es el perfil de la residencia y debe ser una sola tabla, un solo
-- origen de verdad para los datos persistentes; la orden seguira copiando su
-- snapshot al confirmar (el historial es intocable). Estas columnas espejan las
-- de cleaning_details para que el pre-relleno y el guardado sean completos.
--
-- El secreto sigue viajando en access_code (cifrado); aqui van el metodo y las
-- instrucciones legibles. Se reutilizan las convenciones y enums del detalle.
-- =============================================================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS access_method TEXT,
  ADD COLUMN IF NOT EXISTS access_instructions TEXT,
  ADD COLUMN IF NOT EXISTS parking_instructions TEXT,
  ADD COLUMN IF NOT EXISTS customer_present BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS has_pets BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pets JSONB,
  ADD COLUMN IF NOT EXISTS pets_secured BOOLEAN,
  ADD COLUMN IF NOT EXISTS pet_instructions TEXT,
  ADD COLUMN IF NOT EXISTS delicate_items TEXT;

-- El metodo de acceso es un enumerado cerrado, igual que en cleaning_details.
ALTER TABLE properties
  ADD CONSTRAINT properties_access_method_check
  CHECK (access_method IS NULL OR access_method IN
    ('CUSTOMER_OPENS', 'KEY', 'DOOR_CODE', 'CONCIERGE', 'LOCKBOX', 'OTHER'));
