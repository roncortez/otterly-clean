-- =============================================================
-- Migración completa: Otterly Clean
-- Ejecutar: psql -U postgres -d otterly_clean -f 001_full_schema.sql
-- =============================================================

-- =============================================
-- 1. USERS
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  telefono TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 2. TIPOS (categorías de platos)
-- =============================================
CREATE TABLE IF NOT EXISTS tipos (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL
);

-- =============================================
-- 3. MENU
-- =============================================
CREATE TABLE IF NOT EXISTS menu (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  precio DECIMAL(10,2) NOT NULL,
  tipo_id INTEGER REFERENCES tipos(id),
  image_url TEXT,
  tipo_combinacion JSONB,
  tipo_ingrediente JSONB
);

-- =============================================
-- 4. PEDIDO (órdenes del restaurante)
-- =============================================
CREATE TABLE IF NOT EXISTS pedido (
  id SERIAL PRIMARY KEY,
  id_cliente INTEGER REFERENCES users(id),
  total DECIMAL(10,2) NOT NULL,
  fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivery BOOLEAN NOT NULL,
  lugar_envio TEXT
);

CREATE INDEX IF NOT EXISTS idx_pedido_cliente ON pedido(id_cliente);
CREATE INDEX IF NOT EXISTS idx_pedido_fecha ON pedido(fecha_hora DESC);

-- =============================================
-- 5. DETALLE_PEDIDOS
-- =============================================
CREATE TABLE IF NOT EXISTS detalle_pedidos (
  id SERIAL PRIMARY KEY,
  pedido_id INTEGER REFERENCES pedido(id) ON DELETE CASCADE,
  menu_id INTEGER REFERENCES menu(id),
  cantidad INTEGER NOT NULL,
  precio DECIMAL(10,2) NOT NULL,
  ingredientes JSONB
);

CREATE INDEX IF NOT EXISTS idx_detalle_pedido ON detalle_pedidos(pedido_id);

-- =============================================
-- 6. INGREDIENTES
-- =============================================
CREATE TABLE IF NOT EXISTS ingredientes (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  precio DECIMAL(10,2) DEFAULT 0
);

-- =============================================
-- 7. LUGAR_ENVIO (direcciones / mesas)
-- =============================================
CREATE TABLE IF NOT EXISTS lugar_envio (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  direccion TEXT
);

