-- Convert year_of_manufacture columns from TEXT to INTEGER

-- Alter the columns to be INTEGER
ALTER TABLE declaration_movable_assets
ALTER COLUMN year_of_manufacture TYPE INTEGER USING 
  CASE WHEN year_of_manufacture ~ '^\d{4}$' AND CAST(year_of_manufacture AS INTEGER) BETWEEN 1900 AND 2030 
    THEN CAST(year_of_manufacture AS INTEGER) 
    ELSE NULL 
  END;

ALTER TABLE declaration_usage_movable_assets
ALTER COLUMN year_of_manufacture TYPE INTEGER USING 
  CASE WHEN year_of_manufacture ~ '^\d{4}$' AND CAST(year_of_manufacture AS INTEGER) BETWEEN 1900 AND 2030 
    THEN CAST(year_of_manufacture AS INTEGER) 
    ELSE NULL 
  END;
