"""Pure calculation logic for the Accounts Receivable / Accounts Payable modules.

This module contains no I/O and no framework dependencies. Every function is a
pure function of its inputs, which keeps the AR/AP routers thin (validation +
persistence + audit) and makes the financial logic straightforward to test
exhaustively with property-based tests.

All monetary results are expressed in Philippine Pesos and rounded to two
decimal places to match the ``numeric(14,2)`` columns used for persistence.
"""

# ---------------------------------------------------------------------------
# Document numbering
# ---------------------------------------------------------------------------

def generate_document_number(prefix: str, period_yyyymm: str, sequence: int) -> str:
    """Build a document number of the form ``PREFIX-YYYYMM-NNN``.

    Used for invoice (``INV``), bill (``BILL``), and payment-voucher (``PV``)
    numbers. ``period_yyyymm`` is the six-digit year-month string (e.g.
    ``"202406"``). ``sequence`` is zero-padded to at least three digits and
    grows beyond three digits when the running sequence requires it.

    Args:
        prefix: The document-type prefix (e.g. ``"INV"``, ``"BILL"``, ``"PV"``).
        period_yyyymm: The six-character ``YYYYMM`` period.
        sequence: The positive running sequence number for the period.

    Returns:
        The formatted document number, e.g. ``"INV-202406-001"``.
    """
    return f"{prefix}-{period_yyyymm}-{sequence:03d}"


# ---------------------------------------------------------------------------
# Tax computation
# ---------------------------------------------------------------------------

def vat_amount(vat_exclusive: float, rate: float) -> float:
    """Compute VAT on a VAT-exclusive amount.

    VAT (output for AR, input for AP) is the VAT-exclusive amount multiplied by
    the selected tax code's rate (0.12 for VAT_OUTPUT/VAT_INPUT, 0.00 for
    VAT_EXEMPT). The result is rounded to two decimal places.

    Args:
        vat_exclusive: The VAT-exclusive line/bill amount.
        rate: The VAT rate from the selected tax code.

    Returns:
        The VAT amount, rounded to two decimal places.
    """
    return round(vat_exclusive * rate, 2)


def wht_amount(vat_exclusive: float, rate: float) -> float:
    """Compute withholding tax on a VAT-exclusive amount.

    Withholding tax (WHT/CWT for AR, EWT for AP) is the VAT-exclusive amount
    multiplied by the selected tax code's rate (0.01 for WHT_MATERIAL_1, 0.02
    for WHT_SERVICE_2, 0.00 for NO_WHT). The result is rounded to two decimal
    places.

    Args:
        vat_exclusive: The VAT-exclusive line/bill amount.
        rate: The withholding-tax rate from the selected tax code.

    Returns:
        The withholding-tax amount, rounded to two decimal places.
    """
    return round(vat_exclusive * rate, 2)

# ---------------------------------------------------------------------------
# Monetary derivations (AR / AP)
# ---------------------------------------------------------------------------

def gross_amount(billing_subtotal: float, vat_output: float) -> float:
    """Compute the gross amount of an invoice or bill.

    Gross Amount is the VAT-exclusive billing subtotal plus the VAT component
    (VAT Output for AR invoices, VAT Input for AP bills). The result is rounded
    to two decimal places.

    Args:
        billing_subtotal: The VAT-exclusive subtotal (sum of line amounts).
        vat_output: The computed VAT amount (VAT Output or VAT Input).

    Returns:
        The gross amount, rounded to two decimal places.
    """
    return round(billing_subtotal + vat_output, 2)


def net_collectible(gross: float, wht: float) -> float:
    """Compute the net collectible amount of an AR invoice.

    Net Collectible is the invoice Gross Amount minus the withholding tax (WHT)
    the customer deducts. The result is rounded to two decimal places.

    Args:
        gross: The invoice gross amount.
        wht: The withholding-tax amount deducted by the customer.

    Returns:
        The net collectible amount, rounded to two decimal places.
    """
    return round(gross - wht, 2)


