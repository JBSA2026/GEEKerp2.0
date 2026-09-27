-- ============================================================================
-- GEEK ERP — views, functions and API grants
-- Run after 01_schema.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- gl_ledger_postings: posted journal lines, flattened for the BIR books
-- "General Ledger" view (GET /general-ledger/books/ledger-postings).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.gl_ledger_postings AS
SELECT
    l.line_id,
    e.entry_id,
    e.entry_number,
    e.entry_date          AS posting_date,
    e.entity,
    e.reference_module,
    e.reference_number,
    coalesce(l.description, e.description) AS description,
    a.account_id,
    a.account_code,
    a.account_name,
    a.account_type,
    coalesce(l.debit, 0)  AS debit,
    coalesce(l.credit, 0) AS credit,
    e.status,
    e.posted_by,
    e.posted_at
FROM public.gl_journal_lines l
JOIN public.gl_journal_entries e ON e.entry_id = l.entry_id
JOIN public.gl_accounts a        ON a.account_id = l.account_id
WHERE e.status = 'Posted' OR e.posting_status = 'Posted';

-- ---------------------------------------------------------------------------
-- receive_inventory_transfer: completes a pending warehouse-to-warehouse
-- TRANSFER movement atomically (called by POST /inventory/transfers/{id}/receive
-- for transfers that did not originate from a purchase order).
--   * adds the quantity to destination stock (same product/warehouse/location)
--   * marks the movement RECEIVED and records the receiving location
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_inventory_transfer(
    p_movement_id bigint,
    p_location_id text DEFAULT NULL,
    p_received_by_employee_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    m          public.inventory_movements%ROWTYPE;
    v_location uuid := nullif(p_location_id, '')::uuid;
    s          public.inventory_stock%ROWTYPE;
    v_qty      numeric;
BEGIN
    SELECT * INTO m FROM public.inventory_movements
    WHERE movement_id = p_movement_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pending transfer % not found', p_movement_id;
    END IF;
    IF m.movement_type <> 'TRANSFER' OR coalesce(m.transfer_status, '') <> 'PENDING' THEN
        RAISE EXCEPTION 'Movement % is not a pending transfer', p_movement_id;
    END IF;
    IF m.to_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Transfer % has no destination warehouse', p_movement_id;
    END IF;

    v_location := coalesce(v_location, m.to_location_id);

    SELECT * INTO s FROM public.inventory_stock
    WHERE product_code = m.product_code
      AND warehouse_id = m.to_warehouse_id
      AND location_id IS NOT DISTINCT FROM v_location
    ORDER BY stock_id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        v_qty := coalesce(s.quantity_on_hand, 0) + m.quantity;
        UPDATE public.inventory_stock
           SET quantity_on_hand = v_qty,
               status = CASE
                   WHEN v_qty <= 0 THEN 'OUT_OF_STOCK'
                   WHEN coalesce(reorder_level, 0) > 0 AND v_qty < reorder_level THEN 'LOW_STOCK'
                   ELSE 'ACTIVE' END
         WHERE stock_id = s.stock_id;
    ELSE
        v_qty := m.quantity;
        INSERT INTO public.inventory_stock
            (product_code, warehouse_id, location_id, quantity_on_hand,
             reserved_quantity, reorder_level, unit_cost, status)
        VALUES
            (m.product_code, m.to_warehouse_id, v_location, v_qty,
             0, 0, coalesce(m.unit_cost, 0), CASE WHEN v_qty > 0 THEN 'ACTIVE' ELSE 'OUT_OF_STOCK' END);
    END IF;

    UPDATE public.inventory_movements
       SET transfer_status = 'RECEIVED',
           to_location_id  = v_location,
           remarks         = trim(coalesce(remarks, '') || ' [TRANSFER_RECEIVED]')
     WHERE movement_id = p_movement_id;

    -- keep the product master's quantity in step with stock on hand
    UPDATE public.product_list p
       SET quantity = (SELECT coalesce(sum(quantity_on_hand), 0)
                         FROM public.inventory_stock
                        WHERE product_code = m.product_code)
     WHERE p.product_code = m.product_code;

    RETURN jsonb_build_object(
        'ok', true,
        'movement_id', p_movement_id,
        'received_quantity', m.quantity,
        'destination_quantity', v_qty,
        'received_by_employee_id', p_received_by_employee_id
    );
END
$$;

-- ---------------------------------------------------------------------------
-- API grants.
-- The backend talks to the database through Supabase's REST API (PostgREST).
-- On Supabase these roles already exist; the DO block makes this file safe on
-- plain PostgreSQL too. See database/README.md for the security note on keys.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
            EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA public TO %I', r);
            EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO %I', r);
            EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I', r);
        END IF;
    END LOOP;
END
$$;

-- ask PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
