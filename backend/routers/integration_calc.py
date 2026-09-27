"""Pure calculation logic for the Procurement / Sales Financial Integration.

This module contains no I/O and no framework dependencies. Every function is a
pure function of its inputs, mirroring the role of ``routers/ar_ap_calc.py``:
it keeps the integration-aware routers (``ap.py``, ``ar.py``, ``purchasing.py``,
``quotations.py``) thin (validation + persistence + audit + status sync) and
makes the decision logic straightforward to verify exhaustively with
property-based tests.

All monetary results produced by this module are expressed in Philippine Pesos
and rounded to two decimal places to match the ``numeric(14,2)`` columns used
for persistence.
"""

# ---------------------------------------------------------------------------
# Eligibility status models
# ---------------------------------------------------------------------------

# Purchase-order statuses from which a draft supplier bill may be generated.
# Draft AP can be prepared once the PO has been sent, then reconciled later
# against received quantities as the receiving workflow catches up.
PO_BILLABLE_STATUSES = ("PO_SENT", "RECEIVED", "PARTIALLY_RECEIVED")
AP_VAT_CODES = ("VAT_INPUT", "VAT_EXEMPT")

# Quotation statuses from which a draft customer invoice may be generated. New
# terminal quotations use COMPLETE; the legacy aliases remain eligible until
# historical rows are backfilled.
QUOTATION_INVOICEABLE_STATUSES = ("APPROVED", "SENT", "COMPLETE", "ACCEPTED", "CONVERTED")

# Purchase-order statuses that are explicitly *not eligible* for billing (as
# opposed to merely not-yet-received). A ``REJECTED`` PO can never be billed.
PO_INELIGIBLE_STATUSES = ("REJECTED",)

# Quotation statuses that are explicitly *not approved* / not eligible for
# invoicing. ``DRAFT`` and ``FOR_APPROVAL`` have not yet passed approval, and
# ``REJECTED`` can never be invoiced.
QUOTATION_INELIGIBLE_STATUSES = ("DRAFT", "FOR_APPROVAL", "REJECTED")


def po_billing_eligibility(po_status: str) -> str:
    """Classify a purchase order's eligibility to generate a draft bill.

    The result drives the AP "Create Draft Bill" action and its rejection
    responses:

    - ``"ELIGIBLE"`` when the PO ``status`` is ``PO_SENT``, ``RECEIVED`` or
      ``PARTIALLY_RECEIVED``.
    - ``"NOT_ELIGIBLE"`` when the PO ``status`` is ``REJECTED`` — the PO can
      never be billed (router responds 409, not eligible).
    - ``"NOT_RECEIVED"`` for every other status — the PO simply has not been
      received yet (router responds 409, not received).

    Args:
        po_status: The purchase order's current ``status``.

    Returns:
        One of ``"ELIGIBLE"``, ``"NOT_ELIGIBLE"``, or ``"NOT_RECEIVED"``.
    """
    if po_status in PO_BILLABLE_STATUSES:
        return "ELIGIBLE"
    if po_status in PO_INELIGIBLE_STATUSES:
        return "NOT_ELIGIBLE"
    return "NOT_RECEIVED"


def quotation_invoicing_eligibility(quotation_status: str) -> str:
    """Classify a quotation's eligibility to generate a draft invoice.

    The result drives the AR "Create Draft Invoice" action and its rejection
    responses:

    - ``"ELIGIBLE"`` when the quotation ``status`` is one of ``APPROVED``,
      ``SENT``, or ``COMPLETE``. Legacy ``ACCEPTED`` and ``CONVERTED`` rows
      remain eligible during the status-migration rollout.
    - ``"NOT_ELIGIBLE"`` when the quotation ``status`` is ``REJECTED`` — the
      quotation can never be invoiced (router responds 409, not eligible).
    - ``"NOT_APPROVED"`` for every other status (including ``DRAFT`` and
      ``FOR_APPROVAL``) — the quotation has not passed approval (router
      responds 409, not approved).

    Args:
        quotation_status: The quotation's current ``status``.

    Returns:
        One of ``"ELIGIBLE"``, ``"NOT_ELIGIBLE"``, or ``"NOT_APPROVED"``.
    """
    if quotation_status in QUOTATION_INVOICEABLE_STATUSES:
        return "ELIGIBLE"
    if quotation_status == "REJECTED":
        return "NOT_ELIGIBLE"
    return "NOT_APPROVED"

# ---------------------------------------------------------------------------
# Line mapping (PO -> bill lines, quotation -> invoice lines)
# ---------------------------------------------------------------------------

