-- =============================================================================
-- Migration 003: Configuracion administrable de la plataforma
--
-- Convierte en datos administrables lo que antes solo se podia cambiar tocando
-- codigo o seeds:
--
--   1. Roles multiples por persona (user_roles), en lugar de users.role.
--   2. Configuracion comercial de cada tipo de servicio (service_settings).
--   3. Bloqueos comerciales de agenda (booking_blackouts).
--   4. Datos publicos de la empresa (app_settings, clave 'company').
--
-- Lo que NO entra aqui, deliberadamente: secretos, credenciales, CORS ni nada
-- de config/env. Ver docs/SECURITY.md.
-- =============================================================================

-- =============================================================================
-- 1. ROLES MULTIPLES
--
-- Una misma persona puede trabajar operativamente y ademas administrar: alguien
-- puede ser ADMIN y STAFF a la vez. Un CHECK sobre una columna de texto no
-- admite eso, y una lista separada por comas seria imposible de consultar e
-- indexar. Se modela como relacion, que es lo que realmente es.
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_roles (
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('CUSTOMER', 'STAFF', 'ADMIN')),
  granted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles (role);

-- Traslada el rol unico existente. El runner aplica cada migracion una sola
-- vez, asi que aqui users.role todavia existe (lo creo 001_baseline).
INSERT INTO user_roles (user_id, role)
SELECT id, role FROM users
ON CONFLICT DO NOTHING;

-- A partir de aqui la unica fuente de verdad de los roles es user_roles.
-- Mantener tambien users.role daria dos verdades que se pueden contradecir.
DROP INDEX IF EXISTS idx_users_role_status;
ALTER TABLE users DROP COLUMN IF EXISTS role;

CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- =============================================================================
-- 2. CONFIGURACION COMERCIAL DE LOS SERVICIOS
--
-- El tipo de servicio (CLEANING / LAUNDRY / ALTERATION) sigue siendo dominio:
-- cada uno tiene su maquina de estados, su tabla de detalle y sus reglas en
-- codigo. Lo que esta tabla administra es la capa COMERCIAL de esos tres tipos
-- conocidos: si se ofrecen, como se llaman de cara al cliente y en que orden
-- aparecen.
--
-- Por eso la clave primaria es el propio service_type y no un BIGSERIAL: no se
-- pueden inventar tipos nuevos desde la interfaz, solo configurar los que el
-- dominio implementa.
-- =============================================================================

CREATE TABLE IF NOT EXISTS service_settings (
  service_type   TEXT PRIMARY KEY
                   CHECK (service_type IN ('CLEANING', 'LAUNDRY', 'ALTERATION')),
  -- Se ofrece comercialmente. Distinto de "implementado en el dominio":
  -- un servicio puede estar implementado y apagado por decision de negocio.
  active         BOOLEAN NOT NULL DEFAULT FALSE,
  display_name   TEXT NOT NULL,
  description    TEXT,
  -- Texto largo que se le muestra al cliente antes de reservar.
  customer_info  TEXT,
  -- Nombre del icono (lucide) o URL de imagen. Se guarda como texto para no
  -- introducir almacenamiento de archivos solo por esto.
  icon           TEXT,
  image_url      TEXT,
  display_order  INTEGER NOT NULL DEFAULT 0,
  updated_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Valores iniciales: los mismos textos que hoy estan escritos en el dominio y
-- en la portada, para que tras `npm run db:reset` la aplicacion siga igual.
INSERT INTO service_settings
  (service_type, active, display_name, description, customer_info, icon, display_order)
VALUES
  ('CLEANING', TRUE, 'Limpieza residencial',
   'Hogares y oficinas impecables, adaptados a tu horario y necesidades.',
   'Llevamos productos e insumos. Puedes elegir las areas prioritarias y dejar instrucciones de acceso si no estaras en casa.',
   'Sparkles', 1),
  ('LAUNDRY', TRUE, 'Lavanderia a domicilio',
   'Lavado, secado, doblado y cuidado profesional de prendas con trazabilidad por bolsa.',
   'Recogemos y entregamos en tu puerta. Cada bolsa lleva un codigo ligado a tu pedido para que nunca se confunda con la de otra persona.',
   'Shirt', 2),
  -- Preparado en el dominio pero todavia no ofrecido: nace inactivo.
  ('ALTERATION', FALSE, 'Arreglo de prendas',
   'Ajustes de bastas, cierres y costuras con altos estandares de calidad.',
   'Revisamos la prenda antes de dar un precio. El arreglo se cotiza tras la inspeccion.',
   'Scissors', 3)
ON CONFLICT (service_type) DO NOTHING;

-- =============================================================================
-- 3. BLOQUEOS COMERCIALES DE AGENDA
--
-- Responde a "hoy no aceptamos reservas" o "del 25 al 27 cerramos". Es una
-- decision COMERCIAL de la plataforma y no debe confundirse con
-- staff_availability, que describe cuando puede trabajar una persona concreta.
--
-- service_type NULL = bloqueo global (afecta a todos los servicios).
-- =============================================================================

CREATE TABLE IF NOT EXISTS booking_blackouts (
  id           BIGSERIAL PRIMARY KEY,
  -- NULL = todos los servicios.
  service_type TEXT CHECK (service_type IN ('CLEANING', 'LAUNDRY', 'ALTERATION')),
  region_code  TEXT NOT NULL DEFAULT 'EC',
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  reason       TEXT,
  -- Desactivar en lugar de borrar cuando interesa conservar el motivo.
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

-- La consulta caliente es "que bloqueos vivos solapan este rango".
CREATE INDEX IF NOT EXISTS idx_blackouts_range
  ON booking_blackouts (region_code, starts_at, ends_at) WHERE active;

-- =============================================================================
-- 4. DATOS PUBLICOS DE LA EMPRESA
--
-- Se reutiliza app_settings (clave -> JSONB), que ya existe para el banner, en
-- lugar de crear una tabla de una sola fila. Los valores iniciales son
-- exactamente los que hoy estan escritos a mano en el frontend, para que nada
-- cambie de aspecto tras migrar.
--
-- Aqui solo va informacion PUBLICA: la que ya se muestra en la web. Ningun
-- secreto, token ni credencial.
-- =============================================================================

INSERT INTO app_settings (key, value)
VALUES (
  'company',
  jsonb_build_object(
    'name',             'Otterly Clean',
    'tagline',          'Servicios a domicilio verificados',
    'logoUrl',          '',
    'iconUrl',          '',
    'phone',            '+593991234567',
    'whatsapp',         '+593991234567',
    'whatsappMessage',  'Hola, quisiera solicitar informacion sobre los servicios de Otterly Clean.',
    'telegram',         '',
    'email',            'hola@otterlyclean.ec',
    'address',          'Quito, Ecuador',
    'website',          '',
    'instagram',        '',
    'facebook',         '',
    'supportHours',     'Lunes a sabado, 08:00 - 18:00'
  )
)
ON CONFLICT (key) DO NOTHING;
