-- =============================================================================
-- Migration 014: las opciones de eleccion salen de la base, empezando por la
--                fragancia
--
-- La fragancia se capturaba como texto libre (`cleaning_details.fragrance_preference`,
-- un input de 60 caracteres) y en lavanderia directamente no se preguntaba. Texto
-- libre significa que "lavanda", "Lavanda", "lavandaa" y "el que huela rico" son
-- valores distintos para el trabajador que tiene que elegir el producto, y que
-- nadie puede saber que fragancias se ofrecen sin leer las ordenes.
--
-- Por que una tabla generica y no `fragrances`
--
-- Esta no es la ultima lista de opciones que va a necesitar configurarse
-- (preferencias de doblado, tipos de suelo, motivos de cancelacion...). Una
-- tabla por lista significa una migracion, un repositorio y un endpoint cada
-- vez. `catalog_options` guarda cualquiera de esas listas discriminada por
-- `kind`, que es lo unico que las diferencia: todas son codigo + etiqueta +
-- orden + activo.
--
-- No se reutilizo `service_extras` porque un extra tiene precio y modifica el
-- total de la orden; una fragancia es una preferencia sin coste. Confundirlos
-- obligaria a llevar `amount = 0` y a que el motor de precios los filtrara.
--
-- El dato se guarda por CODIGO, no por id ni por etiqueta: la orden es historia
-- y tiene que seguir leyendose aunque Operaciones renombre la opcion o la
-- desactive despues. Por eso tampoco hay clave foranea desde los detalles: una
-- fragancia retirada no puede romper una orden de hace seis meses.
--
-- ALCANCE: aqui solo se modela y se consume el dato. La pantalla de ADMIN para
-- administrar fragancias NO entra en esta entrega (esta fuera de alcance a
-- proposito); las filas se editan por SQL hasta que exista.
-- =============================================================================

CREATE TABLE IF NOT EXISTS catalog_options (
  id            BIGSERIAL PRIMARY KEY,
  -- Que lista es. 'FRAGRANCE' es la primera; las siguientes no necesitan DDL.
  kind          TEXT NOT NULL,
  code          TEXT NOT NULL,
  label         TEXT NOT NULL,
  description   TEXT,
  region_code   TEXT NOT NULL DEFAULT 'EC',
  -- NULL = sirve para cualquier servicio. La fragancia la usan limpieza y
  -- lavanderia, y es la misma lista: el cliente no entiende por que su casa
  -- puede oler a lavanda y su ropa no.
  service_type  TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, region_code, code)
);

CREATE INDEX IF NOT EXISTS idx_catalog_options_lookup
  ON catalog_options (kind, region_code, display_order) WHERE active;

-- -----------------------------------------------------------------------------
-- Fragancias iniciales
--
-- 'NONE' va primero y existe como opcion explicita: "sin fragancia" es una
-- eleccion frecuente (alergias, bebes) y dejarla como "no rellenar el campo" la
-- volvia indistinguible de "no me preguntaron".
-- -----------------------------------------------------------------------------
INSERT INTO catalog_options (kind, code, label, description, region_code, display_order)
VALUES
  ('FRAGRANCE', 'NONE',     'Sin fragancia', 'Productos neutros, sin aroma añadido.', 'EC', 1),
  ('FRAGRANCE', 'FRESH',    'Fresco',        'Aroma limpio y ligero, tipo algodón.',  'EC', 2),
  ('FRAGRANCE', 'CITRUS',   'Cítrico',       'Notas de limón y naranja.',             'EC', 3),
  ('FRAGRANCE', 'LAVENDER', 'Lavanda',       'Floral suave, relajante.',              'EC', 4),
  ('FRAGRANCE', 'OCEAN',    'Brisa marina',  'Aroma fresco y limpio, tipo marino.',   'EC', 5)
ON CONFLICT (kind, region_code, code) DO NOTHING;

INSERT INTO catalog_options (kind, code, label, description, region_code, display_order)
VALUES
  ('FRAGRANCE', 'NONE',     'Fragrance free', 'Neutral products, no added scent.',   'US', 1),
  ('FRAGRANCE', 'FRESH',    'Fresh',          'Light, clean cotton-like scent.',     'US', 2),
  ('FRAGRANCE', 'CITRUS',   'Citrus',         'Lemon and orange notes.',             'US', 3),
  ('FRAGRANCE', 'LAVENDER', 'Lavender',       'Soft floral, calming.',               'US', 4),
  ('FRAGRANCE', 'OCEAN',    'Ocean breeze',   'Crisp, clean marine scent.',          'US', 5)
ON CONFLICT (kind, region_code, code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Lavanderia tambien pregunta la fragancia
--
-- `detergent_preference` ya existia, pero responde a otra cosa (hipoalergenico,
-- sin perfume, el del cliente). Que un detergente sea 'FRAGRANCE_FREE' es una
-- propiedad del producto; que fragancia quiere el cliente es una eleccion suya,
-- y son preguntas distintas que se contestaban con el mismo campo.
-- -----------------------------------------------------------------------------
ALTER TABLE laundry_details
  ADD COLUMN IF NOT EXISTS fragrance_code TEXT;

-- -----------------------------------------------------------------------------
-- Limpieza deja de guardar texto libre
--
-- La columna se conserva (es historia de ordenes ya confirmadas) pero a partir
-- de ahora recibe un `code` del catalogo. Los valores antiguos que coinciden con
-- una fragancia conocida se normalizan; el resto se deja tal cual, porque un
-- texto que el cliente escribio es informacion y perderla seria peor que
-- tenerla sin normalizar.
-- -----------------------------------------------------------------------------
UPDATE cleaning_details SET fragrance_preference = 'NONE'
 WHERE lower(btrim(fragrance_preference)) IN ('sin fragancia', 'ninguna', 'ninguno', 'no', 'fragrance free', 'none');

UPDATE cleaning_details SET fragrance_preference = 'LAVENDER'
 WHERE lower(btrim(fragrance_preference)) IN ('lavanda', 'lavander', 'lavender');

UPDATE cleaning_details SET fragrance_preference = 'CITRUS'
 WHERE lower(btrim(fragrance_preference)) IN ('citrico', 'cítrico', 'citrus', 'limon', 'limón');

UPDATE cleaning_details SET fragrance_preference = 'FRESH'
 WHERE lower(btrim(fragrance_preference)) IN ('fresco', 'fresh');

UPDATE cleaning_details SET fragrance_preference = 'OCEAN'
 WHERE lower(btrim(fragrance_preference)) IN ('brisa marina', 'marino', 'ocean', 'ocean breeze');
