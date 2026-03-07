ALTER TABLE declaration_income
ADD COLUMN IF NOT EXISTS public_function_income_amount BIGINT,
ADD COLUMN IF NOT EXISTS other_income_amount BIGINT,
ADD COLUMN IF NOT EXISTS total_income_amount BIGINT;
