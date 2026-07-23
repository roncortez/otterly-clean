-- =============================================
-- Migración: Tablas de servicios de limpieza
-- Ejecutar: psql -U postgres -d otterly_clean -f 002_services_tables.sql
-- =============================================

-- PROPERTY_TYPES
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

-- SERVICES
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

-- ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES users(id) ON DELETE SET NULL,
  service_type VARCHAR(20) NOT NULL CHECK (service_type IN ('cleaning', 'laundry', 'repair')),
  status VARCHAR(30) DEFAULT 'pending',
  property_type_id INT REFERENCES property_types(id),
  number_of_bedrooms INT,
  number_of_bathrooms INT,
  has_pets BOOLEAN DEFAULT false,
  pickup_date DATE,
  pickup_time_start TIME,
  pickup_time_end TIME,
  delivery_date DATE,
  delivery_time_start TIME,
  delivery_time_end TIME,
  service_address TEXT,
  pickup_address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(10),
  access_instructions TEXT,
  repair_description TEXT,
  inspection_notes TEXT,
  quoted_price DECIMAL(10,2),
  special_instructions TEXT,
  base_price DECIMAL(10,2),
  extra_charges DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2),
  payment_method VARCHAR(20),
  payment_status VARCHAR(20) DEFAULT 'pending',
  stripe_payment_intent_id VARCHAR(255),
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_service_type ON orders(service_type);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- ORDER_ITEMS
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

-- ORDER_PHOTOS
CREATE TABLE IF NOT EXISTS order_photos (
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id INT REFERENCES order_items(id),
  photo_url TEXT,
  photo_type VARCHAR(20) CHECK (photo_type IN ('before', 'after', 'damage')),
  uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_photos_order ON order_photos(order_id);