-- =============================================
-- 8. APP_SETTINGS
-- =============================================
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- 9. ADMIN_TABLES (mesas del restaurante)
-- =============================================
CREATE TABLE IF NOT EXISTS admin_tables (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'paid', 'cancelled')),
  active_order_id INTEGER REFERENCES pedido(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- 10. CUPONES
-- =============================================
CREATE TABLE IF NOT EXISTS cupones (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(30) UNIQUE NOT NULL,
  descripcion TEXT,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('porcentaje', 'monto_fijo', 'envio_gratis', 'bebida_gratis', '2x1', 'combo')),
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

CREATE INDEX IF NOT EXISTS idx_cupones_codigo ON cupones(codigo);
CREATE INDEX IF NOT EXISTS idx_cupones_activo ON cupones(activo);

-- =============================================
-- 11. CUPONES_USO
-- =============================================
CREATE TABLE IF NOT EXISTS cupones_uso (
  id SERIAL PRIMARY KEY,
  cupon_id INTEGER REFERENCES cupones(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES users(id),
  pedido_id INTEGER REFERENCES pedido(id),
  descuento_aplicado DECIMAL(10,2),
  used_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(cupon_id, usuario_id, pedido_id)
);

CREATE INDEX IF NOT EXISTS idx_cupones_uso_usuario ON cupones_uso(usuario_id);
CREATE INDEX IF NOT EXISTS idx_cupones_uso_cupon ON cupones_uso(cupon_id);

-- =============================================
-- 12. CUPONES_REGLAS
-- =============================================
CREATE TABLE IF NOT EXISTS cupones_reglas (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  cupon_plantilla_id INTEGER REFERENCES cupones(id) ON DELETE CASCADE,
  condicion JSONB NOT NULL DEFAULT '{}',
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 13. PROPERTY_TYPES (tipos de propiedad para limpieza)
-- =============================================
CREATE TABLE IF NOT EXISTS property_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  base_multiplier DECIMAL(3,2) DEFAULT 1.00
);

INSERT INTO property_types (name, base_multiplier) VALUES
  ('Studio', 1.00),
  ('1 Bedroom', 1.25),
  ('2 Bedrooms', 1.50),
  ('3 Bedrooms', 2.00),
  ('4+ Bedrooms', 2.50),
  ('Small Office (up to 1000 sqft)', 1.75),
  ('Large Office (1000+ sqft)', 3.00)
ON CONFLICT DO NOTHING;

-- =============================================
-- 14. SERVICES (servicios de limpieza/lavandería/reparación)
-- =============================================
CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  category VARCHAR(20) NOT NULL CHECK (category IN ('cleaning', 'laundry', 'repair')),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  base_price DECIMAL(10,2),
  price_type VARCHAR(20) CHECK (price_type IN ('per_hour', 'per_item', 'per_pound', 'per_bag', 'fixed', 'quote')),
  estimated_duration VARCHAR(50),
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active);

INSERT INTO services (category, name, description, base_price, price_type, estimated_duration, display_order) VALUES
  ('cleaning', 'Regular Cleaning', 'Standard cleaning covering all rooms, kitchen, and bathrooms.', 120.00, 'per_hour', '2-4 hours', 1),
  ('cleaning', 'Deep Cleaning', 'Thorough top-to-bottom cleaning including inside appliances, baseboards, windows.', 180.00, 'per_hour', '3-5 hours', 2),
  ('cleaning', 'Move-in / Move-out Cleaning', 'Intensive cleaning for empty properties.', 200.00, 'per_hour', '3-6 hours', 3),
  ('laundry', 'Wash & Fold', 'Regular laundry washed, dried, and neatly folded.', 1.50, 'per_pound', '1-2 business days', 4),
  ('laundry', 'Dry Cleaning', 'Professional dry cleaning for delicate fabrics and formal wear.', 5.00, 'per_item', '2-3 business days', 5),
  ('laundry', 'Ironing & Pressing', 'Professional ironing and pressing for shirts, pants, dresses.', 2.50, 'per_item', '1-2 business days', 6),
  ('repair', 'Minor Repair', 'Button replacement, seam fixes, small tears, and general mending.', 10.00, 'per_item', '3-5 business days', 7),
  ('repair', 'Hemming', 'Shorten pants, skirts, or sleeves to your desired length.', 15.00, 'per_item', '3-5 business days', 8),
  ('repair', 'Zipper Replacement', 'Replace broken or stuck zippers on pants, jackets, dresses, or bags.', 20.00, 'per_item', '3-5 business days', 9)
ON CONFLICT DO NOTHING;

-- =============================================
-- 15. ORDERS (órdenes de servicios)
-- =============================================
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES users(id) ON DELETE SET NULL,
  service_type VARCHAR(20) NOT NULL CHECK (service_type IN ('cleaning', 'laundry', 'repair')),
  status VARCHAR(30) DEFAULT 'pending',

  -- Limpieza
  property_type_id INT REFERENCES property_types(id),
  number_of_bedrooms INT,
  number_of_bathrooms INT,
  has_pets BOOLEAN DEFAULT false,

  -- Lavandería y reparación: programación
  pickup_date DATE,
  pickup_time_start TIME,
  pickup_time_end TIME,
  delivery_date DATE,
  delivery_time_start TIME,
  delivery_time_end TIME,

  -- Direcciones
  service_address TEXT,
  pickup_address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(10),
  access_instructions TEXT,

  -- Reparación
  repair_description TEXT,
  inspection_notes TEXT,
  quoted_price DECIMAL(10,2),

  -- Lavandería
  special_instructions TEXT,

  -- Precios
  base_price DECIMAL(10,2),
  extra_charges DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2),

  -- Pago
  payment_method VARCHAR(20),
  payment_status VARCHAR(20) DEFAULT 'pending',
  stripe_payment_intent_id VARCHAR(255),

  -- Admin
  admin_notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_service_type ON orders(service_type);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- =============================================
-- 16. ORDER_ITEMS (prendas / items de orden)
-- =============================================
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES orders(id) ON DELETE CASCADE,
  service_id INT REFERENCES services(id),
  garment_type VARCHAR(100),
  quantity INT DEFAULT 1,
  unit_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- =============================================
-- 17. ORDER_PHOTOS (fotos antes/después)
-- =============================================
CREATE TABLE IF NOT EXISTS order_photos (
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id INT REFERENCES order_items(id),
  photo_url TEXT,
  photo_type VARCHAR(20) CHECK (photo_type IN ('before', 'after', 'damage')),
  uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_photos_order ON order_photos(order_id);
