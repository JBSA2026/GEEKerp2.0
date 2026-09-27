-- ============================================================================
-- GEEK ERP — reference data and first login
-- Run after 02_functions.sql. Safe to re-run (ON CONFLICT DO NOTHING).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Roles referenced by the code. SUPER_ADMIN bypasses module permissions;
-- the others get module access via Administration → Roles (role_modules).
-- ---------------------------------------------------------------------------
INSERT INTO public.roles (role_name, description, is_system) VALUES
    ('SUPER_ADMIN',        'Full system access',                          true),
    ('MANAGEMENT',         'Executive management',                        true),
    ('ACCOUNTING_MANAGER', 'Accounting manager',                          true),
    ('ACCOUNTING_STAFF',   'Accounting staff',                            true),
    ('FINANCE_TREASURY',   'Finance / treasury',                          true),
    ('HR_MANAGER',         'HR manager',                                  true),
    ('HR_STAFF',           'HR staff',                                    true),
    ('SALES_MANAGER',      'Sales manager',                               true),
    ('SALES_USER',         'Sales user',                                  true),
    ('PURCHASING_MANAGER', 'Purchasing manager',                          true),
    ('PURCHASING_USER',    'Purchasing user',                             true),
    ('PROJECT_MANAGER',    'Project manager',                             true),
    ('WORKFLOW_APPROVER',  'Can approve workflow requests',               true)
ON CONFLICT (role_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Default Super Admin (same credentials the README documents).
--   email: superadmin@geek   password: admin@123
-- CHANGE THIS PASSWORD IMMEDIATELY after the first login.
-- ---------------------------------------------------------------------------
INSERT INTO public.employees (first_name, last_name, email, password_hash, is_active)
VALUES ('Super', 'Admin', 'superadmin@geek', crypt('admin@123', gen_salt('bf', 12)), true)
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.employee_roles (employee_id, role_id)
SELECT e.employee_id, r.role_id
FROM public.employees e, public.roles r
WHERE e.email = 'superadmin@geek' AND r.role_name = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO public.employee_entities (employee_id, entity, access_level)
SELECT e.employee_id, ent, 'full'
FROM public.employees e, unnest(ARRAY['Expedia', 'GreatnessLab', 'Exigent', 'KSI']) AS ent
WHERE e.email = 'superadmin@geek'
ON CONFLICT (employee_id, entity) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Companies (entities). TIN / RDO / address are left blank on purpose:
-- fill them in (Tax Management → entity profiles) before generating BIR forms.
-- ---------------------------------------------------------------------------
INSERT INTO public.entity_tax_profiles (entity, registered_name) VALUES
    ('Expedia',      'Expedia Solutions Specialist Inc.'),
    ('GreatnessLab', 'GreatnessLab Inc.'),
    ('Exigent',      'Exigent Corporation'),
    ('KSI',          'Kyrios Solutions Inc.')
ON CONFLICT (entity) DO NOTHING;

INSERT INTO public.entity_config (entity, standard_start_time, grace_period_minutes) VALUES
    ('Expedia', '08:00', 15), ('GreatnessLab', '08:00', 15),
    ('Exigent', '08:00', 15), ('KSI', '08:00', 15)
ON CONFLICT (entity) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tax codes (schema-map "Seeded codes").
-- ---------------------------------------------------------------------------
INSERT INTO public.tax_codes (code, tax_type, rate, scope, editable) VALUES
    ('VAT_OUTPUT',     'VAT', 0.12, 'AR',   false),
    ('VAT_INPUT',      'VAT', 0.12, 'AP',   false),
    ('VAT_EXEMPT',     'VAT', 0,    'BOTH', false),
    ('WHT_MATERIAL_1', 'WHT', 0.01, 'BOTH', true),
    ('WHT_SERVICE_2',  'WHT', 0.02, 'BOTH', true),
    ('NO_WHT',         'WHT', 0,    'BOTH', false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Starter chart of accounts: the account codes the automatic book postings
-- (utils/books_integration.py) look up. Extend it in General Ledger → Accounts.
-- ---------------------------------------------------------------------------
INSERT INTO public.gl_accounts (account_code, account_name, account_type, normal_balance) VALUES
    ('111201', 'Cash in Bank',                    'Asset',     'Debit'),
    ('112100', 'Accounts Receivable',             'Asset',     'Debit'),
    ('113100', 'Inventory / Expense',             'Asset',     'Debit'),
    ('114500', 'Creditable Withholding Tax',      'Asset',     'Debit'),
    ('150000', 'Input VAT',                       'Asset',     'Debit'),
    ('211100', 'Accounts Payable',                'Liability', 'Credit'),
    ('212100', 'Output VAT Payable',              'Liability', 'Credit'),
    ('212200', 'Expanded Withholding Tax Payable','Liability', 'Credit'),
    ('400000', 'Sales Revenue',                   'Revenue',   'Credit')
ON CONFLICT (account_code) DO NOTHING;
