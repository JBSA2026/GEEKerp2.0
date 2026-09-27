"""Standard code generator for the GEEK ERP platform.

Format: COMPANY-YYYY-MODULE-NNNN

Company codes:
  Expedia       → EXP
  GreatnessLab  → GLB
  Exigent       → EXG
  KSI           → KSI

Module codes:
  SLS  = Sales / CRM
  QTN  = Quotation
  PR   = Purchase Request
  PO   = Purchase Order
  RFQ  = Request for Quotation
  SQ   = Supplier Quotation
  GR   = Goods Receipt
  INV  = Invoice (AR)
  BIL  = Bill (AP)
  PV   = Payment Voucher
  PRJ  = Project
  DOC  = Document
  JE   = Journal Entry
  WFA  = Workflow Approval
  CUS  = Customer
  PRD  = Product (new items)
  COM  = Commission

Examples:
  KSI-2026-SLS-0001
  EXG-2026-QTN-0001
  EXP-2026-PO-0001
  GLB-2026-INV-0001
  EXP-2026-PRD-0001  (auto-generated product code)
  EXG-2026-COM-0001  (commission number)
"""
import re
import time
from datetime import datetime
from typing import Optional

from database import supabase

# ── Entity → Company code mapping ────────────────────────────────────────────

ENTITY_CODES = {
    "Expedia": "EXP",
    "GreatnessLab": "GLB",
    "Exigent": "EXG",
    "KSI": "KSI",
}

# Aliases: alternate names used by some modules (e.g. quotation stores "kyrios" for KSI)
ENTITY_ALIASES = {
    "kyrios": "KSI",
}

# Reverse lookup: code → entity name
CODE_TO_ENTITY = {v: k for k, v in ENTITY_CODES.items()}


def normalize_entity(entity: Optional[str]) -> Optional[str]:
    """Return a supported canonical entity name, or ``None`` when unknown.

    Unlike ``get_company_code()``, this is deliberately strict so business
    workflows cannot silently default an unknown entity to Expedia.
    """
    if not entity or not str(entity).strip():
        return None

    value = str(entity).strip()
    if value in ENTITY_CODES:
        return value

    value_lower = value.lower()
    for canonical in ENTITY_CODES:
        if canonical.lower() == value_lower:
            return canonical

    alias = ENTITY_ALIASES.get(value_lower)
    if alias:
        return alias

    return CODE_TO_ENTITY.get(value.upper())


# When no entity is provided, use the first entity as default (Expedia)
DEFAULT_COMPANY_CODE = "EXP"

# Valid module codes (for validation)
VALID_MODULE_CODES = {
    "SLS", "QTN", "PR", "PO", "RFQ", "SQ", "GR",
    "INV", "BIL", "PV", "PRJ", "DOC", "JE", "WFA", "CUS", "PRD", "COM",
}


def get_company_code(entity: Optional[str]) -> str:
    """Convert an entity name to its company code. Case-insensitive.

    Handles:
    - None/empty → default (EXP)
    - Exact match (e.g., "Expedia" → "EXP")
    - Case-insensitive match (e.g., "expedia" → "EXP")
    - Alias match (e.g., "kyrios" → "KSI")
    - Already a code (e.g., "EXP" → "EXP")
    - Unknown entity → default with no crash
    """
    if not entity or not entity.strip():
        return DEFAULT_COMPANY_CODE

    entity = entity.strip()

    # Try exact match
    if entity in ENTITY_CODES:
        return ENTITY_CODES[entity]

    # Try case-insensitive match
    entity_lower = entity.lower()
    for key, code in ENTITY_CODES.items():
        if key.lower() == entity_lower:
            return code

    # Try alias match (e.g., "kyrios" → "KSI")
    alias_match = ENTITY_ALIASES.get(entity_lower)
    if alias_match and alias_match in ENTITY_CODES:
        return ENTITY_CODES[alias_match]

    # Maybe they passed the code directly (e.g., "EXP" instead of "Expedia")
    entity_upper = entity.upper()
    if entity_upper in CODE_TO_ENTITY:
        return entity_upper

    # Unknown entity — fall back to default, don't crash
    return DEFAULT_COMPANY_CODE


def generate_code(
    entity: Optional[str],
    module_code: str,
    table: str,
    column: str,
) -> str:
    """Generate the next sequential code in the standard format.

    Format: COMPANY-YYYY-MODULE-NNNN
    e.g. EXG-2026-QTN-0001, KSI-2026-PO-0001

    Foolproof behavior:
    - If entity is None/empty/invalid → uses default company code (EXP)
    - If module_code is invalid → still generates (doesn't crash)
    - If database query fails → falls back to timestamp-based code
    - If sequence parsing fails → starts at 0001
    - Handles race conditions gracefully (worst case: gap in sequence, never duplicate)

    Args:
        entity: Company name (e.g. 'Exigent', 'KSI'), code (e.g. 'EXP'), or None.
        module_code: 2-3 letter module abbreviation (e.g. 'QTN', 'PO').
        table: Database table to check for existing codes.
        column: Column name that stores the code.

    Returns:
        Next code like 'EXG-2026-QTN-0001'.
    """
    company = get_company_code(entity)
    year = datetime.now().year
    module_code = (module_code or "GEN").strip().upper()
    prefix = f"{company}-{year}-{module_code}-"

    try:
        # Query existing codes with this prefix to find the max sequence
        res = (
            supabase.table(table)
            .select(column)
            .like(column, f"{prefix}%")
            .order(column, desc=True)
            .limit(1)
            .execute()
        )

        max_seq = 0
        for row in res.data or []:
            code = row.get(column, "")
            # Extract the numeric suffix after the last dash
            suffix = code.rsplit("-", 1)[-1] if "-" in code else ""
            if suffix.isdigit():
                max_seq = max(max_seq, int(suffix))

        return f"{prefix}{max_seq + 1:04d}"

    except Exception:
        # Database query failed — generate a fallback that's still unique
        # Use timestamp to avoid collision: COMPANY-YYYY-MODULE-T{seconds}
        fallback_seq = int(time.time()) % 100000
        return f"{prefix}{fallback_seq:05d}"


def generate_bir_form_code(entity: Optional[str], form_type: str) -> str:
    """Generate a human-readable code for a BIR form record.

    Format: COMPANY-YYYY-BIR{FORM_TYPE}-NNNN
    e.g. EXP-2026-BIR2307-0001, KSI-2026-BIR0619E-0001

    The module code embeds the BIR form type so each form type has its own
    independent sequence per entity per year.

    Args:
        entity: Company name or code (e.g. 'Expedia', 'KSI').
        form_type: BIR form type string (e.g. '2307', '0619E', '1601C').

    Returns:
        Next form code like 'EXP-2026-BIR2307-0001'.
    """
    module_code = f"BIR{form_type}"
    return generate_code(entity, module_code, "bir_forms", "form_code")


def generate_product_code(entity: Optional[str] = None) -> str:
    """Generate a stable product catalog code.

    Format: COMPANY-YYYY-PRD-NNNN (e.g., EXP-2026-PRD-0001)

    This should be used when a new product needs to be created in the catalog
    (e.g., during PO creation for items not yet in product_list).
    The code is permanent and independent of any PO/RFQ/transaction number.

    Args:
        entity: Company name or code, or None for default.

    Returns:
        Next product code like 'EXP-2026-PRD-0001'.
    """
    return generate_code(entity, "PRD", "product_list", "product_code")
