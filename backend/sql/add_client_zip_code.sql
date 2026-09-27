-- Add zip_code column to client_list table
-- Used for BIR form auto-population (payor zip code)

ALTER TABLE client_list
ADD COLUMN IF NOT EXISTS zip_code TEXT;
