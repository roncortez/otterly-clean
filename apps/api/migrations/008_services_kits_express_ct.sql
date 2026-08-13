-- =============================================================================
-- Migration 008: Kits de limpieza, Limpieza Express y zona Connecticut
--
-- Tres cambios coordinados:
--
--   1. KITS como nuevo tipo de servicio. Se declara en todos los CHECK que hoy
--      solo conocen CLEANING/LAUNDRY/ALTERATION, se crea su tabla de detalle y
--      se le da una fila en service_settings (inactivo por defecto; Operaciones
--      lo activa cuando el flujo este listo).
--
--   2. EXPRESS en cleaning_type. La maquina de estados de limpieza ya modela el
--      trabajo; lo que faltaba era distinguir una limpieza rapida de una
--      estandar en la tabla de detalle para que Operaciones pueda filtrar la
--      cola de trabajo por tipo.
--
--   3. Zona Connecticut (US-CT) con su impuesto real (6.35 %) y cobertura
--      geografica inicial centrada en Hartford.
--
--   4. Seed de planes de servicio para EC y US con precios de arranque
--      editables despues desde el panel de Operaciones.
-- =============================================================================

-- =============================================================================
-- 1. AMPLIAR ENUMERADOS
-- =============================================================================

-- --- service_plans -----------------------------------------------------------
ALTER TABLE service_plans DROP CONSTRAINT IF EXISTS service_plans_service_type_check;
ALTER TABLE service_plans
  ADD CONSTRAINT service_plans_service_type_check
  CHECK (service_type IN ('CLEANING', 'LAUNDRY', 'ALTERATION', 'KITS'));

-- --- service_extras ----------------------------------------------------------
ALTER TABLE service_extras DROP CONSTRAINT IF EXISTS service_extras_service_type_check;
ALTER TABLE service_extras
  ADD CONSTRAINT service_extras_service_type_check
  CHECK (service_type IN ('CLEANING', 'LAUNDRY', 'ALTERATION', 'KITS'));

-- --- orders ------------------------------------------------------------------
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_service_type_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_service_type_check
  CHECK (service_type IN ('CLEANING', 'LAUNDRY', 'ALTERATION', 'KITS'));

-- --- service_settings --------------------------------------------------------
ALTER TABLE service_settings DROP CONSTRAINT IF EXISTS service_settings_pkey;
ALTER TABLE service_settings DROP CONSTRAINT IF EXISTS service_settings_service_type_check;
ALTER TABLE service_settings
  ADD CONSTRAINT service_settings_service_type_check
  CHECK (service_type IN ('CLEANING', 'LAUNDRY', 'ALTERATION', 'KITS'));
ALTER TABLE service_settings ADD PRIMARY KEY (service_type);

-- --- booking_blackouts -------------------------------------------------------
ALTER TABLE booking_blackouts DROP CONSTRAINT IF EXISTS booking_blackouts_service_type_check;
ALTER TABLE booking_blackouts
  ADD CONSTRAINT booking_blackouts_service_type_check
  CHECK (service_type IN ('CLEANING', 'LAUNDRY', 'ALTERATION', 'KITS'));

-- --- cleaning_details: agregar EXPRESS ---------------------------------------
ALTER TABLE cleaning_details DROP CONSTRAINT IF EXISTS cleaning_details_cleaning_type_check;
ALTER TABLE cleaning_details
  ADD CONSTRAINT cleaning_details_cleaning_type_check
  CHECK (cleaning_type IN ('EXPRESS', 'STANDARD', 'DEEP', 'MOVE_IN_OUT', 'POST_CONSTRUCTION'));

-- =============================================================================
-- 2. TABLA DE DETALLE DE KITS
--
-- Un kit es un producto empaquetado que se entrega en el domicilio. No necesita
-- el perfil de acceso de limpieza ni el tracking de bolsas de lavanderia:
-- solo la variante elegida, la cantidad y las instrucciones de entrega.
-- =============================================================================

