-- =============================================================================
-- Migration 010: la referencia del lugar deja de llamarse como su proveedor
--
-- `addresses.google_place_id` nacio con el nombre del unico proveedor que
-- habia. Al cambiar el mapa a MapLibre y la geocodificacion a Geoapify, ese
-- nombre pasaba a mentir: la columna seguiria guardando identificadores, pero
-- ya no de Google.
--
-- El esquema no deberia obligar a un despliegue cada vez que cambie un
-- proveedor externo, asi que la columna pasa a describir lo que es —la
-- referencia del lugar segun QUIEN lo geocodifico— en dos datos:
--
--   * provider_place_id   -> el identificador, tal cual lo devuelve el proveedor
--   * geocoding_provider  -> quien lo emitio ('GOOGLE', 'GEOAPIFY', ...)
--
-- Sin el segundo, los identificadores antiguos y los nuevos quedarian
-- mezclados en la misma columna sin forma de distinguirlos: un place_id de
-- Google no significa nada para Geoapify.
--
-- Se conserva —no se borra— lo que ya habia: RENAME mantiene los valores, y el
-- backfill etiqueta como GOOGLE las direcciones que se geocodificaron cuando
-- Google era el proveedor. Ninguna direccion existente cambia de sitio ni
-- pierde texto.
--
-- Nada de esto es imprescindible para usar una direccion: lo que permite
-- encontrar la casa son `latitude`/`longitude` y el texto que escribe el
-- cliente. El identificador es una referencia de cortesia y la aplicacion tiene
-- que seguir funcionando si viene vacio.
-- =============================================================================

-- El RENAME no es idempotente por si mismo (no existe IF EXISTS para columnas
-- en RENAME), y el runner ya evita reaplicar migraciones. Aun asi se comprueba,
-- para que reejecutar el archivo a mano en un entorno a medias no reviente.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'addresses' AND column_name = 'google_place_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'addresses' AND column_name = 'provider_place_id'
  ) THEN
    ALTER TABLE addresses RENAME COLUMN google_place_id TO provider_place_id;
  END IF;
END $$;

-- Por si la tabla se creara desde cero en el futuro sin pasar por la 004.
ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS provider_place_id  TEXT,
  ADD COLUMN IF NOT EXISTS geocoding_provider TEXT;

-- Lo que ya existia venia de Google: se etiqueta como tal en lugar de asumir
-- que todo es del proveedor nuevo, que seria falso y ademas inutil (esos
-- identificadores no sirven en Geoapify).
UPDATE addresses
   SET geocoding_provider = 'GOOGLE'
 WHERE provider_place_id IS NOT NULL
   AND geocoding_provider IS NULL;

-- Sin CHECK sobre la lista de proveedores a proposito: anadir uno nuevo no
-- puede exigir una migracion. Y tampoco se obliga a que los dos campos vayan
-- juntos: que un identificador huerfano impidiera guardar una direccion seria
-- justo lo contrario de lo que se busca aqui. La coherencia (id sin proveedor,
-- o proveedor sin id) la mantiene addressService, que los escribe a la vez.