def billable_quantity(po_status: str, line: dict) -> float:
    """Compute the billable quantity for a purchase-order line.

    The quantity that may be billed depends on how the source purchase order was
    received:

    - When the PO ``status`` is ``PARTIALLY_RECEIVED``, only the
      ``received_quantity`` of the line may be billed.
    - Otherwise (a sent or fully received PO), the full ordered ``quantity``
      may be billed.

    Missing quantities are treated as zero.

    Args:
        po_status: The source purchase order's ``status``.
        line: A PO line mapping with ``quantity`` and ``received_quantity``.

    Returns:
        The billable quantity for the line.
    """
    if po_status == "PARTIALLY_RECEIVED":
        return line.get("received_quantity") or 0
    return line.get("quantity") or 0


def build_bill_lines(po_status: str, po_lines: list[dict]) -> list[dict]:
    """Map purchase-order lines to draft supplier-bill lines.

    Produces exactly one bill line for each PO line whose
    :func:`billable_quantity` is greater than zero (lines with nothing billable
    are dropped). Each produced bill line is a mapping with:

    - ``description``: the PO line ``item_description`` when it is a non-empty
      string, otherwise the ``product_code`` (fallback).
    - ``vat_exclusive_amount``: item cost plus the billable share of shipping,
      duties, and brokerage.
    - ``vat_code``: copied from the PO line, defaulting to ``VAT_EXEMPT`` when
      the source value is missing or invalid.

    Args:
        po_status: The source purchase order's ``status`` (``PO_SENT``,
            ``RECEIVED`` or ``PARTIALLY_RECEIVED``), which determines the
            billable quantity.
        po_lines: The source purchase order's line mappings.

    Returns:
        A list of draft bill-line mappings, one per billable PO line.
    """
    bill_lines: list[dict] = []
    for line in po_lines:
        qty = billable_quantity(po_status, line)
        if qty <= 0:
            continue
        item_description = line.get("item_description")
        if isinstance(item_description, str) and item_description.strip():
            description = item_description
        else:
            description = line.get("product_code") or ""
        unit_cost = line.get("final_unit_cost") or 0
        ordered_quantity = line.get("quantity") or 0
        charge_ratio = min(qty / ordered_quantity, 1) if ordered_quantity > 0 else 0
        additional_cost = (
            (line.get("freight") or 0)
            + (line.get("duties") or 0)
            + (line.get("other_charges") or 0)
        ) * charge_ratio
        vat_code = line.get("vat_code")
        if vat_code not in AP_VAT_CODES:
            vat_code = "VAT_EXEMPT"
        bill_lines.append(
            {
                "description": description,
                "vat_exclusive_amount": round((qty * unit_cost) + additional_cost, 2),
                "vat_code": vat_code,
            }
        )
    return bill_lines


def is_service(product_type: str | None) -> bool:
    """Decide whether a quotation line's product type denotes a service.

    Service lines drive ``line_type = SERVICE`` and ``wht_code = WHT_SERVICE_2``
    on the generated invoice line; everything else is treated as a material
    line. The comparison is case-insensitive and tolerant of surrounding
    whitespace, and a missing product type is treated as a material line.

    Args:
        product_type: The quotation line's ``product_type`` (may be ``None``).

    Returns:
        ``True`` when ``product_type`` denotes a service line; ``False``
        otherwise.
    """
    if not isinstance(product_type, str):
        return False
    return product_type.strip().upper() == "SERVICE"


def ar_vat_code_for_quotation_rate(vat_rate: float | int | None) -> str:
    """Map the quotation's VAT rate to the configured AR tax code."""
    return "VAT_OUTPUT" if float(vat_rate or 0) > 0 else "VAT_EXEMPT"


def build_invoice_lines(quotation_vat_rate: float | int | None, q_lines: list[dict]) -> list[dict]:
    """Map quotation lines to draft customer-invoice lines.

    Produces exactly one invoice line per quotation line. Each produced invoice
    line is a mapping with:

    - ``description``: the quotation line ``description``.
    - ``vat_exclusive_amount``:
      ``round(quantity * selling_price * (1 - discount_percent / 100), 2)``.
    - ``line_type`` / ``wht_code``: ``SERVICE`` / ``WHT_SERVICE_2`` when the line
      :func:`is_service`, otherwise ``MATERIAL`` / ``WHT_MATERIAL_1``.
    - ``vat_code``: ``VAT_OUTPUT`` when the quotation has a positive VAT rate;
      otherwise ``VAT_EXEMPT``.

    Args:
        quotation_vat_rate: The VAT rate snapshotted on the source quotation.
        q_lines: The source quotation's line mappings.

    Returns:
        A list of draft invoice-line mappings, one per quotation line.
    """
    vat_code = ar_vat_code_for_quotation_rate(quotation_vat_rate)
    invoice_lines: list[dict] = []
    for line in q_lines:
        quantity = line.get("quantity") or 0
        selling_price = line.get("selling_price") or 0
        discount_percent = line.get("discount_percent") or 0
        amount = round(quantity * selling_price * (1 - discount_percent / 100), 2)
        if is_service(line.get("product_type")):
            line_type = "SERVICE"
            wht_code = "WHT_SERVICE_2"
        else:
            line_type = "MATERIAL"
            wht_code = "WHT_MATERIAL_1"
        invoice_lines.append(
            {
                "description": line.get("description"),
                "vat_exclusive_amount": amount,
                "line_type": line_type,
                "wht_code": wht_code,
                "vat_code": vat_code,
            }
        )
    return invoice_lines

