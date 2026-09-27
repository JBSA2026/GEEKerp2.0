-- Fix: Add 'COMPLETE' to the allowed quotation statuses
-- Drop the old constraint and recreate with COMPLETE included
ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_status_check;
ALTER TABLE quotations ADD CONSTRAINT quotations_status_check 
  CHECK (status IN ('DRAFT', 'FOR_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED', 'COMPLETE'));
