"""BIR Books Integration — Auto-push from AR, AP, Payroll into GL Books.

This module provides functions that are called by AR, AP, and Payroll routers
when money-related transactions are finalized. Each function creates an entry
in the appropriate BIR book (Cash Receipts, Cash Disbursements, Sales Book,
Purchases Book) with accurate source references.

ACCURACY RULES:
- Amounts are taken DIRECTLY from the source record, never recomputed
- Entity is taken from the source record's entity field
- Source module + source ID are stored for drill-down traceability
- TIN is fetched from client_list or supplier_list when available
- All entries are created with posting_status='For Review' (not auto-posted)
  so the bookkeeper can review before posting to GL
"""

from database import supabase


def _num(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _normalize_entity(entity) -> str:
    """Normalize entity name to match CHECK constraint values."""
    if not entity:
        return ""
    mapping = {
        "expedia": "Expedia",
        "greatnesslab": "GreatnessLab",
        "exigent": "Exigent",
        "ksi": "KSI",
    }
    return mapping.get(entity.lower().strip(), entity)


def _get_client_tin(customer_id) -> str:
    """Fetch TIN from client_list."""
    if not customer_id:
        return ""
    rows = supabase.table("client_list").select("tin_number").eq("client_id", customer_id).limit(1).execute().data or []
    return rows[0].get("tin_number", "") if rows else ""


def _get_client_name(customer_id) -> str:
    """Fetch company name from client_list."""
    if not customer_id:
        return ""
    rows = supabase.table("client_list").select("company_name").eq("client_id", customer_id).limit(1).execute().data or []
    return rows[0].get("company_name", "") if rows else ""


def _get_supplier_tin(supplier_id) -> str:
    """Fetch TIN from supplier_list."""
    if not supplier_id:
        return ""
    rows = supabase.table("supplier_list").select("tin_number").eq("supplier_id", supplier_id).limit(1).execute().data or []
    return rows[0].get("tin_number", "") if rows else ""


def _get_supplier_name(supplier_id) -> str:
    """Fetch supplier name from supplier_list."""
    if not supplier_id:
        return ""
    rows = supabase.table("supplier_list").select("company_name").eq("supplier_id", supplier_id).limit(1).execute().data or []
    return rows[0].get("company_name", "") if rows else ""


# ══════════════════════════════════════════════════════════════════════════════
# 1. AR INVOICE CONFIRMED → Sales Book Entry
# ══════════════════════════════════════════════════════════════════════════════

def create_sales_book_from_ar_invoice(invoice: dict, performed_by: str = "System"):
    """Called when an AR invoice is confirmed (lifecycle_status → CONFIRMED).

    Source fields from ar_invoices:
    - invoice_number → sales_invoice_no
    - customer_id → customer lookup for name + TIN
    - invoice_date → sales_date
    - entity → entity
    - billing_subtotal → vatable_sales (VAT-exclusive base)
    - vat_output → output_vat
    - gross_amount → total_invoice_amount (billing_subtotal + vat_output)
    - wht_amount → recorded in remarks (WHT reduces collectible, not sales)
    """
    entity = _normalize_entity(invoice.get("entity"))
    if not entity:
        return None  # Cannot record without entity

    customer_id = invoice.get("customer_id")
    customer_name = _get_client_name(customer_id)
    tin = _get_client_tin(customer_id)

    billing_subtotal = _num(invoice.get("billing_subtotal"))
    vat_output = _num(invoice.get("vat_output"))
    gross_amount = _num(invoice.get("gross_amount"))

    # Determine VAT type based on whether vat_output > 0
    if vat_output > 0:
        vat_type = "VATable"
        vatable_sales = billing_subtotal
        vat_exempt_sales = 0
        zero_rated_sales = 0
    else:
        vat_type = "VAT-Exempt"
        vatable_sales = 0
        vat_exempt_sales = billing_subtotal
        zero_rated_sales = 0

    record = {
        "entity": entity,
        "sales_date": invoice.get("invoice_date"),
        "sales_invoice_no": invoice.get("invoice_number"),
        "customer_name": customer_name,
        "customer_id": customer_id,
        "tin": tin,
        "description_of_goods_services": f"AR Invoice {invoice.get('invoice_number')}",
        "vat_type": vat_type,
        "vatable_sales": round(vatable_sales, 2),
        "vat_exempt_sales": round(vat_exempt_sales, 2),
        "zero_rated_sales": round(zero_rated_sales, 2),
        "output_vat": round(vat_output, 2),
        "total_invoice_amount": round(gross_amount, 2),
        "cash_or_ar": "Accounts Receivable",
        "collection_status": "Unpaid",
        "source_module": "Accounts Receivable",
        "source_id": invoice.get("invoice_id"),
        "posting_status": "For Review",
        "created_by": performed_by,
    }

    try:
        res = supabase.table("gl_sales_book").insert(record).execute()
        if res.data:
            # Auto-post: create GL journal entry immediately
            _auto_post_sales_entry(res.data[0], performed_by)
        return res.data[0] if res.data else None
    except Exception:
        return None  # Non-critical: don't block the source operation


def _auto_post_sales_entry(sale: dict, performed_by: str):
    """Auto-post a sales book entry to GL journal (Dr AR, Cr Revenue, Cr VAT Output)."""
    from utils.code_generator import generate_code

    total = _num(sale.get("total_invoice_amount"))
    vat = _num(sale.get("output_vat"))
    net_sales = round(total - vat, 2)
    entity = sale.get("entity")

    if total <= 0:
        return

    entry_number = generate_code(entity, "JE", "gl_journal_entries", "entry_number")
    now_iso = __import__("datetime").datetime.now().isoformat()

    # Resolve accounts: AR (112100), Revenue (400000), VAT Output (212100)
    acct_codes = ["112100", "400000", "212100"]
    acct_res = supabase.table("gl_accounts").select("account_id, account_code").in_("account_code", acct_codes).execute()
    code_to_id = {a["account_code"]: a["account_id"] for a in (acct_res.data or [])}

    lines = []
    if total > 0 and "112100" in code_to_id:
        lines.append({"account_id": code_to_id["112100"], "description": "Accounts Receivable - Trade", "debit": round(total, 2), "credit": 0})
    if net_sales > 0 and "400000" in code_to_id:
        lines.append({"account_id": code_to_id["400000"], "description": "Revenue", "debit": 0, "credit": round(net_sales, 2)})
    if vat > 0 and "212100" in code_to_id:
        lines.append({"account_id": code_to_id["212100"], "description": "Output VAT", "debit": 0, "credit": round(vat, 2)})

    if len(lines) < 2:
        return

    total_d = round(sum(l["debit"] for l in lines), 2)
    total_c = round(sum(l["credit"] for l in lines), 2)
    header = {
        "entry_number": entry_number,
        "entry_date": sale.get("sales_date"),
        "description": f"Sales — {sale.get('sales_invoice_no') or sale.get('customer_name') or ''}",
        "reference_module": "Sales Book",
        "reference_number": sale.get("sales_invoice_no"),
        "entity": entity,
        "status": "Posted",
        "posted_by": performed_by,
        "posted_at": now_iso,
        "total_debit": total_d,
        "total_credit": total_c,
    }
    res = supabase.table("gl_journal_entries").insert(header).execute()
    if res.data:
        entry_id = res.data[0]["entry_id"]
        for ln in lines:
            ln["entry_id"] = entry_id
        supabase.table("gl_journal_lines").insert(lines).execute()
        supabase.table("gl_sales_book").update({"posting_status": "Posted", "gl_entry_id": entry_id}).eq("sales_book_id", sale["sales_book_id"]).execute()


# ══════════════════════════════════════════════════════════════════════════════
# 2. AR COLLECTION RECORDED → Cash Receipts Book Entry
# ══════════════════════════════════════════════════════════════════════════════

def create_cash_receipt_from_ar_collection(collection: dict, invoice: dict, performed_by: str = "System"):
    """Called when an AR collection is recorded.

    Source fields:
    - collection.collection_amount → gross_receipt_amount
    - collection.collection_date → receipt_date
    - collection.payment_method → receipt_mode
    - collection.or_number → or_ar_ref_no
    - invoice.invoice_number → invoice_ref
    - invoice.entity → entity
    - invoice.customer_id → customer lookup
    - invoice.vat_output / invoice.gross_amount → proportional output_vat
    - invoice.wht_amount / invoice.gross_amount → proportional ewt

    The net_amount_deposited = collection_amount (EWT is withheld by payer,
    not deducted from deposit — the CWT certificate is the receivable).
    """
    entity = _normalize_entity(invoice.get("entity"))
    if not entity:
        return None

    customer_id = invoice.get("customer_id")
    customer_name = _get_client_name(customer_id)
    tin = _get_client_tin(customer_id)

    collection_amount = _num(collection.get("collection_amount"))
    gross_amount = _num(invoice.get("gross_amount"))

    # Proportional VAT: if this collection is partial, compute VAT proportion
    # Output VAT for this collection = (collection_amount / gross_amount) * total_vat
    total_vat = _num(invoice.get("vat_output"))
    if gross_amount > 0:
        proportion = collection_amount / gross_amount
        output_vat = round(total_vat * proportion, 2)
    else:
        output_vat = 0

    # EWT: wht_amount on the invoice is the TOTAL withholding.
    # For partial collections, proportion applies.
    total_wht = _num(invoice.get("wht_amount"))
    if gross_amount > 0:
        ewt = round(total_wht * proportion, 2)
    else:
        ewt = 0

    # Net deposited = collection amount (cash actually received)
    # Note: In PH, the customer withholds CWT and gives you a 2307 certificate.
    # You receive LESS cash, but collection_amount in the system may or may not
    # include the CWT. Based on the AR router, collection_amount is the actual
    # cash received (post-WHT), so net_deposited = collection_amount.
    net_deposited = collection_amount

    # Map payment_method to receipt_mode
    method_map = {
        "bank_transfer": "Bank Transfer",
        "check": "Check",
        "cash": "Cash",
        "online": "Online Payment",
    }
    payment_method = (collection.get("payment_method") or "").lower()
    receipt_mode = method_map.get(payment_method, collection.get("payment_method") or "Others")

    record = {
        "entity": entity,
        "receipt_date": collection.get("collection_date"),
        "or_ar_ref_no": collection.get("or_number") or "",
        "customer_source": customer_name,
        "customer_id": customer_id,
        "tin": tin,
        "description": f"Collection for {invoice.get('invoice_number')}",
        "receipt_mode": receipt_mode,
        "bank_cash_account": "",
        "gross_receipt_amount": round(collection_amount, 2),
        "output_vat": output_vat,
        "ewt_withholding_tax": ewt,
        "net_amount_deposited": round(net_deposited, 2),
        "invoice_ref": invoice.get("invoice_number"),
        "source_module": "Accounts Receivable",
        "source_id": collection.get("collection_id"),
        "posting_status": "For Review",
        "created_by": performed_by,
    }

    try:
        res = supabase.table("gl_cash_receipts").insert(record).execute()
        if res.data:
            _auto_post_cash_receipt_entry(res.data[0], performed_by)
        return res.data[0] if res.data else None
    except Exception:
        return None


def _auto_post_cash_receipt_entry(receipt: dict, performed_by: str):
    """Auto-post a cash receipt to GL journal (Dr Cash, Dr CWT, Cr AR)."""
    from utils.code_generator import generate_code

    gross = _num(receipt.get("gross_receipt_amount"))
    ewt = _num(receipt.get("ewt_withholding_tax"))
    net = _num(receipt.get("net_amount_deposited"))
    entity = receipt.get("entity")

    if gross <= 0:
        return

    entry_number = generate_code(entity, "JE", "gl_journal_entries", "entry_number")
    now_iso = __import__("datetime").datetime.now().isoformat()

    # Resolve accounts: Cash in Bank (111201), CWT Receivable (114500), AR (112100)
    acct_codes = ["111201", "112100"]
    if ewt > 0:
        acct_codes.append("114500")
    acct_res = supabase.table("gl_accounts").select("account_id, account_code").in_("account_code", acct_codes).execute()
    code_to_id = {a["account_code"]: a["account_id"] for a in (acct_res.data or [])}

    lines = []
    if net > 0 and "111201" in code_to_id:
        lines.append({"account_id": code_to_id["111201"], "description": "Cash in Bank - Operating", "debit": round(net, 2), "credit": 0})
    if ewt > 0 and "114500" in code_to_id:
        lines.append({"account_id": code_to_id["114500"], "description": "CWT Receivable", "debit": round(ewt, 2), "credit": 0})
    if gross > 0 and "112100" in code_to_id:
        lines.append({"account_id": code_to_id["112100"], "description": "Accounts Receivable - Trade", "debit": 0, "credit": round(gross, 2)})

    if len(lines) < 2:
        return

    total_d = round(sum(l["debit"] for l in lines), 2)
    total_c = round(sum(l["credit"] for l in lines), 2)
    header = {
        "entry_number": entry_number,
        "entry_date": receipt.get("receipt_date"),
        "description": f"Collection — {receipt.get('or_ar_ref_no') or receipt.get('customer_source') or ''}",
        "reference_module": "Cash Receipts Book",
        "reference_number": receipt.get("or_ar_ref_no"),
        "entity": entity,
        "status": "Posted",
        "posted_by": performed_by,
        "posted_at": now_iso,
        "total_debit": total_d,
        "total_credit": total_c,
    }
    res = supabase.table("gl_journal_entries").insert(header).execute()
    if res.data:
        entry_id = res.data[0]["entry_id"]
        for ln in lines:
            ln["entry_id"] = entry_id
        supabase.table("gl_journal_lines").insert(lines).execute()
        supabase.table("gl_cash_receipts").update({"posting_status": "Posted", "gl_entry_id": entry_id}).eq("receipt_id", receipt["receipt_id"]).execute()
# 3. AP BILL CONFIRMED → Purchases Book Entry
# ══════════════════════════════════════════════════════════════════════════════

def create_purchases_book_from_ap_bill(bill: dict, performed_by: str = "System"):
    """Called when an AP bill is confirmed (lifecycle_status → CONFIRMED).

    Source fields from ap_bills:
    - bill_number → supplier_invoice_or_no (for internal ref)
    - supplier_invoice_number → the actual supplier document number
    - supplier_id → supplier lookup for name + TIN
    - bill_date → purchase_date
    - entity → entity
    - vat_exclusive_amount → purchase_amount
    - vat_input → input_vat
    - gross_amount → total_invoice_amount (vat_exclusive + vat_input)
    """
    entity = _normalize_entity(bill.get("entity"))
    if not entity:
        return None

    supplier_id = bill.get("supplier_id")
    supplier_name = _get_supplier_name(supplier_id)
    tin = _get_supplier_tin(supplier_id)

    vat_exclusive = _num(bill.get("vat_exclusive_amount"))
    vat_input = _num(bill.get("vat_input"))
    gross_amount = _num(bill.get("gross_amount"))

    # Determine VAT type
    if vat_input > 0:
        vat_type = "VATable"
    else:
        vat_type = "VAT-Exempt"

    record = {
        "entity": entity,
        "purchase_date": bill.get("bill_date"),
        "supplier_invoice_or_no": bill.get("supplier_invoice_number") or bill.get("bill_number"),
        "supplier_name": supplier_name,
        "supplier_id": supplier_id,
        "tin": tin,
        "description_of_purchase": f"AP Bill {bill.get('bill_number')} — PO {bill.get('po_number') or 'N/A'}",
        "vat_type": vat_type,
        "purchase_amount": round(vat_exclusive, 2),
        "input_vat": round(vat_input, 2),
        "total_invoice_amount": round(gross_amount, 2),
        "cash_or_ap": "Accounts Payable",
        "payment_status": "Unpaid",
        "expense_asset_account": "",
        "source_module": "Accounts Payable",
        "source_id": bill.get("bill_id"),
        "posting_status": "For Review",
        "created_by": performed_by,
    }

    try:
        res = supabase.table("gl_purchases_book").insert(record).execute()
        if res.data:
            # Auto-post: create GL journal entry immediately
            _auto_post_purchases_entry(res.data[0], performed_by)
        return res.data[0] if res.data else None
    except Exception:
        return None


def _auto_post_purchases_entry(purchase: dict, performed_by: str):
    """Auto-post a purchases book entry to GL journal (Dr Inventory/Expense, Dr VAT Input, Cr AP)."""
    from utils.code_generator import generate_code

    total = _num(purchase.get("total_invoice_amount"))
    vat = _num(purchase.get("input_vat"))
    net_purchase = _num(purchase.get("purchase_amount"))
    entity = purchase.get("entity")

    if total <= 0:
        return

    entry_number = generate_code(entity, "JE", "gl_journal_entries", "entry_number")
    now_iso = __import__("datetime").datetime.now().isoformat()

    # Resolve accounts: Inventory/Expense (113100), Input VAT (150000), AP (211100)
    acct_codes = ["113100", "150000", "211100"]
    acct_res = supabase.table("gl_accounts").select("account_id, account_code").in_("account_code", acct_codes).execute()
    code_to_id = {a["account_code"]: a["account_id"] for a in (acct_res.data or [])}

    lines = []
    if net_purchase > 0 and "113100" in code_to_id:
        lines.append({"account_id": code_to_id["113100"], "description": "Merchandise Inventory", "debit": round(net_purchase, 2), "credit": 0})
    if vat > 0 and "150000" in code_to_id:
        lines.append({"account_id": code_to_id["150000"], "description": "Input VAT", "debit": round(vat, 2), "credit": 0})
    if total > 0 and "211100" in code_to_id:
        lines.append({"account_id": code_to_id["211100"], "description": "Accounts Payable - Trade", "debit": 0, "credit": round(total, 2)})

    if len(lines) < 2:
        return

    total_d = round(sum(l["debit"] for l in lines), 2)
    total_c = round(sum(l["credit"] for l in lines), 2)
    header = {
        "entry_number": entry_number,
        "entry_date": purchase.get("purchase_date"),
        "description": f"Purchase — {purchase.get('supplier_invoice_or_no') or purchase.get('supplier_name') or ''}",
        "reference_module": "Purchases Book",
        "reference_number": purchase.get("supplier_invoice_or_no"),
        "entity": entity,
        "status": "Posted",
        "posted_by": performed_by,
        "posted_at": now_iso,
        "total_debit": total_d,
        "total_credit": total_c,
    }
    res = supabase.table("gl_journal_entries").insert(header).execute()
    if res.data:
        entry_id = res.data[0]["entry_id"]
        for ln in lines:
            ln["entry_id"] = entry_id
        supabase.table("gl_journal_lines").insert(lines).execute()
        supabase.table("gl_purchases_book").update({"posting_status": "Posted", "gl_entry_id": entry_id}).eq("purchase_book_id", purchase["purchase_book_id"]).execute()
# 4. AP PAYMENT RECORDED → Cash Disbursements Book Entry
# ══════════════════════════════════════════════════════════════════════════════

def create_cash_disbursement_from_ap_payment(payment: dict, bill: dict, voucher: dict, performed_by: str = "System"):
    """Called when an AP payment is recorded against a voucher/bill.

    Source fields:
    - payment.payment_amount → gross_payment_amount
    - payment.payment_date → disbursement_date
    - payment.payment_method → payment_mode
    - bill.supplier_id → supplier lookup
    - bill.entity → entity
    - bill.bill_number → invoice_billing_ref
    - bill.vat_input / bill.gross_amount → proportional input_vat
    - bill.ewt_material / bill.gross_amount → proportional ewt

    For AP: the company PAYS the net amount (gross - EWT withheld).
    - gross_payment_amount = payment_amount recorded
    - ewt_withholding_tax = proportional EWT (we withhold from supplier)
    - net_cash_paid = payment_amount (the actual cash going out)
    """
    entity = _normalize_entity(bill.get("entity"))
    if not entity:
        return None

    supplier_id = bill.get("supplier_id")
    supplier_name = _get_supplier_name(supplier_id)
    tin = _get_supplier_tin(supplier_id)

    payment_amount = _num(payment.get("payment_amount"))
    bill_gross = _num(bill.get("gross_amount"))
    bill_vat = _num(bill.get("vat_input"))
    bill_ewt = _num(bill.get("ewt_material"))

    # Proportional VAT and EWT for this payment
    if bill_gross > 0:
        proportion = payment_amount / bill_gross
        input_vat = round(bill_vat * proportion, 2)
        ewt = round(bill_ewt * proportion, 2)
    else:
        input_vat = 0
        ewt = 0

    # Net cash paid = payment_amount (the actual disbursement)
    net_cash_paid = payment_amount

    # Map payment_method
    method_map = {
        "bank_transfer": "Bank Transfer",
        "check": "Check",
        "cash": "Cash",
        "online": "Online Payment",
    }
    payment_method = (payment.get("payment_method") or "").lower()
    mode = method_map.get(payment_method, payment.get("payment_method") or "Others")

    voucher_number = voucher.get("voucher_number", "") if voucher else ""

    record = {
        "entity": entity,
        "disbursement_date": payment.get("payment_date"),
        "cv_check_ref_no": voucher_number,
        "payee_supplier": supplier_name,
        "supplier_id": supplier_id,
        "tin": tin,
        "description": f"Payment for {bill.get('bill_number')} via {voucher_number}",
        "payment_mode": mode,
        "bank_cash_account": "",
        "expense_account_title": "",
        "gross_payment_amount": round(payment_amount, 2),
        "input_vat": input_vat,
        "ewt_withholding_tax": ewt,
        "net_cash_paid": round(net_cash_paid, 2),
        "invoice_billing_ref": bill.get("bill_number"),
        "source_module": "Accounts Payable",
        "source_id": payment.get("payment_id"),
        "posting_status": "For Review",
        "created_by": performed_by,
    }

    try:
        res = supabase.table("gl_cash_disbursements").insert(record).execute()
        if res.data:
            _auto_post_cash_disbursement_entry(res.data[0], performed_by)
        return res.data[0] if res.data else None
    except Exception:
        return None


def _auto_post_cash_disbursement_entry(disb: dict, performed_by: str):
    """Auto-post a cash disbursement to GL journal (Dr AP, Cr Cash, Cr EWT Payable)."""
    from utils.code_generator import generate_code

    gross = _num(disb.get("gross_payment_amount"))
    ewt = _num(disb.get("ewt_withholding_tax"))
    net = _num(disb.get("net_cash_paid"))
    entity = disb.get("entity")

    if gross <= 0:
        return

    entry_number = generate_code(entity, "JE", "gl_journal_entries", "entry_number")
    now_iso = __import__("datetime").datetime.now().isoformat()

    # Resolve accounts: AP (211100), Cash in Bank (111201), EWT Payable (212200)
    acct_codes = ["211100", "111201"]
    if ewt > 0:
        acct_codes.append("212200")
    acct_res = supabase.table("gl_accounts").select("account_id, account_code").in_("account_code", acct_codes).execute()
    code_to_id = {a["account_code"]: a["account_id"] for a in (acct_res.data or [])}

    lines = []
    if gross > 0 and "211100" in code_to_id:
        lines.append({"account_id": code_to_id["211100"], "description": "Accounts Payable - Trade", "debit": round(gross, 2), "credit": 0})
    if net > 0 and "111201" in code_to_id:
        lines.append({"account_id": code_to_id["111201"], "description": "Cash in Bank - Operating", "debit": 0, "credit": round(net, 2)})
    if ewt > 0 and "212200" in code_to_id:
        lines.append({"account_id": code_to_id["212200"], "description": "EWT Payable", "debit": 0, "credit": round(ewt, 2)})

    if len(lines) < 2:
        return

    total_d = round(sum(l["debit"] for l in lines), 2)
    total_c = round(sum(l["credit"] for l in lines), 2)
    header = {
        "entry_number": entry_number,
        "entry_date": disb.get("disbursement_date"),
        "description": f"Payment — {disb.get('cv_check_ref_no') or disb.get('payee_supplier') or ''}",
        "reference_module": "Cash Disbursements Book",
        "reference_number": disb.get("cv_check_ref_no"),
        "entity": entity,
        "status": "Posted",
        "posted_by": performed_by,
        "posted_at": now_iso,
        "total_debit": total_d,
        "total_credit": total_c,
    }
    res = supabase.table("gl_journal_entries").insert(header).execute()
    if res.data:
        entry_id = res.data[0]["entry_id"]
        for ln in lines:
            ln["entry_id"] = entry_id
        supabase.table("gl_journal_lines").insert(lines).execute()
        supabase.table("gl_cash_disbursements").update({"posting_status": "Posted", "gl_entry_id": entry_id}).eq("disbursement_id", disb["disbursement_id"]).execute()
# ══════════════════════════════════════════════════════════════════════════════

def create_books_from_payroll_release(run: dict, items: list, performed_by: str = "System"):
    """Called when a payroll run is released (status → RELEASED).

    Creates:
    1. One Cash Disbursements entry per entity for total net pay
    2. One General Journal entry per entity for the full payroll breakdown:
       - Dr: Salaries & Wages (gross pay)
       - Cr: SSS Payable (employee share)
       - Cr: PhilHealth Payable (employee share)
       - Cr: PagIBIG Payable (employee share)
       - Cr: Withholding Tax Payable (BIR tax)
       - Cr: Other Deductions
       - Cr: Cash in Bank (net pay — what actually goes out)

    The employer share (SSS, PhilHealth, PagIBIG) is an ADDITIONAL expense,
    recorded separately:
       - Dr: SSS Employer Expense
       - Dr: PhilHealth Employer Expense
       - Dr: PagIBIG Employer Expense
       - Cr: SSS/PhilHealth/PagIBIG Payable (employer share)
    """
    if not items:
        return []

    # Group items by entity (from employee_201)
    employee_ids = [item.get("employee_id") for item in items if item.get("employee_id")]
    entity_map = {}
    if employee_ids:
        # Batch fetch entities
        for i in range(0, len(employee_ids), 100):
            batch = employee_ids[i:i+100]
            rows = supabase.table("employee_201").select("employee_id, entity").in_("employee_id", batch).execute().data or []
            for r in rows:
                entity_map[r["employee_id"]] = r.get("entity")

    # Aggregate by entity
    entity_totals = {}
    for item in items:
        emp_id = item.get("employee_id")
        ent = entity_map.get(emp_id, "Expedia")  # Default to first entity if not found
        if ent not in entity_totals:
            entity_totals[ent] = {
                "gross_pay": 0, "net_pay": 0,
                "sss_employee": 0, "sss_employer": 0,
                "philhealth_employee": 0, "philhealth_employer": 0,
                "pagibig_employee": 0, "pagibig_employer": 0,
                "withholding_tax": 0, "loan_deductions": 0,
                "other_deductions": 0, "total_deductions": 0,
            }
        t = entity_totals[ent]
        t["gross_pay"] += _num(item.get("gross_pay"))
        t["net_pay"] += _num(item.get("net_pay"))
        t["sss_employee"] += _num(item.get("sss_employee"))
        t["sss_employer"] += _num(item.get("sss_employer"))
        t["philhealth_employee"] += _num(item.get("philhealth_employee"))
        t["philhealth_employer"] += _num(item.get("philhealth_employer"))
        t["pagibig_employee"] += _num(item.get("pagibig_employee"))
        t["pagibig_employer"] += _num(item.get("pagibig_employer"))
        t["withholding_tax"] += _num(item.get("withholding_tax"))
        t["loan_deductions"] += _num(item.get("loan_deductions"))
        t["other_deductions"] += _num(item.get("other_deductions"))
        t["total_deductions"] += _num(item.get("total_deductions"))

    results = []
    pay_date = run.get("pay_date") or run.get("period_end")
    run_id = run.get("run_id")
    period_desc = f"{run.get('period_start')} to {run.get('period_end')}"

    for ent, totals in entity_totals.items():
        if not ent or ent == "None":
            continue

        # Cash Disbursement entry (net pay — actual cash out)
        disb_record = {
            "entity": ent,
            "disbursement_date": pay_date,
            "cv_check_ref_no": f"PAYROLL-{run_id}",
            "payee_supplier": "Employees — Payroll",
            "tin": "",
            "description": f"Payroll release for {period_desc}",
            "payment_mode": "Bank Transfer",
            "bank_cash_account": "Payroll Bank Account",
            "expense_account_title": "Salaries and Wages",
            "gross_payment_amount": round(totals["gross_pay"], 2),
            "input_vat": 0,
            "ewt_withholding_tax": round(totals["withholding_tax"], 2),
            "net_cash_paid": round(totals["net_pay"], 2),
            "invoice_billing_ref": f"Payroll Run #{run_id}",
            "source_module": "Payroll",
            "source_id": run_id,
            "posting_status": "For Review",
            "created_by": performed_by,
        }

        try:
            res = supabase.table("gl_cash_disbursements").insert(disb_record).execute()
            if res.data:
                results.append(res.data[0])
        except Exception:
            pass

    return results
