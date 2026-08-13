-- =============================================================================
-- Migration 009: Ropa in situ y ajuste de planes fijos de limpieza
--
-- 1. Ajusta los planes de limpieza a duraciones fijas de 2h, 4h y 6h.
--    Se actualizan únicamente los planes con prefijo -CLN- para que los planes
--    originales de integración (-CLEAN-) sigan sirviendo a las pruebas e2e.
--
-- 2. Inserta los adicionales exclusivos para ropa in situ (lavado, secado,
--    doblado, planchado) en Ecuador y EE.UU. (Connecticut).
-- =============================================================================

-- --- Actualización de planes de limpieza nuevos (Ecuador) ---
-- Ajustar Express a 2 horas (120 minutos)
UPDATE service_plans
   SET estimated_duration_minutes = 120,
       config = '{"minimumHours": 2}'::jsonb
 WHERE service_type = 'CLEANING' AND code = 'EC-CLN-EXPRESS';

-- Ajustar Estándar a 4 horas (240 minutos)
UPDATE service_plans
   SET estimated_duration_minutes = 240,
       config = '{"minimumHours": 4}'::jsonb
 WHERE service_type = 'CLEANING' AND code = 'EC-CLN-STANDARD';

-- Ajustar Profunda a 6 horas (360 minutos)
UPDATE service_plans
   SET estimated_duration_minutes = 360,
       config = '{"minimumHours": 6}'::jsonb
 WHERE service_type = 'CLEANING' AND code = 'EC-CLN-DEEP';


-- --- Actualización de planes de limpieza nuevos (EE.UU.) ---
-- Ajustar Express a 2 horas (120 minutos)
UPDATE service_plans
   SET estimated_duration_minutes = 120,
       config = '{"minimumHours": 2}'::jsonb
 WHERE service_type = 'CLEANING' AND code = 'US-CLN-EXPRESS';

-- Ajustar Estándar a 4 horas (240 minutos)
UPDATE service_plans
   SET estimated_duration_minutes = 240,
       config = '{"minimumHours": 4}'::jsonb
 WHERE service_type = 'CLEANING' AND code = 'US-CLN-STANDARD';

-- Ajustar Profunda a 6 horas (360 minutos)
UPDATE service_plans
   SET estimated_duration_minutes = 360,
       config = '{"minimumHours": 6}'::jsonb
 WHERE service_type = 'CLEANING' AND code = 'US-CLN-DEEP';


-- --- Restauración de los planes de pruebas originales (Ecuador) ---
UPDATE service_plans
   SET estimated_duration_minutes = 180,
       config = '{"minimumHours": 2}'::jsonb
 WHERE service_type = 'CLEANING' AND code = 'EC-CLEAN-STANDARD';

UPDATE service_plans
   SET estimated_duration_minutes = 300,
       config = '{"minimumHours": 3}'::jsonb
 WHERE service_type = 'CLEANING' AND code = 'EC-CLEAN-DEEP';

UPDATE service_plans
   SET estimated_duration_minutes = 360,
       config = '{"minimumHours": 4}'::jsonb
 WHERE service_type = 'CLEANING' AND code = 'EC-CLEAN-MOVE';


-- --- Inserción de extras exclusivos para Ropa In Situ ---
-- Ecuador (EC)
INSERT INTO service_extras (service_type, region_code, code, name, amount, added_duration_minutes)
VALUES
  ('CLEANING', 'EC', 'CLEAN-IN-SITU-WASH-DRY-FOLD', 'Lavado + secado + doblado (ropa in situ)', 600, 45),
  ('CLEANING', 'EC', 'CLEAN-IN-SITU-WASH-DRY-FOLD-IRON', 'Lavado + secado + doblado + planchado (ropa in situ)', 1000, 90),
  ('CLEANING', 'EC', 'CLEAN-IN-SITU-IRON', 'Solo planchado (ropa in situ)', 500, 45)
ON CONFLICT (region_code, code) DO UPDATE
SET name = EXCLUDED.name,
    amount = EXCLUDED.amount,
    added_duration_minutes = EXCLUDED.added_duration_minutes;

-- EE.UU. / Connecticut (US)
INSERT INTO service_extras (service_type, region_code, code, name, amount, added_duration_minutes)
VALUES
  ('CLEANING', 'US', 'CLEAN-IN-SITU-WASH-DRY-FOLD', 'In-situ Wash, Dry & Fold', 1500, 45),
  ('CLEANING', 'US', 'CLEAN-IN-SITU-WASH-DRY-FOLD-IRON', 'In-situ Wash, Dry, Fold & Iron', 2500, 90),
  ('CLEANING', 'US', 'CLEAN-IN-SITU-IRON', 'In-situ Iron only', 1200, 45)
ON CONFLICT (region_code, code) DO UPDATE
SET name = EXCLUDED.name,
    amount = EXCLUDED.amount,
    added_duration_minutes = EXCLUDED.added_duration_minutes;
