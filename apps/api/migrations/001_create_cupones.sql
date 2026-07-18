-- Migración: Sistema de Cupones
-- Ejecutar en la base de datos PostgreSQL

CREATE TABLE IF NOT EXISTS cupones (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(30) UNIQUE NOT NULL,
  descripcion TEXT,
  tipo VARCHAR(20) NOT NULL,
  valor DECIMAL(10,2),
  uso_maximo INTEGER DEFAULT 1,
  usos_realizados INTEGER DEFAULT 0,
  uso_por_cliente INTEGER DEFAULT 1,
  monto_minimo DECIMAL(10,2) DEFAULT 0,
  fecha_inicio TIMESTAMP DEFAULT NOW(),
  fecha_expiracion TIMESTAMP,
  categorias_permitidas INTEGER[],
  platos_especificos INTEGER[],
  activo BOOLEAN DEFAULT TRUE,
  es_automatico BOOLEAN DEFAULT FALSE,
  creado_por INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cupones_uso (
  id SERIAL PRIMARY KEY,
  cupon_id INTEGER REFERENCES cupones(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES users(id),
  pedido_id INTEGER REFERENCES pedido(id),
  descuento_aplicado DECIMAL(10,2),
  used_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(cupon_id, usuario_id, pedido_id)
);

CREATE TABLE IF NOT EXISTS cupones_reglas (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  cupon_plantilla_id INTEGER REFERENCES cupones(id) ON DELETE CASCADE,
  condicion JSONB NOT NULL DEFAULT '{}',
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cupones_codigo ON cupones(codigo);
CREATE INDEX IF NOT EXISTS idx_cupones_activo ON cupones(activo);
CREATE INDEX IF NOT EXISTS idx_cupones_uso_usuario ON cupones_uso(usuario_id);
CREATE INDEX IF NOT EXISTS idx_cupones_uso_cupon ON cupones_uso(cupon_id);
