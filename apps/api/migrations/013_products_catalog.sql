-- =============================================================================
-- Migration 013: catalogo de productos
--
-- Por que una tabla nueva y no `service_plans`
--
-- Antes de crearla se reviso lo que ya hay. `service_plans` (con service_type
-- 'KITS', migracion 008) parece el sitio natural, pero un plan es una variante
-- reservable de un servicio: tiene modelo de precio, duracion estimada, extras y
-- termina en una orden con su maquina de estados. Un producto es un articulo de
-- un listado: tiene precio y ya. Meterlo en `service_plans` obligaria a
-- inventarle un `pricing_model` y un tipo de servicio a cada bote de
-- desengrasante, y a que el motor de precios y el de reservas tuvieran que
-- ignorarlos. `service_extras` tampoco vale: un extra modifica una orden
-- existente, no se vende solo.
--
-- Asi que el producto es su propia tabla, pero copia las convenciones de las
-- otras dos para que no sea una isla: importe en centavos, `region_code`,
-- `active`, `display_order` y UNIQUE (region_code, code).
--
-- Alcance deliberado: esto es un catalogo, no una tienda. No hay carrito,
-- checkout, stock, variantes ni promociones, y por eso no hay tablas para nada
-- de eso. `category` es texto libre y no una tabla aparte por lo mismo: hoy solo
-- agrupa el listado. La estructura admite crecer sin reescribirse.
-- =============================================================================

CREATE TABLE IF NOT EXISTS products (
  id            BIGSERIAL PRIMARY KEY,
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  region_code   TEXT NOT NULL DEFAULT 'EC',
  -- Importe en centavos, como todo importe del sistema.
  amount        INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency      TEXT NOT NULL DEFAULT 'USD',
  -- Igual que en service_settings: URL de imagen como texto, sin introducir
  -- almacenamiento de archivos solo por esto. Las que ya se suben pasan por
  -- Cloudinary (ver services/uploadService.js) y aqui cabe su URL tal cual.
  image_url     TEXT,
  category      TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (region_code, code)
);

CREATE INDEX IF NOT EXISTS idx_products_listing
  ON products (region_code, display_order) WHERE active;

-- =============================================================================
-- Productos iniciales
--
-- Genericos a proposito: son los insumos que la empresa ya lleva a una limpieza,
-- asi que el catalogo arranca con existencias reales en lugar de con ejemplos.
-- Van en la migracion y no en el seed porque el seed es para datos de prueba
-- (cuentas, ordenes de ejemplo) y estos son configuracion del producto: tienen
-- que existir tambien en un entorno donde nunca se ejecute `db:seed`.
-- =============================================================================

INSERT INTO products (code, name, description, region_code, amount, currency, category, display_order)
VALUES
  ('MULTIUSOS-1L', 'Limpiador multiusos 1 L',
   'Diluible, apto para pisos, encimeras y superficies lavables. Aroma cítrico suave.',
   'EC', 450, 'USD', 'Superficies', 1),
  ('DESENGRASANTE-750', 'Desengrasante de cocina 750 ml',
   'Disuelve grasa fría en campanas, hornos y azulejos sin frotar.',
   'EC', 520, 'USD', 'Cocina', 2),
  ('LIMPIAVIDRIOS-500', 'Limpiavidrios 500 ml',
   'Secado rápido y sin marcas en ventanas, espejos y mamparas.',
   'EC', 380, 'USD', 'Superficies', 3),
  ('DESINFECTANTE-1L', 'Desinfectante de baños 1 L',
   'Elimina hongos y sarro en sanitarios, duchas y juntas.',
   'EC', 590, 'USD', 'Baño', 4),
  ('MICROFIBRA-X3', 'Paños de microfibra (pack de 3)',
   'Uno por zona para no arrastrar suciedad entre superficies. Lavables.',
   'EC', 650, 'USD', 'Accesorios', 5),
  ('QUITAMANCHAS-500', 'Quitamanchas para ropa 500 ml',
   'Pretratamiento para manchas de grasa, vino y tinta antes del lavado.',
   'EC', 480, 'USD', 'Lavandería', 6)
ON CONFLICT (region_code, code) DO NOTHING;

INSERT INTO products (code, name, description, region_code, amount, currency, category, display_order)
VALUES
  ('MULTIUSOS-1L', 'All-purpose cleaner 1 L',
   'Dilutable formula for floors, countertops and washable surfaces. Light citrus scent.',
   'US', 899, 'USD', 'Surfaces', 1),
  ('DESENGRASANTE-750', 'Kitchen degreaser 750 ml',
   'Cuts through cold grease on range hoods, ovens and tile without scrubbing.',
   'US', 1050, 'USD', 'Kitchen', 2),
  ('LIMPIAVIDRIOS-500', 'Glass cleaner 500 ml',
   'Streak-free, fast-drying finish on windows, mirrors and shower screens.',
   'US', 749, 'USD', 'Surfaces', 3),
  ('DESINFECTANTE-1L', 'Bathroom disinfectant 1 L',
   'Removes mildew and limescale from toilets, showers and grout.',
   'US', 1190, 'USD', 'Bathroom', 4),
  ('MICROFIBRA-X3', 'Microfiber cloths (3-pack)',
   'One per zone so dirt never travels between surfaces. Machine washable.',
   'US', 1290, 'USD', 'Accessories', 5),
  ('QUITAMANCHAS-500', 'Laundry stain remover 500 ml',
   'Pre-treatment for grease, wine and ink stains before washing.',
   'US', 970, 'USD', 'Laundry', 6)
ON CONFLICT (region_code, code) DO NOTHING;
