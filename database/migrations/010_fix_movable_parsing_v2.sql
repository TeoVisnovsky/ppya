-- Fix parsing functions with simpler, more robust logic

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
  v_znacka_pos INT;
  v_rok_pos INT;
  v_next_comma INT;
  v_substring TEXT;
BEGIN
  -- Initialize
  v_type := NULL;
  v_brand := NULL;
  v_year := NULL;

  -- Extract asset type (everything before first comma)
  v_comma_pos := POSITION(',' IN item_text);
  IF v_comma_pos > 0 THEN
    v_type := TRIM(SUBSTRING(item_text FROM 1 FOR v_comma_pos - 1));
  ELSE
    v_type := TRIM(item_text);
  END IF;

  -- Extract brand/maker after "značka:" or "znacka:"
  -- Try both with and without accent
  v_znacka_pos := POSITION('značka:' IN item_text);
  IF v_znacka_pos = 0 THEN
    v_znacka_pos := POSITION('znacka:' IN item_text);
    IF v_znacka_pos > 0 THEN
      v_znacka_pos := v_znacka_pos + 7; -- length of "znacka:"
    END IF;
  ELSE
    v_znacka_pos := v_znacka_pos + 7; -- length of "značka:"
  END IF;

  IF v_znacka_pos > 0 THEN
    v_substring := SUBSTRING(item_text FROM v_znacka_pos);
    -- Find next comma
    v_next_comma := POSITION(',' IN v_substring);
    IF v_next_comma > 0 THEN
      v_brand := TRIM(SUBSTRING(v_substring FROM 1 FOR v_next_comma - 1));
    ELSE
      -- No comma, take rest of string
      v_brand := TRIM(v_substring);
    END IF;
  END IF;

  -- Extract year after "vyroby:" - look for 4 consecutive digits
  v_rok_pos := POSITION('vyroby:' IN item_text);
  IF v_rok_pos > 0 THEN
    v_substring := SUBSTRING(item_text FROM v_rok_pos + 7);
    v_substring := TRIM(v_substring);
    -- Extract first sequence of 4 digits
    v_year := SUBSTRING(v_substring FROM 1 FOR 4);
    -- Validate it's actually 4 digits
    IF v_year ~ '^\d{4}$' THEN
      -- It's valid
    ELSE
      v_year := NULL;
    END IF;
  END IF;

  RETURN QUERY SELECT v_type, v_brand, v_year;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

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
  v_znacka_pos INT;
  v_rok_pos INT;
  v_next_comma INT;
  v_substring TEXT;
BEGIN
  -- Initialize
  v_type := NULL;
  v_brand := NULL;
  v_year := NULL;

  -- Extract asset type (everything before first comma)
  v_comma_pos := POSITION(',' IN item_text);
  IF v_comma_pos > 0 THEN
    v_type := TRIM(SUBSTRING(item_text FROM 1 FOR v_comma_pos - 1));
  ELSE
    v_type := TRIM(item_text);
  END IF;

  -- Extract brand/maker after "značka:" or "znacka:"
  v_znacka_pos := POSITION('značka:' IN item_text);
  IF v_znacka_pos = 0 THEN
    v_znacka_pos := POSITION('znacka:' IN item_text);
    IF v_znacka_pos > 0 THEN
      v_znacka_pos := v_znacka_pos + 7; -- length of "znacka:"
    END IF;
  ELSE
    v_znacka_pos := v_znacka_pos + 7; -- length of "značka:"
  END IF;

  IF v_znacka_pos > 0 THEN
    v_substring := SUBSTRING(item_text FROM v_znacka_pos);
    -- Find next comma
    v_next_comma := POSITION(',' IN v_substring);
    IF v_next_comma > 0 THEN
      v_brand := TRIM(SUBSTRING(v_substring FROM 1 FOR v_next_comma - 1));
    ELSE
      -- No comma, take rest of string
      v_brand := TRIM(v_substring);
    END IF;
  END IF;

  -- Extract year after "vyroby:" - look for 4 consecutive digits
  v_rok_pos := POSITION('vyroby:' IN item_text);
  IF v_rok_pos > 0 THEN
    v_substring := SUBSTRING(item_text FROM v_rok_pos + 7);
    v_substring := TRIM(v_substring);
    -- Extract first sequence of 4 digits
    v_year := SUBSTRING(v_substring FROM 1 FOR 4);
    -- Validate it's actually 4 digits
    IF v_year ~ '^\d{4}$' THEN
      -- It's valid
    ELSE
      v_year := NULL;
    END IF;
  END IF;

  RETURN QUERY SELECT v_type, v_brand, v_year;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Clear and re-populate declaration_movable_assets
UPDATE declaration_movable_assets
SET
  asset_type = NULL,
  brand_or_maker = NULL,
  year_of_manufacture = NULL;

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

-- Clear and re-populate declaration_usage_movable_assets
UPDATE declaration_usage_movable_assets
SET
  asset_type = NULL,
  brand_or_maker = NULL,
  year_of_manufacture = NULL;

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
