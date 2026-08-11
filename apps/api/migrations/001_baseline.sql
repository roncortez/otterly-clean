-- =============================================================================
-- Otterly Clean - Esquema base de la plataforma de servicios a domicilio
--
-- Principios:
--   * Una tabla `orders` comun a todos los servicios + una tabla de detalle por
--     servicio. Asi el historial, las asignaciones, las incidencias, la
--     auditoria y los pagos se comparten, y Operaciones ve una sola cola.
--   * Nada especifico de Ecuador esta fijo en el esquema: region_code, currency
--     y las etiquetas de direccion son datos, no estructura.
--   * Los importes se guardan como enteros en la unidad menor de la moneda
--     (centavos) para evitar errores de redondeo.
-- =============================================================================

-- =============================================================================
-- IDENTIDAD Y ACCESO
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  -- Telefono en formato E.164 (+593991234567). El formato de presentacion lo
  -- decide la region en el frontend, no la base de datos.
  phone           TEXT,
  role            TEXT NOT NULL CHECK (role IN ('CUSTOMER', 'STAFF', 'ADMIN')),
  region_code     TEXT NOT NULL DEFAULT 'EC',
  locale          TEXT NOT NULL DEFAULT 'es',
  status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- El email es unico sin distinguir mayusculas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users (role, status);

-- Sesiones. Se guarda solo el hash del refresh token, nunca el token.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

-- =============================================================================
-- ZONAS DE COBERTURA
-- =============================================================================

CREATE TABLE IF NOT EXISTS service_zones (
  id                BIGSERIAL PRIMARY KEY,
  region_code       TEXT NOT NULL,
  code              TEXT NOT NULL,
  name              TEXT NOT NULL,
  city              TEXT NOT NULL,
  administrative_area TEXT,
  -- Sobreescribe el impuesto de la region cuando aplique (sales tax en EE.UU.).
  tax_rate_override NUMERIC(6,4),
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (region_code, code)
);

-- =============================================================================
-- PERFILES
-- =============================================================================

CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id         BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Tipo y numero de documento para facturacion (cedula/RUC en Ecuador).
  tax_id_type     TEXT,
  tax_id          TEXT,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Perfil operativo del trabajador. NADA de esta tabla se expone al cliente:
