-- Recreate functions with INTEGER return type after column conversion

DROP FUNCTION IF EXISTS parse_movable_asset_item(TEXT) CASCADE;

CREATE FUNCTION parse_movable_asset_item(item_text TEXT)
RETURNS TABLE(
  asset_type TEXT,
  brand_or_maker TEXT,
  year_of_manufacture INTEGER
) AS $$
DECLARE
  v_type TEXT;
  v_brand TEXT;
  v_year INTEGER;
  v_comma_pos INT;
  v_znacka_pos INT;
  v_rok_pos INT;
  v_next_comma INT;
  v_substring TEXT;
  v_year_str TEXT;
  v_digits TEXT;
  i INT;
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
      v_znacka_pos := v_znacka_pos + 7;
    END IF;
  ELSE
    v_znacka_pos := v_znacka_pos + 7;
  END IF;

  IF v_znacka_pos > 0 THEN
    v_substring := SUBSTRING(item_text FROM v_znacka_pos);
    v_next_comma := POSITION(',' IN v_substring);
    IF v_next_comma > 0 THEN
      v_brand := TRIM(SUBSTRING(v_substring FROM 1 FOR v_next_comma - 1));
    ELSE
      v_brand := TRIM(v_substring);
    END IF;
  END IF;

  -- Extract year after "vyroby:" - extract all digits starting from position after colon
  v_rok_pos := POSITION('vyroby:' IN item_text);
  IF v_rok_pos > 0 THEN
    v_substring := SUBSTRING(item_text FROM v_rok_pos + 7);
    v_substring := LTRIM(v_substring);
    
    -- Extract all consecutive digits
    v_digits := '';
    FOR i IN 1..10 LOOP
      IF i <= LENGTH(v_substring) AND SUBSTRING(v_substring FROM i FOR 1) ~ '^\d$' THEN
        v_digits := v_digits || SUBSTRING(v_substring FROM i FOR 1);
      ELSE
        EXIT;
      END IF;
    END LOOP;
    
    -- If we have exactly 4 digits, try to convert
    IF LENGTH(v_digits) >= 4 THEN
      v_year_str := SUBSTRING(v_digits FROM 1 FOR 4);
      v_year := v_year_str::INTEGER;
      -- Validate year is in range
      IF v_year < 1900 OR v_year > 2030 THEN
        v_year := NULL;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_type, v_brand, v_year;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DROP FUNCTION IF EXISTS parse_usage_movable_asset_item(TEXT) CASCADE;

