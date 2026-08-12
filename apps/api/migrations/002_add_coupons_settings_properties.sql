-- =============================================================================
-- Migration 002: Add Coupons, App Settings, and User Properties tables
-- =============================================================================

-- 1. App Settings (Banners and Global Configuration)
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. User Properties (Inmuebles registrados por el cliente)
CREATE TABLE IF NOT EXISTS properties (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  property_type       TEXT NOT NULL,
  bedrooms            INTEGER DEFAULT 1,
  bathrooms           INTEGER DEFAULT 1,
  street_address      TEXT NOT NULL,
  dependent_locality  TEXT,
  locality            TEXT NOT NULL,
  administrative_area TEXT,
  postal_code         TEXT,
  access_code         TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_user ON properties(user_id);

-- 3. Cupones
CREATE TABLE IF NOT EXISTS cupones (
  id                  BIGSERIAL PRIMARY KEY,
  codigo              VARCHAR(50) UNIQUE NOT NULL,
  descripcion         TEXT,
  tipo                VARCHAR(20) NOT NULL CHECK (tipo IN ('porcentaje', 'monto_fijo', 'envio_gratis', '2x1', 'combo')),
  valor               DECIMAL(10,2),
  uso_maximo          INTEGER DEFAULT 1,
  usos_realizados     INTEGER DEFAULT 0,
  uso_por_cliente     INTEGER DEFAULT 1,
  monto_minimo        DECIMAL(10,2) DEFAULT 0,
  fecha_inicio        TIMESTAMPTZ DEFAULT NOW(),
  fecha_expiracion    TIMESTAMPTZ,
  activo              BOOLEAN DEFAULT TRUE,
  es_automatico       BOOLEAN DEFAULT FALSE,
  creado_por          BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cupones_codigo ON cupones(LOWER(codigo));
CREATE INDEX IF NOT EXISTS idx_cupones_activo ON cupones(activo);

-- 4. Uso de Cupones
CREATE TABLE IF NOT EXISTS cupones_uso (
  id                  BIGSERIAL PRIMARY KEY,
  cupon_id            BIGINT NOT NULL REFERENCES cupones(id) ON DELETE CASCADE,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id            BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  descuento_aplicado  DECIMAL(10,2) NOT NULL DEFAULT 0,
  used_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cupon_id, user_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_cupones_uso_user ON cupones_uso(user_id);
CREATE INDEX IF NOT EXISTS idx_cupones_uso_cupon ON cupones_uso(cupon_id);

-- 5. Reglas de Cupones
CREATE TABLE IF NOT EXISTS cupones_reglas (
  id                  BIGSERIAL PRIMARY KEY,
  nombre              VARCHAR(100) NOT NULL,
  tipo                VARCHAR(30) NOT NULL,
  cupon_plantilla_id  BIGINT REFERENCES cupones(id) ON DELETE CASCADE,
  condicion           JSONB NOT NULL DEFAULT '{}',
  activo              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