-- la vista publica del profesional se arma en staff_public_view (mas abajo).
CREATE TABLE IF NOT EXISTS staff_profiles (
  user_id                 BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  employee_code           TEXT UNIQUE,
  display_name            TEXT,
  photo_url               TEXT,
  bio                     TEXT,
  hired_at                DATE,
  -- Verificacion de identidad y antecedentes: datos sensibles, solo ADMIN.
  verification_status     TEXT NOT NULL DEFAULT 'PENDING'
                            CHECK (verification_status IN ('PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED')),
  verified_at             TIMESTAMPTZ,
  verified_by             BIGINT REFERENCES users(id) ON DELETE SET NULL,
  background_check_status TEXT NOT NULL DEFAULT 'NOT_STARTED'
                            CHECK (background_check_status IN ('NOT_STARTED', 'PENDING', 'CLEARED', 'FLAGGED')),
  -- Referencias a documentos (no los documentos): [{type, reference, expires_at}]
  documents               JSONB NOT NULL DEFAULT '[]'::jsonb,
  skills                  TEXT[] NOT NULL DEFAULT '{}',
  -- Tipos de servicio que puede atender.
  service_types           TEXT[] NOT NULL DEFAULT '{}',
  active                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_active ON staff_profiles (active, verification_status);

CREATE TABLE IF NOT EXISTS staff_zones (
  staff_id BIGINT NOT NULL REFERENCES staff_profiles(user_id) ON DELETE CASCADE,
  zone_id  BIGINT NOT NULL REFERENCES service_zones(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, zone_id)
);

-- Disponibilidad semanal recurrente. weekday: 0=domingo ... 6=sabado.
CREATE TABLE IF NOT EXISTS staff_availability (
  id         BIGSERIAL PRIMARY KEY,
  staff_id   BIGINT NOT NULL REFERENCES staff_profiles(user_id) ON DELETE CASCADE,
  weekday    SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_staff_availability_staff ON staff_availability (staff_id, weekday);

-- =============================================================================
-- DIRECCIONES
-- =============================================================================

-- Esquema de direccion generico. `administrative_area` es provincia en Ecuador
-- y state en EE.UU.; la etiqueta la aporta la configuracion de region.
CREATE TABLE IF NOT EXISTS addresses (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label               TEXT NOT NULL DEFAULT 'Casa',
  region_code         TEXT NOT NULL DEFAULT 'EC',
  street_line1        TEXT NOT NULL,
  street_line2        TEXT,
  neighborhood        TEXT,
  city                TEXT NOT NULL,
  administrative_area TEXT,
  postal_code         TEXT,
  reference           TEXT,
  latitude            NUMERIC(10,7),
  longitude           NUMERIC(10,7),
  zone_id             BIGINT REFERENCES service_zones(id) ON DELETE SET NULL,
  is_default          BOOLEAN NOT NULL DEFAULT FALSE,
  -- Las direcciones no se borran: se archivan, porque hay ordenes que las citan.
  archived_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses (user_id) WHERE archived_at IS NULL;
-- Una sola direccion predeterminada por usuario.
CREATE UNIQUE INDEX IF NOT EXISTS idx_addresses_one_default
  ON addresses (user_id) WHERE is_default AND archived_at IS NULL;

-- =============================================================================
-- CATALOGO DE SERVICIOS
-- =============================================================================

CREATE TABLE IF NOT EXISTS service_plans (
  id            BIGSERIAL PRIMARY KEY,
  service_type  TEXT NOT NULL CHECK (service_type IN ('CLEANING', 'LAUNDRY', 'ALTERATION')),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  region_code   TEXT NOT NULL DEFAULT 'EC',
  -- Estrategia de precio. Ver domain/pricing/pricing.js
  pricing_model TEXT NOT NULL CHECK (pricing_model IN
                  ('PER_HOUR', 'FLAT_BY_SIZE', 'PER_WEIGHT', 'PER_BAG', 'PER_ITEM', 'FIXED', 'QUOTE')),
  -- Importe base en centavos. Su significado depende del pricing_model:
  -- por hora, por kg, por bolsa, por prenda o plano.
  base_amount   INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'USD',
  -- Parametros del modelo: {minimumHours, tiers, minimumUnits, unit, ...}
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_duration_minutes INTEGER,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (region_code, code)
);

CREATE INDEX IF NOT EXISTS idx_service_plans_type ON service_plans (service_type, region_code, active);

-- Tareas adicionales contratables (limpieza de horno, planchado, etc.).
CREATE TABLE IF NOT EXISTS service_extras (
  id           BIGSERIAL PRIMARY KEY,
  service_type TEXT NOT NULL CHECK (service_type IN ('CLEANING', 'LAUNDRY', 'ALTERATION')),
  code         TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  region_code  TEXT NOT NULL DEFAULT 'EC',
  amount       INTEGER NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'USD',
  added_duration_minutes INTEGER NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (region_code, code)
);

-- =============================================================================
-- ORDENES (comun a todos los servicios)
-- =============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id                    BIGSERIAL PRIMARY KEY,
  -- Referencia legible para el cliente y para operaciones: OC-2026-000123
  reference             TEXT NOT NULL UNIQUE,
  service_type          TEXT NOT NULL CHECK (service_type IN ('CLEANING', 'LAUNDRY', 'ALTERATION')),
  customer_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  plan_id               BIGINT REFERENCES service_plans(id) ON DELETE SET NULL,
  region_code           TEXT NOT NULL DEFAULT 'EC',
  zone_id               BIGINT REFERENCES service_zones(id) ON DELETE SET NULL,

  status                TEXT NOT NULL,

  -- Direccion del servicio (limpieza) o de recogida (lavanderia).
  address_id            BIGINT REFERENCES addresses(id) ON DELETE SET NULL,
  -- Direccion de entrega cuando difiere de la de recogida.
  delivery_address_id   BIGINT REFERENCES addresses(id) ON DELETE SET NULL,

  scheduled_date        DATE,
  scheduled_window_code TEXT,
  scheduled_window_start TIME,
  scheduled_window_end  TIME,
  estimated_duration_minutes INTEGER,

  -- Importes en centavos.
  currency              TEXT NOT NULL DEFAULT 'USD',
  subtotal_amount       INTEGER NOT NULL DEFAULT 0,
  discount_amount       INTEGER NOT NULL DEFAULT 0,
  tax_rate              NUMERIC(6,4) NOT NULL DEFAULT 0,
  tax_amount            INTEGER NOT NULL DEFAULT 0,
  total_amount          INTEGER NOT NULL DEFAULT 0,
  -- Desglose completo tal como se calculo al reservar (lineas, etiquetas).
  price_breakdown       JSONB NOT NULL DEFAULT '{}'::jsonb,
  requires_quote        BOOLEAN NOT NULL DEFAULT FALSE,

  payment_status        TEXT NOT NULL DEFAULT 'PENDING'
                          CHECK (payment_status IN ('PENDING', 'AUTHORIZED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED')),

  customer_notes        TEXT,
  internal_notes        TEXT,

  -- Marcas de tiempo de cada hito operativo: {confirmed_at, arrived_at, ...}
  -- La fuente de verdad es order_status_history; esto es acceso rapido.
  milestones            JSONB NOT NULL DEFAULT '{}'::jsonb,

  cancelled_reason      TEXT,
  cancelled_by          BIGINT REFERENCES users(id) ON DELETE SET NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_service_type ON orders (service_type, status);
CREATE INDEX IF NOT EXISTS idx_orders_scheduled ON orders (scheduled_date, status);
-- La cola de Operaciones: "que tengo hoy sin asignar".
CREATE INDEX IF NOT EXISTS idx_orders_ops_queue ON orders (scheduled_date, service_type, status);

-- Historial inmutable de transiciones. Fuente de verdad del timeline.
CREATE TABLE IF NOT EXISTS order_status_history (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_role  TEXT NOT NULL,
  note        TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_history_order ON order_status_history (order_id, created_at);

-- =============================================================================
-- ASIGNACIONES
-- =============================================================================

-- La asignacion la crea SIEMPRE Operaciones. El trabajador solo puede aceptar
-- o rechazar lo que se le entrego; nunca buscar trabajos disponibles.
CREATE TABLE IF NOT EXISTS assignments (
  id           BIGSERIAL PRIMARY KEY,
  order_id     BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  staff_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- PRIMARY: responsable del servicio. PICKUP/DELIVERY: tramos logisticos
  -- de lavanderia, que pueden recaer en personas distintas.
  role         TEXT NOT NULL DEFAULT 'PRIMARY' CHECK (role IN ('PRIMARY', 'SUPPORT', 'PICKUP', 'DELIVERY')),
  status       TEXT NOT NULL DEFAULT 'OFFERED'
                 CHECK (status IN ('OFFERED', 'ACCEPTED', 'DECLINED', 'RELEASED', 'COMPLETED')),
  assigned_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at  TIMESTAMPTZ,
  declined_at  TIMESTAMPTZ,
  released_at  TIMESTAMPTZ,
  decline_reason TEXT,
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_assignments_order ON assignments (order_id);
CREATE INDEX IF NOT EXISTS idx_assignments_staff ON assignments (staff_id, status);
-- Una sola asignacion viva por rol y orden.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_active_role
  ON assignments (order_id, role) WHERE status IN ('OFFERED', 'ACCEPTED');

-- =============================================================================
-- DETALLE POR SERVICIO
-- =============================================================================

CREATE TABLE IF NOT EXISTS cleaning_details (
  order_id            BIGINT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  cleaning_type       TEXT NOT NULL DEFAULT 'STANDARD',
  property_type       TEXT NOT NULL DEFAULT 'APARTMENT',
  bedrooms            SMALLINT NOT NULL DEFAULT 0,
  bathrooms           SMALLINT NOT NULL DEFAULT 0,
  -- Tamano aproximado; la unidad depende de la region (m2 / sqft).
  area_value          NUMERIC(8,2),
  area_unit           TEXT,
  size_tier           TEXT,
  priority_areas      TEXT[] NOT NULL DEFAULT '{}',

  -- Productos e insumos
  supplies_provided_by TEXT NOT NULL DEFAULT 'COMPANY'
                         CHECK (supplies_provided_by IN ('COMPANY', 'CUSTOMER')),
  product_preferences TEXT[] NOT NULL DEFAULT '{}',
  fragrance_preference TEXT,

  -- Acceso al domicilio
  customer_present    BOOLEAN NOT NULL DEFAULT TRUE,
  access_method       TEXT NOT NULL DEFAULT 'CUSTOMER_OPENS'
                        CHECK (access_method IN ('CUSTOMER_OPENS', 'KEY', 'DOOR_CODE', 'CONCIERGE', 'LOCKBOX', 'OTHER')),
  access_instructions TEXT,
  -- Codigos, claves de alarma y ubicacion de llaves: cifrado con AES-256-GCM
  -- en la aplicacion. NUNCA se devuelve en listados ni al cliente sin motivo.
  -- Ver services/crypto.js y docs/SECURITY.md
  access_secret_encrypted TEXT,
  parking_instructions TEXT,

  -- Mascotas
  has_pets            BOOLEAN NOT NULL DEFAULT FALSE,
  -- [{type, count, name, behavior}]
  pets                JSONB NOT NULL DEFAULT '[]'::jsonb,
  pets_secured        BOOLEAN,
  pet_instructions    TEXT,

  delicate_items      TEXT,
  special_instructions TEXT
);

CREATE TABLE IF NOT EXISTS laundry_details (
  order_id            BIGINT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  service_variant     TEXT NOT NULL DEFAULT 'WASH_AND_FOLD',

  pickup_date         DATE,
  pickup_window_code  TEXT,
  pickup_window_start TIME,
  pickup_window_end   TIME,
  pickup_instructions TEXT,

  delivery_date       DATE,
  delivery_window_code TEXT,
  delivery_window_start TIME,
  delivery_window_end TIME,
  delivery_instructions TEXT,

  -- Cantidad estimada al reservar; el peso real se registra en la intake.
  estimated_bags      SMALLINT,
  estimated_weight    NUMERIC(8,2),
  actual_weight       NUMERIC(8,2),
  weight_unit         TEXT NOT NULL DEFAULT 'kg',
  -- Como se cobra esta orden concreta (puede diferir del plan por excepcion).
  billing_mode        TEXT NOT NULL DEFAULT 'PER_WEIGHT'
                        CHECK (billing_mode IN ('PER_WEIGHT', 'PER_BAG', 'PER_ITEM', 'FIXED')),

  -- Preferencias de lavado y secado
  wash_temperature    TEXT CHECK (wash_temperature IN ('COLD', 'WARM', 'HOT')),
  detergent_preference TEXT CHECK (detergent_preference IN ('STANDARD', 'HYPOALLERGENIC', 'FRAGRANCE_FREE', 'CUSTOMER_PROVIDED')),
  use_fabric_softener BOOLEAN NOT NULL DEFAULT TRUE,
  use_bleach          BOOLEAN NOT NULL DEFAULT FALSE,
  separate_colors     BOOLEAN NOT NULL DEFAULT TRUE,
  drying_preference   TEXT CHECK (drying_preference IN ('MACHINE', 'HANG_DRY', 'MIXED')),
  folding_preference  TEXT,

  hang_dry_items      TEXT,
  delicate_items      TEXT,
  -- Prendas que NO deben procesarse. Critico para evitar danos.
  do_not_process_items TEXT,
  special_instructions TEXT
);

-- Trazabilidad fisica de la orden. Evitar confundir bolsas entre clientes es
-- el riesgo operativo mas grande de este negocio, asi que la bolsa es una
-- entidad desde el MVP. `bag_code` es texto: hoy se imprime a mano, manana
-- puede ser un QR o un codigo de barras sin cambiar el modelo.
CREATE TABLE IF NOT EXISTS laundry_bags (
  id               BIGSERIAL PRIMARY KEY,
  order_id         BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  bag_code         TEXT NOT NULL UNIQUE,
  label            TEXT,
  status           TEXT NOT NULL DEFAULT 'REGISTERED'
                     CHECK (status IN ('REGISTERED', 'PICKED_UP', 'RECEIVED', 'PROCESSING', 'READY', 'DELIVERED', 'LOST')),
  weight           NUMERIC(8,2),
  weight_unit      TEXT,
  contents_summary TEXT,
  item_count       SMALLINT,
  notes            TEXT,
  picked_up_at     TIMESTAMPTZ,
  received_at      TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_laundry_bags_order ON laundry_bags (order_id);

-- Arreglo de prendas: la tabla existe para que el dominio este completo, pero
-- el servicio no se ofrece todavia (service_plans.active = false).
CREATE TABLE IF NOT EXISTS alteration_details (
  order_id            BIGINT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  -- [{garment, alteration_type, description, photo_url, quoted_amount, approved}]
  garments            JSONB NOT NULL DEFAULT '[]'::jsonb,
  inspection_notes    TEXT,
  quoted_amount       INTEGER,
  quote_approved_at   TIMESTAMPTZ,
  quote_approved_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  special_instructions TEXT
);

-- =============================================================================
-- INCIDENCIAS
-- =============================================================================

CREATE TABLE IF NOT EXISTS incidents (
  id           BIGSERIAL PRIMARY KEY,
  order_id     BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  reported_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reporter_role TEXT NOT NULL,
  category     TEXT NOT NULL
                 CHECK (category IN ('NO_ACCESS', 'DAMAGE', 'MISSING_ITEM', 'CUSTOMER_ABSENT',
                                     'UNSAFE_CONDITIONS', 'INCOMPLETE_SERVICE', 'EQUIPMENT', 'OTHER')),
  severity     TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
  description  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED')),
  resolution   TEXT,
  resolved_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  -- Referencias a evidencia fotografica. El almacenamiento se decide despues.
  attachments  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_order ON incidents (order_id);
CREATE INDEX IF NOT EXISTS idx_incidents_open ON incidents (status, created_at DESC) WHERE status IN ('OPEN', 'IN_REVIEW');

-- =============================================================================
-- NOTIFICACIONES
-- =============================================================================

-- Cola/bitacora de notificaciones. El envio real lo hace un driver
-- intercambiable (consola hoy; email/SMS/push despues) sin tocar el dominio.
CREATE TABLE IF NOT EXISTS notifications (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT REFERENCES users(id) ON DELETE CASCADE,
  order_id     BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  event        TEXT NOT NULL,
  channel      TEXT NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL', 'SMS', 'PUSH')),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       TEXT NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  error        TEXT,
  sent_at      TIMESTAMPTZ,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;

-- =============================================================================
-- PAGOS
-- =============================================================================

-- Sin integracion todavia: el modelo existe para que anadir una pasarela sea
-- implementar un proveedor, no rehacer las ordenes.
CREATE TABLE IF NOT EXISTS payments (
  id                 BIGSERIAL PRIMARY KEY,
  order_id           BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  currency           TEXT NOT NULL,
  amount             INTEGER NOT NULL,
  method             TEXT CHECK (method IN ('CASH', 'CARD', 'TRANSFER', 'WALLET', 'OTHER')),
  status             TEXT NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED')),
  provider           TEXT,
  provider_reference TEXT,
  captured_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (order_id);

-- =============================================================================
-- AUDITORIA
-- =============================================================================

-- Quien hizo que, sobre que y cuando. Se escribe para operaciones sensibles:
-- asignar, reasignar, cambiar estado, cancelar, ver datos de acceso, tocar
-- perfiles de trabajadores.
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_role  TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  before      JSONB,
  after       JSONB,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log (actor_id, created_at DESC);

-- =============================================================================
-- SECUENCIA DE REFERENCIAS
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS order_reference_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS bag_reference_seq START 1000;