CREATE TABLE IF NOT EXISTS kit_details (
  order_id              BIGINT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  -- Variante del kit seleccionado. Actua como etiqueta operativa del plan.
  variant_code          TEXT NOT NULL DEFAULT 'BASIC',
  quantity              SMALLINT NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
  delivery_instructions TEXT,
  special_instructions  TEXT
);

-- =============================================================================
-- 3. ZONA CONNECTICUT (EE.UU.)
--
-- Hartford es la capital del estado; un radio de 65 km cubre gran parte de
-- Connecticut. El impuesto (6.35 %) se aplica a nivel de zona, no de region,
-- siguiendo el patron ya establecido en service_zones.tax_rate_override.
-- =============================================================================

INSERT INTO service_zones (region_code, code, name, city, administrative_area,
  tax_rate_override, active, center_latitude, center_longitude, radius_km)
VALUES ('US', 'US-CT', 'Connecticut', 'Hartford', 'Connecticut',
  0.0635, TRUE, 41.7658, -72.6851, 65)
ON CONFLICT (region_code, code) DO NOTHING;

-- =============================================================================
-- 4. CONFIGURACION COMERCIAL DE KITS
-- =============================================================================

INSERT INTO service_settings
  (service_type, active, display_name, description, customer_info, icon, display_order)
VALUES
  ('KITS', FALSE,
   'Kits de limpieza',
   'Productos de limpieza seleccionados y entregados en tu puerta.',
   'Recibe en la comodidad de tu hogar un kit con todo lo que necesitas para mantener tu espacio limpio. Llega en 24-48 horas.',
   'Package', 3)
ON CONFLICT (service_type) DO NOTHING;

-- =============================================================================
-- 5. PLANES DE SERVICIO
--
-- Todos los importes en centavos (unidad menor de la moneda), como establece
-- el principio general del sistema.
--
-- Limpieza: PER_HOUR con minimumHours en config. El frontend usa esas horas
-- minimas para calcular el "precio desde" sin exponer la tarifa por hora.
--
-- Lavanderia: PER_WEIGHT. La unidad (kg / lb) la fija el config.unit; el peso
-- real se confirma al recibir la ropa y el precio final puede ajustarse.
--
-- Kits: FIXED. El precio esta fijo en base_amount; la cantidad (quantity) se
-- guarda en kit_details y hoy no multiplica el precio (futuro: PER_ITEM).
-- =============================================================================

-- --- Limpieza Ecuador --------------------------------------------------------
INSERT INTO service_plans
  (service_type, code, name, description, region_code, pricing_model,
   base_amount, currency, config, estimated_duration_minutes, active, display_order)
VALUES
  ('CLEANING', 'EC-CLN-EXPRESS',
   'Limpieza Express',
   'Mantenimiento rápido de las áreas principales. Ideal para una limpieza rápida entre limpiezas completas.',
   'EC', 'PER_HOUR',
   1100, 'USD',
   '{"minimumHours": 2}'::jsonb,
   150, TRUE, 1),

  ('CLEANING', 'EC-CLN-STANDARD',
   'Limpieza Estándar',
   'Limpieza completa de todos los espacios de tu hogar. La opción más popular.',
   'EC', 'PER_HOUR',
   1100, 'USD',
   '{"minimumHours": 3}'::jsonb,
   210, TRUE, 2),

  ('CLEANING', 'EC-CLN-DEEP',
   'Limpieza Profunda',
   'Limpieza a fondo con atención al detalle en cada rincón. Recomendada cada temporada.',
   'EC', 'PER_HOUR',
   1300, 'USD',
   '{"minimumHours": 5}'::jsonb,
   360, TRUE, 3)
ON CONFLICT (region_code, code) DO NOTHING;

-- --- Limpieza EE.UU. (Connecticut) ------------------------------------------
INSERT INTO service_plans
  (service_type, code, name, description, region_code, pricing_model,
   base_amount, currency, config, estimated_duration_minutes, active, display_order)
