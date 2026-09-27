-- Migration: Create bir_form_payments linking table
-- Links AP payments to their generated BIR 2307 forms.
-- Each payment with EWT generates/updates a 2307, tracked via this table.

CREATE TABLE IF NOT EXISTS bir_form_payments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    form_record_id BIGINT NOT NULL REFERENCES bir_forms(form_record_id) ON DELETE CASCADE,
    payment_id BIGINT NOT NULL REFERENCES ap_payments(payment_id) ON DELETE CASCADE,
    ewt_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    payment_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (form_record_id, payment_id)
);

-- Index for quick lookup by payment
CREATE INDEX IF NOT EXISTS idx_bir_form_payments_payment_id ON bir_form_payments(payment_id);

-- Index for quick lookup by form
CREATE INDEX IF NOT EXISTS idx_bir_form_payments_form_record_id ON bir_form_payments(form_record_id);

COMMENT ON TABLE bir_form_payments IS 'Links AP payments to their generated BIR 2307 forms. Each payment with EWT generates a 2307 entry.';