def net_payable(gross: float, ewt: float) -> float:
    """Compute the net payable amount of an AP supplier bill.

    Net Payable is the bill Gross Amount minus the Expanded Withholding Tax
    (EWT_Material), where EWT_Material is the VAT-exclusive amount multiplied by
    0.01. The result is rounded to two decimal places.

    Args:
        gross: The bill gross amount.
        ewt: The EWT_Material amount (VAT-exclusive amount x 0.01).

    Returns:
        The net payable amount, rounded to two decimal places.
    """
    return round(gross - ewt, 2)


def ar_balance(gross: float, collections_total: float, wht: float) -> float:
    """Compute the outstanding AR balance of an invoice.

    AR Balance is the invoice Gross Amount minus the total of active collections
    minus the withholding tax (WHT). Only active (non-archived) collections
    should be included in ``collections_total``. The result is rounded to two
    decimal places.

    Args:
        gross: The invoice gross amount.
        collections_total: The sum of active collection amounts for the invoice.
        wht: The withholding-tax amount deducted by the customer.

    Returns:
        The outstanding AR balance, rounded to two decimal places.
    """
    return round(gross - collections_total - wht, 2)


def ap_balance(net_payable: float, payments_total: float) -> float:
    """Compute the outstanding AP balance of a supplier bill.

    AP Balance is the bill Net Payable minus the total of payments made. Only
    effective (non-reversed) payments should be included in ``payments_total``.
    The result is rounded to two decimal places.

    Args:
        net_payable: The bill net payable amount.
        payments_total: The sum of effective payment amounts for the bill.

    Returns:
        The outstanding AP balance, rounded to two decimal places.
    """
    return round(net_payable - payments_total, 2)


def collection_status(gross: float, wht: float, collections_total: float) -> str:
    """Derive the collection status of an AR invoice from its active collections.

    The status is determined from the outstanding AR balance (Gross Amount minus
    active collections minus WHT):

    - ``"PAID"`` when the balance is zero (or non-positive after rounding).
    - ``"PARTIALLY_PAID"`` when active collections are positive but the balance
      remains positive.
    - ``"UNPAID"`` when no active collections exist.

    Args:
        gross: The invoice gross amount.
        wht: The withholding-tax amount deducted by the customer.
        collections_total: The sum of active collection amounts for the invoice.

    Returns:
        One of ``"UNPAID"``, ``"PARTIALLY_PAID"``, or ``"PAID"``.
    """
    balance = ar_balance(gross, collections_total, wht)
    if balance <= 0:
        return "PAID"
    if round(collections_total, 2) > 0:
        return "PARTIALLY_PAID"
    return "UNPAID"


# ---------------------------------------------------------------------------
# Aging classification (AR / AP)
# ---------------------------------------------------------------------------

from datetime import date


# The five aging buckets, in chronological order. Both AR (receivables) and AP
# (payables) aging share this single classification.
AGING_BUCKETS = (
    "Current",
    "1-30 Days",
    "31-60 Days",
    "61-90 Days",
    "Over 90 Days",
)


def aging_bucket(due_date: date, today: date) -> str:
    """Classify an outstanding record into one of the five aging buckets.

    Classification is based on how many days overdue the record is, measured as
    ``today - due_date``:

    - ``"Current"`` when the due date is on or after today (0 or fewer days
      overdue).
    - ``"1-30 Days"`` when 1 to 30 days overdue (inclusive).
    - ``"31-60 Days"`` when 31 to 60 days overdue (inclusive).
    - ``"61-90 Days"`` when 61 to 90 days overdue (inclusive).
    - ``"Over 90 Days"`` when more than 90 days overdue.

    Every record falls into exactly one bucket.

    Args:
        due_date: The record's due date.
        today: The reference date to measure overdue days against.

    Returns:
        One of the bucket names in :data:`AGING_BUCKETS`.
    """
    days_overdue = (today - due_date).days
    if days_overdue <= 0:
        return "Current"
    if days_overdue <= 30:
        return "1-30 Days"
    if days_overdue <= 60:
        return "31-60 Days"
    if days_overdue <= 90:
        return "61-90 Days"
    return "Over 90 Days"