# ---------------------------------------------------------------------------
# Totals aggregation (bill header / invoice header)
# ---------------------------------------------------------------------------

from routers.ar_ap_calc import vat_amount, wht_amount

# Configured Tax_Code rates (see Requirement glossary). These mirror the rows
# seeded in the ``tax_codes`` table and keep this pure module self-contained for
# property testing. Routers that already load editable rates from the database
# may pass their own ``rates`` mapping to override these defaults.
TAX_CODE_RATES = {
    "VAT_INPUT": 0.12,
    "VAT_OUTPUT": 0.12,
    "VAT_EXEMPT": 0.00,
    "WHT_MATERIAL_1": 0.01,
    "WHT_SERVICE_2": 0.02,
    "NO_WHT": 0.00,
}


def aggregate_bill_totals(bill_lines: list[dict], rates: dict | None = None) -> dict:
    """Aggregate draft supplier-bill lines into the bill header totals.

    Each bill line carries its PO-derived ``vat_code``. VAT input is computed
    using that code's configured rate, so ``VAT_EXEMPT`` lines contribute zero.
    The per-line VAT amount reuses :func:`routers.ar_ap_calc.vat_amount` so the
    rounding rule is not re-derived. The header values are:

    - ``vat_exclusive_amount``: ``round(sum of line vat_exclusive_amount, 2)``.
    - ``vat_input``: ``round(sum over lines of vat_amount(line amount,
      line vat_code rate), 2)``.

    The database derives ``gross_amount``, ``ewt_material``, and ``net_payable``
    from these stored columns, so they are not computed here.

    Args:
        bill_lines: Draft bill-line mappings (e.g. from :func:`build_bill_lines`),
            each with a ``vat_exclusive_amount`` and ``vat_code``.
        rates: Optional ``{tax_code: rate}`` override; defaults to
            :data:`TAX_CODE_RATES`.

    Returns:
        A mapping with ``vat_exclusive_amount`` and ``vat_input``.
    """
    rates = rates if rates is not None else TAX_CODE_RATES

    vat_exclusive_total = 0.0
    vat_input_total = 0.0
    for line in bill_lines:
        amount = line.get("vat_exclusive_amount") or 0
        vat_code = line.get("vat_code")
        if vat_code not in AP_VAT_CODES:
            vat_code = "VAT_EXEMPT"
        vat_exclusive_total += amount
        vat_input_total += vat_amount(amount, rates[vat_code])

    return {
        "vat_exclusive_amount": round(vat_exclusive_total, 2),
        "vat_input": round(vat_input_total, 2),
    }


def aggregate_invoice_totals(invoice_lines: list[dict], rates: dict | None = None) -> dict:
    """Aggregate draft customer-invoice lines into the invoice header totals.

    Each invoice line carries its own ``vat_code`` and ``wht_code``, which map
    to Tax_Code rates. The per-line VAT and withholding amounts reuse
    :func:`routers.ar_ap_calc.vat_amount` and
    :func:`routers.ar_ap_calc.wht_amount` so the rounding rule is not
    re-derived. The header values are:

    - ``billing_subtotal``: ``round(sum of line vat_exclusive_amount, 2)``.
    - ``vat_output``: ``round(sum over lines of vat_amount(line amount,
      line vat rate), 2)``.
    - ``wht_amount``: ``round(sum over lines of wht_amount(line amount,
      line wht rate), 2)``.

    The database derives ``gross_amount`` and ``net_collectible`` from these
    stored columns, so they are not computed here.

    Args:
        invoice_lines: Draft invoice-line mappings (e.g. from
            :func:`build_invoice_lines`), each with a ``vat_exclusive_amount``,
            a ``vat_code``, and a ``wht_code``.
        rates: Optional ``{tax_code: rate}`` override; defaults to
            :data:`TAX_CODE_RATES`.

    Returns:
        A mapping with ``billing_subtotal``, ``vat_output``, and ``wht_amount``.
    """
    rates = rates if rates is not None else TAX_CODE_RATES

    billing_subtotal = 0.0
    vat_output_total = 0.0
    wht_total = 0.0
    for line in invoice_lines:
        amount = line.get("vat_exclusive_amount") or 0
        billing_subtotal += amount
        vat_output_total += vat_amount(amount, rates[line["vat_code"]])
        wht_total += wht_amount(amount, rates[line["wht_code"]])

    return {
        "billing_subtotal": round(billing_subtotal, 2),
        "vat_output": round(vat_output_total, 2),
        "wht_amount": round(wht_total, 2),
    }

# ---------------------------------------------------------------------------
# Header builders and project-code matching (draft bill / draft invoice)
# ---------------------------------------------------------------------------

