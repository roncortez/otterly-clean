ALTER TABLE properties ADD COLUMN IF NOT EXISTS street_address TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS state TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS zip_code TEXT DEFAULT '';

UPDATE properties SET street_address = COALESCE(address, '') WHERE street_address = '';

ALTER TABLE properties DROP COLUMN IF EXISTS address;
