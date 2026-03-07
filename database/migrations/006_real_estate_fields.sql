-- Add new columns to declaration_real_estate table to store parsed data
ALTER TABLE declaration_real_estate
ADD COLUMN IF NOT EXISTS real_estate_type TEXT,
ADD COLUMN IF NOT EXISTS cadastral_area TEXT,
ADD COLUMN IF NOT EXISTS land_register_number TEXT,
ADD COLUMN IF NOT EXISTS proportion TEXT;

-- Create a function to parse the item_text and extract structured data
CREATE OR REPLACE FUNCTION parse_real_estate_item(item_text TEXT)
RETURNS TABLE(
  real_estate_type TEXT,
  cadastral_area TEXT,
  land_register_number TEXT,
  proportion TEXT
) AS $$
DECLARE
  v_type TEXT;
  v_area TEXT;
  v_lv TEXT;
  v_proportion TEXT;
  v_parts TEXT[];
  v_lv_part TEXT;
  v_proportion_part TEXT;
BEGIN
  -- Initialize variables
  v_type := NULL;
  v_area := NULL;
  v_lv := NULL;
  v_proportion := NULL;

  -- Split by semicolon
  v_parts := string_to_array(item_text, ';');

  -- Extract type (first part, trimmed)
  IF array_length(v_parts, 1) >= 1 THEN
    v_type := TRIM(v_parts[1]);
  END IF;

  -- Extract cadastral area (second part, remove "kat. územie" prefix)
  IF array_length(v_parts, 1) >= 2 THEN
    v_area := TRIM(v_parts[2]);
    v_area := TRIM(REGEXP_REPLACE(v_area, '^kat\.\s+territori', ''));
    v_area := TRIM(REGEXP_REPLACE(v_area, '^kat\.\s+územie\s+', ''));
  END IF;

  -- Extract land register number and proportion (remaining parts)
  IF array_length(v_parts, 1) >= 3 THEN
    v_lv_part := TRIM(v_parts[3]);
    v_lv := TRIM(REGEXP_REPLACE(v_lv_part, '^číslo\s+LV:\s*', ''));
  END IF;

  IF array_length(v_parts, 1) >= 4 THEN
    v_proportion_part := TRIM(v_parts[4]);
    v_proportion := TRIM(REGEXP_REPLACE(v_proportion_part, '^podiel:\s*', ''));
  END IF;

  RETURN QUERY SELECT v_type, v_area, v_lv, v_proportion;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Populate the new columns with parsed data from existing item_text
UPDATE declaration_real_estate
SET
  real_estate_type = parsed.real_estate_type,
  cadastral_area = parsed.cadastral_area,
  land_register_number = parsed.land_register_number,
  proportion = parsed.proportion
FROM (
  SELECT
    id,
    (parse_real_estate_item(item_text)).*
  FROM declaration_real_estate
) AS parsed
WHERE declaration_real_estate.id = parsed.id;
