-- Add new columns to declaration_usage_movable_assets table to store parsed data
-- First, ensure the column is TEXT type for parsing functions to work properly
ALTER TABLE declaration_usage_movable_assets
ALTER COLUMN year_of_manufacture TYPE TEXT USING year_of_manufacture::TEXT;

ALTER TABLE declaration_usage_movable_assets
ADD COLUMN IF NOT EXISTS asset_type TEXT,
ADD COLUMN IF NOT EXISTS brand_or_maker TEXT;

-- If year_of_manufacture column doesn't exist, create it as TEXT
ALTER TABLE declaration_usage_movable_assets
ADD COLUMN IF NOT EXISTS year_of_manufacture TEXT;

-- Drop and recreate function to avoid signature conflicts
DROP FUNCTION IF EXISTS parse_usage_movable_asset_item(TEXT);

-- Create a function to parse the item_text and extract structured data
CREATE FUNCTION parse_usage_movable_asset_item(item_text TEXT)
RETURNS TABLE(
  asset_type TEXT,
  brand_or_maker TEXT,
  year_of_manufacture TEXT
) AS $$
DECLARE
  v_type TEXT;
  v_brand TEXT;
  v_year TEXT;
BEGIN
  -- Initialize variables
  v_type := NULL;
  v_brand := NULL;
  v_year := NULL;

  -- First, extract the asset type (everything before the first comma)
  IF item_text LIKE '%,%' THEN
    v_type := TRIM(SUBSTRING(item_text FROM 1 FOR POSITION(',' IN item_text) - 1));
  ELSE
    v_type := TRIM(item_text);
  END IF;

  -- Extract brand/maker (text after "továrenská značka:" or "značka:")
  IF item_text ~* 'tovar[a-z]*ensk[a-z]* [a-z]*[a-z]*nazka:' THEN
    v_brand := TRIM(REGEXP_REPLACE(item_text, '^.*tovar[a-z]*ensk[a-z]* [a-z]*[a-z]*nazka:\s*', ''));
    -- Stop at the next comma or 'rok vyroby'
    IF v_brand ~* ',' THEN
      v_brand := TRIM(SUBSTRING(v_brand FROM 1 FOR POSITION(',' IN v_brand) - 1));
    ELSIF v_brand ~* 'rok' THEN
      v_brand := TRIM(REGEXP_REPLACE(v_brand, '\s*rok.*$', ''));
    END IF;
  END IF;

  -- Extract year of manufacture (text after "rok výroby:" or "rok vyroby:")
  IF item_text ~* 'rok\s+v[a-z]*roby:' THEN
    v_year := TRIM(REGEXP_REPLACE(item_text, '^.*rok\s+v[a-z]*roby:\s*', ''));
    -- Stop at the next comma if exists
    IF v_year ~* ',' THEN
      v_year := TRIM(SUBSTRING(v_year FROM 1 FOR POSITION(',' IN v_year) - 1));
    END IF;
  END IF;

  RETURN QUERY SELECT v_type, v_brand, v_year;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Populate the new columns with parsed data from existing item_text
UPDATE declaration_usage_movable_assets
SET
  asset_type = parsed.asset_type,
  brand_or_maker = parsed.brand_or_maker,
  year_of_manufacture = parsed.year_of_manufacture
FROM (
  SELECT
    id,
    (parse_usage_movable_asset_item(item_text)).*
  FROM declaration_usage_movable_assets
) AS parsed
WHERE declaration_usage_movable_assets.id = parsed.id;
