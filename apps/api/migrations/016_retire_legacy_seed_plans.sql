-- =============================================================================
-- Migration 016: se retiran los planes que dejo el seed original
--
-- EL PROBLEMA. El catalogo de limpieza de Ecuador ofrecia seis planes y tres
-- sobraban. Convivian dos familias que describen el mismo negocio:
--
--   EC-CLEAN-STANDARD  Limpieza estándar   3 h   $33.00   <- seed
--   EC-CLEAN-DEEP      Limpieza profunda   5 h   $82.50   <- seed
--   EC-CLEAN-MOVE      Limpieza de mudanza 6 h  $108.00   <- seed
--   EC-CLN-EXPRESS     Limpieza Express    2 h   $22.00   <- 008 (el bueno)
--   EC-CLN-STANDARD    Limpieza Estándar   4 h   $44.00   <- 008 (el bueno)
--   EC-CLN-DEEP        Limpieza Profunda   6 h   $78.00   <- 008 (el bueno)
--
-- El cliente veia "Limpieza estándar" y "Limpieza Estándar" seguidos, a
-- precios distintos, sin manera de saber cual pedir. Lo mismo en lavanderia
-- (`EC-LAUNDRY-*` frente a `EC-LAU-WASHFOLD`) y en la region US.
--
-- POR QUE PASO. La 008 trajo el catalogo comercial de `fix/booking-flow` con
-- codigos nuevos e `ON CONFLICT DO NOTHING`. Como los codigos no chocaban con
-- los del seed, no hubo conflicto que ignorar: se anadieron al lado. Los de la
-- 008 son los que manda negocio —son los que la 009 ajusta a 2/4/6 horas—, asi
-- que los que sobran son los del seed.
--
-- POR QUE `active = FALSE` Y NO `DELETE`. `orders.plan_id` apunta aqui con
-- `ON DELETE SET NULL`: borrarlos dejaria sin plan a las reservas ya hechas
-- sobre ellos, que es perder historia para arreglar un catalogo. Desactivar
-- basta, porque `listPlans` solo devuelve activos: dejan de ofrecerse y las
-- ordenes viejas se siguen leyendo enteras.
--
-- El seed ya no los crea, asi que en una base nueva esta migracion no encuentra
-- nada que desactivar y es un no-op.
-- =============================================================================

UPDATE service_plans
   SET active = FALSE
 WHERE code IN (
         'EC-CLEAN-STANDARD',
         'EC-CLEAN-DEEP',
         'EC-CLEAN-MOVE',
         'EC-LAUNDRY-WASHFOLD',
         'EC-LAUNDRY-BAG',
         'EC-LAUNDRY-IRON',
         'US-CLEAN-STANDARD',
         'US-LAUNDRY-WASHFOLD'
       )
   AND active;

-- Los extras del seed corrian la misma suerte pero al reves: `CLEAN-OVEN`,
-- `CLEAN-FRIDGE` y compania son adicionales legitimos que ninguna otra
-- migracion duplica, asi que se quedan. Solo se retira `CLEAN-LAUNDRY`
-- ("Lavado de ropa en casa"), que es exactamente lo que ofrecen los
-- `CLEAN-IN-SITU-*` de la 009 con mas detalle y mejor precio.
UPDATE service_extras
   SET active = FALSE
 WHERE code = 'CLEAN-LAUNDRY'
   AND active;