VALUES
  ('CLEANING', 'US-CLN-EXPRESS',
   'Express Cleaning',
   'Quick maintenance of main areas. Perfect for upkeep between deep cleans.',
   'US', 'PER_HOUR',
   4500, 'USD',
   '{"minimumHours": 2}'::jsonb,
   150, TRUE, 1),

  ('CLEANING', 'US-CLN-STANDARD',
   'Standard Cleaning',
   'Full cleaning of every room in your home. Our most popular service.',
   'US', 'PER_HOUR',
   4500, 'USD',
   '{"minimumHours": 3}'::jsonb,
   210, TRUE, 2),

  ('CLEANING', 'US-CLN-DEEP',
   'Deep Cleaning',
   'Thorough, detail-oriented cleaning from top to bottom. Recommended every season.',
   'US', 'PER_HOUR',
   5000, 'USD',
   '{"minimumHours": 5}'::jsonb,
   360, TRUE, 3)
ON CONFLICT (region_code, code) DO NOTHING;

-- --- Lavanderia Ecuador ------------------------------------------------------
INSERT INTO service_plans
  (service_type, code, name, description, region_code, pricing_model,
   base_amount, currency, config, active, display_order)
VALUES
  ('LAUNDRY', 'EC-LAU-WASHFOLD',
   'Wash & Fold',
   'Recogemos tu ropa, la lavamos, secamos y doblamos. Entregamos en tu puerta.',
   'EC', 'PER_WEIGHT',
   250, 'USD',
   '{"unit": "kg", "minimumUnits": 3}'::jsonb,
   TRUE, 1)
ON CONFLICT (region_code, code) DO NOTHING;

-- --- Lavanderia EE.UU. (Connecticut) -----------------------------------------
INSERT INTO service_plans
  (service_type, code, name, description, region_code, pricing_model,
   base_amount, currency, config, active, display_order)
VALUES
  ('LAUNDRY', 'US-LAU-WASHFOLD',
   'Wash & Fold',
   'We pick up, wash, dry and fold your laundry, then deliver it back to your door.',
   'US', 'PER_WEIGHT',
   125, 'USD',
   '{"unit": "lb", "minimumUnits": 10}'::jsonb,
   TRUE, 1)
ON CONFLICT (region_code, code) DO NOTHING;

-- --- Kits de limpieza Ecuador ------------------------------------------------
INSERT INTO service_plans
  (service_type, code, name, description, region_code, pricing_model,
   base_amount, currency, config, active, display_order)
VALUES
  ('KITS', 'EC-KIT-BASIC',
   'Kit Básico',
   'Limpiador multiusos, desengrasante, limpiavidrios y esponjas. Para el mantenimiento diario.',
   'EC', 'FIXED',
   1800, 'USD',
   '{}'::jsonb,
   TRUE, 1),

  ('KITS', 'EC-KIT-COMPLETE',
   'Kit Completo',
   'Todo el Kit Básico más desinfectante, quitamanchas, limpiador de baños y microfibras premium.',
   'EC', 'FIXED',
   3500, 'USD',
   '{}'::jsonb,
   TRUE, 2)
ON CONFLICT (region_code, code) DO NOTHING;

-- --- Kits de limpieza EE.UU. (Connecticut) -----------------------------------
INSERT INTO service_plans
  (service_type, code, name, description, region_code, pricing_model,
   base_amount, currency, config, active, display_order)
VALUES
  ('KITS', 'US-KIT-BASIC',
   'Basic Kit',
   'All-purpose cleaner, degreaser, glass cleaner and sponges. For daily upkeep.',
   'US', 'FIXED',
   2800, 'USD',
   '{}'::jsonb,
   TRUE, 1),

  ('KITS', 'US-KIT-COMPLETE',
   'Complete Kit',
   'Everything in the Basic Kit plus disinfectant, stain remover, bathroom cleaner and premium microfibers.',
   'US', 'FIXED',
   5500, 'USD',
   '{}'::jsonb,
   TRUE, 2)
ON CONFLICT (region_code, code) DO NOTHING;