from datetime import date

# Sentinel placeholder used for a draft bill's ``supplier_invoice_number`` when
# the user does not supply one at generation time (Requirement 1.7). A draft
# whose ``supplier_invoice_number`` is empty or still equals this placeholder
# may not be confirmed.
PLACEHOLDER_SUPPLIER_INVOICE_NUMBER = "PENDING"


def build_bill_header(
    po: dict,
    bill_number: str,
    *,
    supplier_id=None,
    source_purchase_order_id=None,
    supplier_invoice_number=None,
    bill_date: date | None = None,
    due_date: date | None = None,
) -> dict:
    """Build the header for a draft supplier bill generated from a Received_PO.

    The builder is pure: it performs no I/O and never generates the bill number
    itself. The caller (``ap.py``) generates a unique ``bill_number`` in the
    ``BILL-YYYYMM-NNN`` format via the existing AP numbering sequence
    (``ar_ap_calc.generate_document_number``) and passes it in.

    The produced header always satisfies the draft-bill invariants:

    - ``lifecycle_status = "DRAFT"`` and ``record_status = "ACTIVE"``.
    - ``supplier_id`` equal to the PO ``supplier_id`` (or the explicit override).
    - ``po_number`` equal to the PO ``po_number``.
    - ``source_purchase_order_id`` equal to the PO ``purchase_order_id`` (or the
      explicit override) — the stable id-based Source_Reference.
    - ``bill_date`` equal to the current date when not supplied.
    - ``due_date`` always on or after ``bill_date`` (defaults to ``bill_date``
      when omitted, and is clamped up to ``bill_date`` if an earlier date is
      supplied).
    - ``supplier_invoice_number`` set to the supplied value, or to
      :data:`PLACEHOLDER_SUPPLIER_INVOICE_NUMBER` when omitted/blank.

    Args:
        po: The source purchase-order mapping (``supplier_id``, ``po_number``,
            ``purchase_order_id``).
        bill_number: The pre-generated ``BILL-YYYYMM-NNN`` document number.
        supplier_id: Optional explicit supplier id; defaults to the PO value.
        source_purchase_order_id: Optional explicit source PO id; defaults to the
            PO ``purchase_order_id``.
        supplier_invoice_number: Optional supplier invoice number; a blank or
            missing value becomes the placeholder sentinel.
        bill_date: Optional bill date; defaults to ``date.today()``.
        due_date: Optional due date; defaults to / clamped to ``bill_date``.

    Returns:
        A draft supplier-bill header mapping.
    """
    if bill_date is None:
        bill_date = date.today()
    if due_date is None or due_date < bill_date:
        due_date = bill_date
    if supplier_id is None:
        supplier_id = po.get("supplier_id")
    if source_purchase_order_id is None:
        source_purchase_order_id = po.get("purchase_order_id")

    if isinstance(supplier_invoice_number, str) and supplier_invoice_number.strip():
        resolved_supplier_invoice_number = supplier_invoice_number
    else:
        resolved_supplier_invoice_number = PLACEHOLDER_SUPPLIER_INVOICE_NUMBER

    return {
        "bill_number": bill_number,
        "supplier_id": supplier_id,
        "po_number": po.get("po_number"),
        "source_purchase_order_id": source_purchase_order_id,
        "supplier_invoice_number": resolved_supplier_invoice_number,
        "bill_date": bill_date,
        "due_date": due_date,
        "lifecycle_status": "DRAFT",
        "record_status": "ACTIVE",
    }


def resolve_project_code(project_name, projects: list[dict]) -> str:
    """Resolve a quotation ``project_name`` to a matching project's code.

    The quotation ``project_name`` matches a project when it equals that
    project's ``project_code`` *or* its ``project_name``. The first matching
    project's ``project_code`` is returned; when no project matches (or the
    quotation has no usable project name), an empty string is returned so the
    generated invoice's ``project_code`` is left empty (Requirement 4.5).

    Matching is exact aside from tolerating surrounding whitespace on both the
    quotation value and the candidate project fields.

    Args:
        project_name: The quotation ``project_name`` to resolve (may be ``None``
            or blank).
        projects: A collection of project mappings, each with ``project_code``
            and ``project_name``.

    Returns:
        The matching project's ``project_code``, or ``""`` when there is no
        match.
    """
    if not (isinstance(project_name, str) and project_name.strip()):
        return ""
    target = project_name.strip()

    for project in projects:
        code = project.get("project_code")
        name = project.get("project_name")
        code_matches = isinstance(code, str) and code.strip() == target
        name_matches = isinstance(name, str) and name.strip() == target
        if code_matches or name_matches:
            return code or ""
    return ""