CREATE FUNCTION parse_usage_movable_asset_item(item_text TEXT)
RETURNS TABLE(
  asset_type TEXT,
  brand_or_maker TEXT,
  year_of_manufacture INTEGER
) AS $$
DECLARE
  v_type TEXT;
  v_brand TEXT;
  v_year INTEGER;
  v_comma_pos INT;
  v_znacka_pos INT;
  v_rok_pos INT;
  v_next_comma INT;
  v_substring TEXT;
  v_year_str TEXT;
  v_digits TEXT;
  i INT;
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
      v_znacka_pos := v_znacka_pos + 7;
    END IF;
  ELSE
    v_znacka_pos := v_znacka_pos + 7;
  END IF;

  IF v_znacka_pos > 0 THEN
    v_substring := SUBSTRING(item_text FROM v_znacka_pos);
    v_next_comma := POSITION(',' IN v_substring);
    IF v_next_comma > 0 THEN
      v_brand := TRIM(SUBSTRING(v_substring FROM 1 FOR v_next_comma - 1));
    ELSE
      v_brand := TRIM(v_substring);
    END IF;
  END IF;

  -- Extract year after "vyroby:" - extract all digits starting from position after colon
  v_rok_pos := POSITION('vyroby:' IN item_text);
  IF v_rok_pos > 0 THEN
    v_substring := SUBSTRING(item_text FROM v_rok_pos + 7);
    v_substring := LTRIM(v_substring);
    
    -- Extract all consecutive digits
    v_digits := '';
    FOR i IN 1..10 LOOP
      IF i <= LENGTH(v_substring) AND SUBSTRING(v_substring FROM i FOR 1) ~ '^\d$' THEN
        v_digits := v_digits || SUBSTRING(v_substring FROM i FOR 1);
      ELSE
        EXIT;
      END IF;
    END LOOP;
    
    -- If we have exactly 4 digits, try to convert
    IF LENGTH(v_digits) >= 4 THEN
      v_year_str := SUBSTRING(v_digits FROM 1 FOR 4);
      v_year := v_year_str::INTEGER;
      -- Validate year is in range
      IF v_year < 1900 OR v_year > 2030 THEN
        v_year := NULL;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_type, v_brand, v_year;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Re-populate with new INTEGER functions
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

  IF v_znacka_pos > 0 THEN
    v_substring := SUBSTRING(item_text FROM v_znacka_pos);
    v_next_comma := POSITION(',' IN v_substring);
    IF v_next_comma > 0 THEN
      v_brand := TRIM(SUBSTRING(v_substring FROM 1 FOR v_next_comma - 1));
    ELSE
      v_brand := TRIM(v_substring);
    END IF;
  END IF;

  -- Extract year after "vyroby:" - extract all digits starting from position after colon
  v_rok_pos := POSITION('vyroby:' IN item_text);
  IF v_rok_pos > 0 THEN
    v_substring := SUBSTRING(item_text FROM v_rok_pos + 7);
    v_substring := LTRIM(v_substring);
    
    -- Extract all consecutive digits
    v_digits := '';
    FOR i IN 1..10 LOOP
      IF i <= LENGTH(v_substring) AND SUBSTRING(v_substring FROM i FOR 1) ~ '^\d$' THEN
        v_digits := v_digits || SUBSTRING(v_substring FROM i FOR 1);
      ELSE
        EXIT;
      END IF;
    END LOOP;
    
    -- If we have at least 4 digits, take first 4 and convert to integer
    IF LENGTH(v_digits) >= 4 THEN
      v_year_str := SUBSTRING(v_digits FROM 1 FOR 4);
      BEGIN
        v_year := v_year_str::INTEGER;
        -- Validate year is in range
        IF v_year < 1900 OR v_year > 2030 THEN
          v_year := NULL;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_year := NULL;
      END;
    END IF;
  END IF;

  RETURN QUERY SELECT v_type, v_brand, v_year;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Recreate parse_usage_movable_asset_item with INTEGER return type
CREATE FUNCTION parse_usage_movable_asset_item(item_text TEXT)
RETURNS TABLE(
  asset_type TEXT,
  brand_or_maker TEXT,
  year_of_manufacture INTEGER
) AS $$
DECLARE
  v_type TEXT;
  v_brand TEXT;
  v_year INTEGER;
  v_comma_pos INT;
  v_znacka_pos INT;
  v_rok_pos INT;
  v_next_comma INT;
  v_substring TEXT;
  v_year_str TEXT;
  v_digits TEXT;
  i INT;
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
      v_znacka_pos := v_znacka_pos + 7;
    END IF;
  ELSE
    v_znacka_pos := v_znacka_pos + 7;
  END IF;

  IF v_znacka_pos > 0 THEN
    v_substring := SUBSTRING(item_text FROM v_znacka_pos);
    v_next_comma := POSITION(',' IN v_substring);
    IF v_next_comma > 0 THEN
      v_brand := TRIM(SUBSTRING(v_substring FROM 1 FOR v_next_comma - 1));
    ELSE
      v_brand := TRIM(v_substring);
    END IF;
  END IF;

  -- Extract year after "vyroby:" - extract all digits starting from position after colon
  v_rok_pos := POSITION('vyroby:' IN item_text);
  IF v_rok_pos > 0 THEN
    v_substring := SUBSTRING(item_text FROM v_rok_pos + 7);
    v_substring := LTRIM(v_substring);
    
    -- Extract all consecutive digits
    v_digits := '';
    FOR i IN 1..10 LOOP
      IF i <= LENGTH(v_substring) AND SUBSTRING(v_substring FROM i FOR 1) ~ '^\d$' THEN
        v_digits := v_digits || SUBSTRING(v_substring FROM i FOR 1);
      ELSE
        EXIT;
      END IF;
    END LOOP;
    
    -- If we have at least 4 digits, take first 4 and convert to integer
    IF LENGTH(v_digits) >= 4 THEN
      v_year_str := SUBSTRING(v_digits FROM 1 FOR 4);
      BEGIN
        v_year := v_year_str::INTEGER;
        -- Validate year is in range
        IF v_year < 1900 OR v_year > 2030 THEN
          v_year := NULL;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_year := NULL;
      END;
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
