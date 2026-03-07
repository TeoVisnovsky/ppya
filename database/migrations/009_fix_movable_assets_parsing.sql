-- Fix parsing functions for movable assets to properly extract značka and rok vyroby

-- Drop and recreate the parse_movable_asset_item function with simpler logic
DROP FUNCTION IF EXISTS parse_movable_asset_item(TEXT);

CREATE FUNCTION parse_movable_asset_item(item_text TEXT)
RETURNS TABLE(
  asset_type TEXT,
  brand_or_maker TEXT,
  year_of_manufacture TEXT
) AS $$
DECLARE
  v_type TEXT;
  v_brand TEXT;
  v_year TEXT;
  v_comma_pos INT;
  v_brand_start INT;
  v_brand_end INT;
BEGIN
  -- Initialize variables
  v_type := NULL;
  v_brand := NULL;
  v_year := NULL;

  -- Extract asset type (everything before the first comma)
  v_comma_pos := POSITION(',' IN item_text);
  IF v_comma_pos > 0 THEN
    v_type := TRIM(SUBSTRING(item_text FROM 1 FOR v_comma_pos - 1));
  ELSE
    v_type := TRIM(item_text);
  END IF;

  -- Extract brand/maker (search for "značka:" case-insensitive)
  IF item_text ILIKE '%znaczka:%' OR item_text ILIKE '%znacka:%' THEN
    -- Find position of "značka:" or "znacka:"
    IF item_text ILIKE '%značka:%' THEN
      v_brand_start := POSITION('značka:' IN item_text) + 7;
    ELSE
      v_brand_start := POSITION('znacka:' IN item_text) + 7;
    END IF;
    
    -- Check if there's more text after "značka:"
    IF v_brand_start <= LENGTH(item_text) THEN
      -- Find the end: either next comma or "rok"
      v_brand_end := POSITION(',' IN SUBSTRING(item_text FROM v_brand_start));
      IF v_brand_end = 0 THEN
        -- No comma found, search for "rok"
        v_brand_end := POSITION('rok' IN SUBSTRING(item_text FROM v_brand_start));
        IF v_brand_end > 0 THEN
          v_brand := TRIM(SUBSTRING(item_text FROM v_brand_start FOR v_brand_end - 1));
        ELSE
          v_brand := TRIM(SUBSTRING(item_text FROM v_brand_start));
        END IF;
      ELSE
        v_brand := TRIM(SUBSTRING(item_text FROM v_brand_start FOR v_brand_end - 1));
      END IF;
    END IF;
  END IF;

  -- Extract year (search for "vyroby:" followed by 4 digits)
  v_year := (regexp_match(item_text, 'vyroby:\s*(\d{4})', 'i'))[1];

  RETURN QUERY SELECT v_type, v_brand, v_year;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Drop and recreate the parse_usage_movable_asset_item function
DROP FUNCTION IF EXISTS parse_usage_movable_asset_item(TEXT);

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
  v_comma_pos INT;
  v_brand_start INT;
  v_brand_end INT;
BEGIN
  -- Initialize variables
  v_type := NULL;
  v_brand := NULL;
  v_year := NULL;

  -- Extract asset type (everything before the first comma)
  v_comma_pos := POSITION(',' IN item_text);
  IF v_comma_pos > 0 THEN
    v_type := TRIM(SUBSTRING(item_text FROM 1 FOR v_comma_pos - 1));
  ELSE
    v_type := TRIM(item_text);
  END IF;

  -- Extract brand/maker (search for "značka:" case-insensitive)
  IF item_text ILIKE '%značka:%' OR item_text ILIKE '%znacka:%' THEN
    -- Find position of "značka:" or "znacka:"
    IF item_text ILIKE '%značka:%' THEN
      v_brand_start := POSITION('značka:' IN item_text) + 7;
    ELSE
      v_brand_start := POSITION('znacka:' IN item_text) + 7;
    END IF;
    
    -- Check if there's more text after "značka:"
    IF v_brand_start <= LENGTH(item_text) THEN
      -- Find the end: either next comma or "rok"
      v_brand_end := POSITION(',' IN SUBSTRING(item_text FROM v_brand_start));
      IF v_brand_end = 0 THEN
        -- No comma found, search for "rok"
        v_brand_end := POSITION('rok' IN SUBSTRING(item_text FROM v_brand_start));
        IF v_brand_end > 0 THEN
          v_brand := TRIM(SUBSTRING(item_text FROM v_brand_start FOR v_brand_end - 1));
        ELSE
          v_brand := TRIM(SUBSTRING(item_text FROM v_brand_start));
        END IF;
      ELSE
        v_brand := TRIM(SUBSTRING(item_text FROM v_brand_start FOR v_brand_end - 1));
      END IF;
    END IF;
  END IF;

  -- Extract year (search for "vyroby:" followed by 4 digits)
  v_year := (regexp_match(item_text, 'vyroby:\s*(\d{4})', 'i'))[1];

  RETURN QUERY SELECT v_type, v_brand, v_year;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Re-populate the declaration_movable_assets columns with corrected parsing
UPDATE declaration_movable_assets
SET
  asset_type = parsed.asset_type,
  brand_or_maker = parsed.brand_or_maker,
  year_of_manufacture = parsed.year_of_manufacture
FROM (
  SELECT
    id,
    (parse_movable_asset_item(item_text)).*
  FROM declaration_movable_assets
) AS parsed
WHERE declaration_movable_assets.id = parsed.id;

-- Re-populate the declaration_usage_movable_assets columns with corrected parsing
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