def build_invoice_header(
    quotation: dict,
    invoice_number: str,
    *,
    due_date: date,
    customer_id=None,
    source_quotation_id=None,
    sales_order_ref: str | None = None,
    project_code: str = "",
    invoice_date: date | None = None,
) -> dict:
    """Build the header for a draft customer invoice from an Approved_Quotation.

    The builder is pure: it performs no I/O and never generates the invoice
    number itself. The caller (``ar.py``) generates a unique ``invoice_number``
    in the ``INV-YYYYMM-NNN`` format via the existing AR numbering sequence
    (``ar_ap_calc.generate_document_number``) and passes it in. The caller also
    resolves ``project_code`` (via :func:`resolve_project_code`) and passes it
    in.

    The produced header always satisfies the draft-invoice invariants:

    - ``lifecycle_status = "DRAFT"`` and ``record_status = "ACTIVE"``.
    - ``customer_id`` equal to the quotation ``client_id`` (or the explicit
      override).
    - ``sales_order_ref`` equal to the sales order number when supplied,
      otherwise the quotation ``quotation_no``.
    - ``source_quotation_id`` equal to the quotation ``quotation_id`` (or the
      explicit override) — the stable id-based Source_Reference.
    - ``project_code`` equal to the supplied (already resolved) value, defaulting
      to an empty string.
    - ``invoice_date`` equal to the current date when not supplied.
    - ``due_date`` supplied by the caller after applying the customer's payment
      terms.

    Args:
        quotation: The source quotation mapping (``client_id``, ``quotation_no``,
            ``quotation_id``).
        invoice_number: The pre-generated ``INV-YYYYMM-NNN`` document number.
        customer_id: Optional explicit customer id; defaults to the quotation
            ``client_id``.
        source_quotation_id: Optional explicit source quotation id; defaults to
            the quotation ``quotation_id``.
        project_code: The resolved project code; defaults to ``""`` (empty).
        invoice_date: Optional invoice date; defaults to ``date.today()``.
        due_date: Due date calculated from the customer's payment terms.

    Returns:
        A draft customer-invoice header mapping.
    """
    if invoice_date is None:
        invoice_date = date.today()
    if customer_id is None:
        customer_id = quotation.get("client_id")
    if source_quotation_id is None:
        source_quotation_id = quotation.get("quotation_id")

    return {
        "invoice_number": invoice_number,
        "customer_id": customer_id,
        "sales_order_ref": sales_order_ref or quotation.get("quotation_no"),
        "source_quotation_id": source_quotation_id,
        "project_code": project_code or "",
        "invoice_date": invoice_date,
        "due_date": due_date,
        "lifecycle_status": "DRAFT",
        "record_status": "ACTIVE",
    }

# ---------------------------------------------------------------------------
# Duplicate-billing / duplicate-invoicing guard
# ---------------------------------------------------------------------------

# HTTP status signals returned by :func:`duplicate_decision`. The router maps
# these to the corresponding ``HTTPException`` responses.
DUPLICATE_EXISTING_STATUS = 409  # an active document already references the source
OVERRIDE_REASON_REQUIRED_STATUS = 422  # override supplied without a reason


def active_source_refs(records: list[dict], ref_key: str) -> list[str]:
    """Collect the source-reference values of the ``ACTIVE`` records only.

    The duplicate guard must consider a purchase order "already billed" (or a
    quotation "already invoiced") *only* when an Active_Record references it; a
    document that has been discarded (``record_status == "ARCHIVED"``) must never
    block a fresh draft (Property 13, Requirements 7.5 and 8.5). This helper is
    the pure filter that enforces that rule, independent of whether the records
    are supplier bills (which reference a PO via ``po_number``) or customer
    invoices (which reference a quotation via ``sales_order_ref``).

    A record contributes its reference when:

    - its ``record_status`` is ``"ACTIVE"``, and
    - its ``ref_key`` value is a non-empty string (after stripping surrounding
      whitespace) — blank or missing references are skipped so they cannot
      spuriously trigger the guard.

    Args:
        records: A collection of bill or invoice mappings, each carrying a
            ``record_status`` and the chosen ``ref_key``.
        ref_key: The mapping key holding the source reference value
            (``"po_number"`` for bills, ``"sales_order_ref"`` for invoices).

    Returns:
        The list of source-reference values drawn from the ``ACTIVE`` records,
        in input order.
    """
    refs: list[str] = []
    for record in records:
        if record.get("record_status") != "ACTIVE":
            continue
        ref = record.get(ref_key)
        if isinstance(ref, str) and ref.strip():
            refs.append(ref)
    return refs


