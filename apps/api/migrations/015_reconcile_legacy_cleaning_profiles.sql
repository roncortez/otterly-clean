-- =============================================================================
-- Migration 015: se retira `address_cleaning_profiles`
--
-- Segunda mitad de la reconciliacion que empieza en la 005 (ver el bloque 0 de
-- aquel archivo). Alli se recreo `properties` con la forma que tenia en la 002 y
-- se recuperaron las columnas que esa forma admitia. Lo demas -como se entra,
-- mascotas, superficie- no cabia todavia: son columnas que anaden la 007 y la
-- 012. Aqui ya existen, asi que se termina el traslado y se retira la tabla.
--
-- Solo afecta a las bases de desarrollo que llegaron a aplicar la 006 de
-- `feat/maplibre-geoapify`. En una base nueva `address_cleaning_profiles` no
-- existe y todo este archivo es un no-op.
--
-- Se retira en vez de conservarse porque dejarla seria mantener dos modelos del
-- mismo dato: el que la aplicacion lee (`properties`) y uno huerfano que nadie
-- actualiza y que la proxima persona que abra el esquema tendria que averiguar
-- si importa.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.address_cleaning_profiles') IS NULL THEN
    RETURN;
  END IF;

  -- El enlace se hace por direccion: la 005 dejo cada inmueble recreado
  -- apuntando a la direccion de la que venia.
  UPDATE properties p
     SET access_method       = COALESCE(p.access_method, acp.access_method),
         access_instructions = COALESCE(p.access_instructions, acp.access_instructions),
         parking_instructions = COALESCE(p.parking_instructions, acp.parking_instructions),
         has_pets            = COALESCE(acp.has_pets, p.has_pets),
         pets                = COALESCE(acp.pets, p.pets),
         pet_instructions    = COALESCE(p.pet_instructions, acp.pet_instructions),
         area_value          = COALESCE(p.area_value, acp.area_value),
         area_unit           = COALESCE(p.area_unit, acp.area_unit),
         -- El secreto ya viajo cifrado en la 005; aqui solo se cubre el caso de
         -- un inmueble que existia antes y no lo tenia.
         access_code         = COALESCE(p.access_code, acp.access_secret_encrypted),
         updated_at          = NOW()
    FROM address_cleaning_profiles acp
   WHERE p.address_id = acp.address_id;

  DROP TABLE address_cleaning_profiles;
END $$;