def aging_totals(records: list, today: date) -> dict:
    """Sum outstanding balances per aging bucket.

    Each record is a mapping describing one outstanding invoice or bill and must
    contain:

    - ``"due_date"``: a :class:`datetime.date` — the record's due date.
    - ``"balance"``: a number — the record's outstanding balance.

    Each record's balance is added to the single bucket determined by
    :func:`aging_bucket`. All five buckets are always present in the result,
    defaulting to ``0.0`` when no record falls into them, so the returned totals
    partition the total outstanding balance across the five buckets. Each
    per-bucket total is rounded to two decimal places.

    Args:
        records: A list of record mappings, each with ``"due_date"`` and
            ``"balance"`` keys.
        today: The reference date to classify each record against.

    Returns:
        A dict mapping every bucket name in :data:`AGING_BUCKETS` to its summed
        outstanding balance.
    """
    totals = {bucket: 0.0 for bucket in AGING_BUCKETS}
    for record in records:
        bucket = aging_bucket(record["due_date"], today)
        totals[bucket] += record["balance"]
    return {bucket: round(total, 2) for bucket, total in totals.items()}


# ---------------------------------------------------------------------------
# Currency formatting
# ---------------------------------------------------------------------------

def format_peso(value: float) -> str:
    """Format a monetary amount as a Philippine Peso string.

    The result begins with the Peso symbol (``₱``), groups the integer part with
    comma thousands separators, and always shows exactly two decimal places. The
    value zero formats exactly as ``"₱0.00"``.

    Args:
        value: The monetary amount to format.

    Returns:
        The formatted peso string, e.g. ``"₱1,234.50"`` or ``"₱0.00"``.
    """
    return f"₱{value:,.2f}"


# ---------------------------------------------------------------------------
# State-machine predicates (invoices / bills / checks)
# ---------------------------------------------------------------------------

# Terminal check statuses: once a check reaches one of these, no further status
# transition is permitted (one-way state machine).
CHECK_TERMINAL_STATUSES = ("CLEARED", "BOUNCED", "CANCELLED")


def can_modify_invoice(status: str) -> bool:
    """Decide whether an invoice or bill may be modified.

    Invoices (AR) and bills (AP) become immutable once they leave the
    ``"UNPAID"`` state (i.e. once any collection/payment is applied and the
    status advances to ``"PARTIALLY_PAID"`` or ``"PAID"``). Modification is
    therefore permitted only while the record is still ``"UNPAID"``.

    Args:
        status: The current lifecycle status of the invoice or bill.

    Returns:
        ``True`` only when ``status`` is exactly ``"UNPAID"``; ``False`` for any
        other status.
    """
    return status == "UNPAID"


def can_transition_check(current: str, target: str) -> bool:
    """Decide whether a check status transition is permitted.

    Checks follow a one-way terminal state machine: the only legal transitions
    are from ``"ISSUED"`` to one of ``"CLEARED"``, ``"BOUNCED"``, or
    ``"CANCELLED"``. Once a check is in any terminal state
    (:data:`CHECK_TERMINAL_STATUSES`), no further transition is allowed, so any
    ``current`` other than ``"ISSUED"`` returns ``False``.

    Args:
        current: The check's current status.
        target: The proposed new status.

    Returns:
        ``True`` only when ``current`` is ``"ISSUED"`` and ``target`` is one of
        the terminal statuses; ``False`` otherwise (including no-op transitions
        such as ``ISSUED`` → ``ISSUED``).
    """
    return current == "ISSUED" and target in CHECK_TERMINAL_STATUSES


def is_valid_clearing_date(clearing_date: date, check_date: date, today: date) -> bool:
    """Decide whether a check's clearing date is valid.

    When a check clears, its clearing date must fall on or after the check date
    and on or before today — a check cannot clear before it was issued, nor in
    the future.

    Args:
        clearing_date: The date the check cleared.
        check_date: The date written on the check (its issue date).
        today: The reference "current" date.

    Returns:
        ``True`` when ``check_date <= clearing_date <= today``; ``False``
        otherwise.
    """
    return check_date <= clearing_date <= today