def duplicate_decision(active_refs: list[str], override: bool, reason: str | None) -> dict:
    """Decide whether a draft may be generated against a possibly-billed source.

    This is the pure core of the Duplicate_Guard shared by AP draft-bill and AR
    draft-invoice generation. ``active_refs`` is the set of source references
    held by *active* prior documents (see :func:`active_source_refs`); when it is
    empty there is nothing to guard against. The decision drives the router's
    response:

    - empty ``active_refs`` -> ``allow=True``, ``status=None``,
      ``used_override=False`` (no existing active document; generate normally).
    - non-empty ``active_refs`` + ``override`` + a non-empty ``reason`` ->
      ``allow=True``, ``status=None``, ``used_override=True`` (the override is
      honoured; the router writes an OVERRIDE audit entry with the reason).
    - non-empty ``active_refs`` + ``override`` + an empty/blank ``reason`` ->
      ``allow=False``, ``status=422``, ``used_override=False`` (an override
      reason is required).
    - non-empty ``active_refs`` + no ``override`` -> ``allow=False``,
      ``status=409``, ``used_override=False`` (an active document already exists;
      the router names it).

    The ``reason`` is treated as blank when it is ``None`` or contains only
    whitespace.

    Args:
        active_refs: Source references held by active prior documents.
        override: Whether the user supplied an explicit override flag.
        reason: The override reason; required (non-empty) when overriding.

    Returns:
        A mapping ``{"allow": bool, "status": int | None,
        "used_override": bool}``.
    """
    if not active_refs:
        return {"allow": True, "status": None, "used_override": False}

    if override:
        if isinstance(reason, str) and reason.strip():
            return {"allow": True, "status": None, "used_override": True}
        return {
            "allow": False,
            "status": OVERRIDE_REASON_REQUIRED_STATUS,
            "used_override": False,
        }

    return {
        "allow": False,
        "status": DUPLICATE_EXISTING_STATUS,
        "used_override": False,
    }

# ---------------------------------------------------------------------------
# Draft confirmation predicates (draft bill / draft invoice -> CONFIRMED)
# ---------------------------------------------------------------------------

# HTTP status the router returns when a draft cannot be confirmed because it is
# missing required data (an empty/placeholder supplier invoice number, or no
# lines). The "not a draft" case is a separate 409 handled by the router.
CONFIRM_MISSING_DATA_STATUS = 422

# Field updates applied to a draft on successful confirmation. The lifecycle
# transitions DRAFT -> CONFIRMED and the document enters its open payment /
# collection lifecycle as UNPAID (Requirements 3.5, 6.5).
CONFIRMED_LIFECYCLE_STATUS = "CONFIRMED"
CONFIRMED_PAYMENT_STATUS = "UNPAID"
CONFIRMED_COLLECTION_STATUS = "UNPAID"


def has_usable_supplier_invoice_number(supplier_invoice_number) -> bool:
    """Decide whether a bill's ``supplier_invoice_number`` is real, not pending.

    A supplier invoice number is "usable" for confirmation when it is a string
    that is non-empty after stripping surrounding whitespace *and* does not still
    equal the :data:`PLACEHOLDER_SUPPLIER_INVOICE_NUMBER` sentinel that draft
    generation writes when the user supplies no value (Requirement 1.7). The
    placeholder comparison tolerates surrounding whitespace and case.

    Args:
        supplier_invoice_number: The bill's ``supplier_invoice_number`` (may be
            ``None``, blank, or the placeholder sentinel).

    Returns:
        ``True`` when the value is a genuine supplier invoice number; ``False``
        when it is missing, blank, or still the placeholder.
    """
    if not isinstance(supplier_invoice_number, str):
        return False
    stripped = supplier_invoice_number.strip()
    if not stripped:
        return False
    return stripped.upper() != PLACEHOLDER_SUPPLIER_INVOICE_NUMBER.upper()


def can_confirm_bill(supplier_invoice_number, line_count: int) -> bool:
    """Decide whether a draft supplier bill may be confirmed.

    This is the pure core of Property 10. Confirmation is permitted *exactly
    when* both conditions hold:

    - the bill has a usable (non-empty, non-placeholder)
      ``supplier_invoice_number`` (see
      :func:`has_usable_supplier_invoice_number`), and
    - the bill has at least one bill line (``line_count >= 1``).

    The predicate decides only whether the transition is allowed; the caller
    (``ap.py``) is responsible for first checking the bill is actually a draft
    (otherwise a separate 409 applies) and for applying
    :func:`confirmed_bill_updates` when permitted.

    Args:
        supplier_invoice_number: The draft bill's ``supplier_invoice_number``.
        line_count: The number of lines attached to the draft bill.

    Returns:
        ``True`` when the draft may be confirmed; ``False`` otherwise.
    """
    return has_usable_supplier_invoice_number(supplier_invoice_number) and line_count >= 1


def can_confirm_invoice(line_count: int) -> bool:
    """Decide whether a draft customer invoice may be confirmed.

    This is the pure core of Property 11. Confirmation is permitted *exactly
    when* the invoice has at least one invoice line (``line_count >= 1``).

    The predicate decides only whether the transition is allowed; the caller
    (``ar.py``) is responsible for first checking the invoice is actually a draft
    (otherwise a separate 409 applies) and for applying
    :func:`confirmed_invoice_updates` when permitted.

    Args:
        line_count: The number of lines attached to the draft invoice.

    Returns:
        ``True`` when the draft may be confirmed; ``False`` otherwise.
    """
    return line_count >= 1


def bill_confirmation_blockers(supplier_invoice_number, line_count: int) -> list[str]:
    """List the reasons a draft bill cannot be confirmed (for the 422 message).

    Returns a stable, ordered list of human-readable reasons explaining why
    :func:`can_confirm_bill` would reject the draft. The list is empty exactly
    when confirmation is permitted, so ``not bill_confirmation_blockers(...)`` is
    equivalent to ``can_confirm_bill(...)``.

    Args:
        supplier_invoice_number: The draft bill's ``supplier_invoice_number``.
        line_count: The number of lines attached to the draft bill.

    Returns:
        An ordered list of blocker descriptions; empty when confirmation is
        allowed.
    """
    blockers: list[str] = []
    if not has_usable_supplier_invoice_number(supplier_invoice_number):
        blockers.append("supplier_invoice_number is required before confirmation")
    if line_count < 1:
        blockers.append("at least one bill line is required before confirmation")
    return blockers


def invoice_confirmation_blockers(line_count: int) -> list[str]:
    """List the reasons a draft invoice cannot be confirmed (for the 422 message).

    Returns a stable, ordered list of human-readable reasons explaining why
    :func:`can_confirm_invoice` would reject the draft. The list is empty exactly
    when confirmation is permitted, so ``not invoice_confirmation_blockers(...)``
    is equivalent to ``can_confirm_invoice(...)``.

    Args:
        line_count: The number of lines attached to the draft invoice.

    Returns:
        An ordered list of blocker descriptions; empty when confirmation is
        allowed.
    """
    blockers: list[str] = []
    if line_count < 1:
        blockers.append("at least one invoice line is required before confirmation")
    return blockers


def confirmed_bill_updates() -> dict:
    """Return the field updates applied to a bill on successful confirmation.

    On confirmation a draft bill transitions ``lifecycle_status`` to
    ``CONFIRMED`` and enters its payment lifecycle with ``payment_status`` set to
    ``UNPAID`` (Requirements 3.4, 3.5). The router merges this mapping into the
    bill only after :func:`can_confirm_bill` permits the transition.

    Returns:
        ``{"lifecycle_status": "CONFIRMED", "payment_status": "UNPAID"}``.
    """
    return {
        "lifecycle_status": CONFIRMED_LIFECYCLE_STATUS,
        "payment_status": CONFIRMED_PAYMENT_STATUS,
    }


def confirmed_invoice_updates() -> dict:
    """Return the field updates applied to an invoice on successful confirmation.

    On confirmation a draft invoice transitions ``lifecycle_status`` to
    ``CONFIRMED`` and enters its collection lifecycle with ``collection_status``
    set to ``UNPAID`` (Requirements 6.4, 6.5). The router merges this mapping
    into the invoice only after :func:`can_confirm_invoice` permits the
    transition.

    Returns:
        ``{"lifecycle_status": "CONFIRMED", "collection_status": "UNPAID"}``.
    """
    return {
        "lifecycle_status": CONFIRMED_LIFECYCLE_STATUS,
        "collection_status": CONFIRMED_COLLECTION_STATUS,
    }

# ---------------------------------------------------------------------------
# Back-reference status derivation and change detection
# ---------------------------------------------------------------------------

# PO_Billing_Status values surfaced on a Purchase_Order (Requirement 9.1).
PO_BILLING_STATUS_NOT_BILLED = "NOT_BILLED"
PO_BILLING_STATUS_PARTIALLY_BILLED = "PARTIALLY_BILLED"
PO_BILLING_STATUS_BILLED = "BILLED"
PO_BILLING_STATUS_PAID = "PAID"

# Quotation_Invoicing_Status values surfaced on a Quotation (Requirement 10.1).
QUOTATION_INVOICING_STATUS_NOT_INVOICED = "NOT_INVOICED"
QUOTATION_INVOICING_STATUS_INVOICED = "INVOICED"
QUOTATION_INVOICING_STATUS_COLLECTED = "COLLECTED"

# The settled payment / collection sentinel shared by bills and invoices: a
# document is fully settled when its status equals this value.
SETTLED_PAYMENT_STATUS = "PAID"


def compute_po_billing_status(po_status: str, confirmed_active_bills: list[dict]) -> str:
    """Derive a Purchase_Order's PO_Billing_Status from its settled bills.

    This is the pure core of Property 14. The caller (``ap.py``) loads the
    ``CONFIRMED`` + ``ACTIVE`` supplier bills that reference the purchase order
    and passes them here together with the PO's own ``status``; this function
    never queries or filters — it assumes ``confirmed_active_bills`` has already
    been narrowed to the relevant Active_Record bills.

    The result follows the design "Status derivation tables" exactly
    (Requirements 9.1–9.5):

    - no confirmed active bills -> ``NOT_BILLED`` (Req 9.2).
    - at least one bill and *every* bill has ``payment_status == "PAID"`` ->
      ``PAID`` (Req 9.5).
    - at least one bill, at least one not yet paid, and the source PO ``status``
      is ``PARTIALLY_RECEIVED`` -> ``PARTIALLY_BILLED`` (Req 9.3).
    - at least one bill, at least one not yet paid, and the source PO ``status``
      is ``RECEIVED`` -> ``BILLED`` (Req 9.4).

    The design tables only enumerate ``PARTIALLY_RECEIVED`` and ``RECEIVED`` for
    the "exists an unpaid bill" case, because a PO is only billable once it has
    been (partially or fully) received. For any *other* ``po_status`` that still
    has unpaid confirmed active bills (a state that should not arise in normal
    operation), this function falls back to ``BILLED``: bills demonstrably exist
    and are not all paid, and ``BILLED`` is the closest "billed but unpaid"
    classification. Reporting ``NOT_BILLED`` would contradict the presence of
    confirmed bills, so the fallback never hides outstanding bills.

    Each bill mapping need only carry a ``payment_status``; a missing/blank
    ``payment_status`` is treated as not-yet-paid (it is not ``"PAID"``).

    Args:
        po_status: The source purchase order's current ``status``.
        confirmed_active_bills: The ``CONFIRMED`` + ``ACTIVE`` supplier-bill
            mappings referencing the PO, each with a ``payment_status``.

    Returns:
        One of ``NOT_BILLED``, ``PARTIALLY_BILLED``, ``BILLED``, or ``PAID``.
    """
    if not confirmed_active_bills:
        return PO_BILLING_STATUS_NOT_BILLED

    all_paid = all(
        bill.get("payment_status") == SETTLED_PAYMENT_STATUS
        for bill in confirmed_active_bills
    )
    if all_paid:
        return PO_BILLING_STATUS_PAID

    if po_status == "PARTIALLY_RECEIVED":
        return PO_BILLING_STATUS_PARTIALLY_BILLED
    # ``RECEIVED`` per the design table, and any other po_status falls back to
    # BILLED since unpaid confirmed bills demonstrably exist.
    return PO_BILLING_STATUS_BILLED


def compute_quotation_invoicing_status(confirmed_active_invoices: list[dict]) -> str:
    """Derive a Quotation's Quotation_Invoicing_Status from its settled invoices.

    This is the pure core of Property 15. The caller (``ar.py``) loads the
    ``CONFIRMED`` + ``ACTIVE`` customer invoices that reference the quotation and
    passes them here; this function never queries or filters — it assumes
    ``confirmed_active_invoices`` has already been narrowed to the relevant
    Active_Record invoices.

    The result follows the design "Status derivation tables" exactly
    (Requirements 10.1–10.4):

    - no confirmed active invoices -> ``NOT_INVOICED`` (Req 10.2).
    - at least one invoice and *every* invoice has
      ``collection_status == "PAID"`` -> ``COLLECTED`` (Req 10.4).
    - at least one invoice with a ``collection_status`` other than ``"PAID"`` ->
      ``INVOICED`` (Req 10.3).

    Each invoice mapping need only carry a ``collection_status``; a missing/blank
    ``collection_status`` is treated as not-yet-collected (it is not ``"PAID"``).

    Args:
        confirmed_active_invoices: The ``CONFIRMED`` + ``ACTIVE`` customer-invoice
            mappings referencing the quotation, each with a ``collection_status``.

    Returns:
        One of ``NOT_INVOICED``, ``INVOICED``, or ``COLLECTED``.
    """
    if not confirmed_active_invoices:
        return QUOTATION_INVOICING_STATUS_NOT_INVOICED

    all_collected = all(
        invoice.get("collection_status") == SETTLED_PAYMENT_STATUS
        for invoice in confirmed_active_invoices
    )
    if all_collected:
        return QUOTATION_INVOICING_STATUS_COLLECTED

    return QUOTATION_INVOICING_STATUS_INVOICED


def status_change(previous: str, computed: str) -> bool:
    """Decide whether a recomputed back-reference status is a real change.

    This is the pure core of Property 17 (Requirement 11.2). The router calls it
    after recomputing a PO_Billing_Status or Quotation_Invoicing_Status to decide
    whether to persist the new value and write a STATUS_CHANGE audit entry. It
    returns ``True`` *if and only if* ``previous`` differs from ``computed`` — so
    a recomputation that equals the stored value triggers neither a write nor an
    audit entry.

    Because :func:`compute_po_billing_status` and
    :func:`compute_quotation_invoicing_status` are pure functions of their
    inputs, recomputing a status from the same bills/invoices always yields the
    same value (Property 16 / Requirement 11.1); combined with this predicate,
    an unchanged input set never produces a spurious change.

    Args:
        previous: The previously stored status value.
        computed: The freshly computed status value.

    Returns:
        ``True`` when the two values differ; ``False`` when they are equal.
    """
    return previous != computed
