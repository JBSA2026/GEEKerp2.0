from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.errors import db_http_error
from utils.client_contacts import require_client_contact

router = APIRouter(prefix="/opportunities", tags=["opportunities"])


class OpportunityCreate(BaseModel):
    employee_id: Optional[int] = None
    client_id: Optional[int] = None
    contact_id: Optional[int] = None
    project_name: str
    entity: Optional[str] = None
    estimated_value: Optional[float] = None
    probability_percentage: Optional[float] = None
    stage: Optional[str] = None
    expected_closed_date: Optional[str] = None
    competitor: Optional[str] = None
    loss_reason: Optional[str] = None
    remarks: Optional[str] = None


class OpportunityUpdate(BaseModel):
    employee_id: Optional[int] = None
    client_id: Optional[int] = None
    contact_id: Optional[int] = None
    project_name: Optional[str] = None
    entity: Optional[str] = None
    estimated_value: Optional[float] = None
    probability_percentage: Optional[float] = None
    stage: Optional[str] = None
    expected_closed_date: Optional[str] = None
    competitor: Optional[str] = None
    loss_reason: Optional[str] = None
    remarks: Optional[str] = None


@router.get("/")
def get_opportunities(search: Optional[str] = Query(None)):
    req = supabase.table("opportunities").select("*").order("opportunity_id")
    if search and search.strip():
        s = search.strip()
        req = req.or_(
            f"project_name.ilike.%{s}%,"
            f"stage.ilike.%{s}%,"
            f"competitor.ilike.%{s}%,"
            f"remarks.ilike.%{s}%"
        )
    return req.execute().data or []


@router.post("/", status_code=201)
def create_opportunity(request: Request, payload: OpportunityCreate):
    _, performed_by = _extract_jwt_claims(request)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    require_client_contact(payload.client_id, payload.contact_id)
    try:
        res = supabase.table("opportunities").insert(data).execute()
    except Exception as e:
        raise db_http_error(e)
    if not res.data:
        raise HTTPException(status_code=400, detail="Insert failed")

    record = res.data[0]
    write_audit_log(
        action="CREATE",
        module_name="Sales",
        description=f"Created opportunity: {payload.project_name}",
        performed_by=performed_by,
        record_id=record.get("opportunity_id"),
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return record


@router.patch("/{opportunity_id}")
def update_opportunity(opportunity_id: int, request: Request, payload: OpportunityUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)

    existing = supabase.table("opportunities").select("*").eq("opportunity_id", opportunity_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    if not updates:
        return existing.data

    effective_client_id = updates.get("client_id", existing.data.get("client_id"))
    effective_contact_id = updates.get("contact_id", existing.data.get("contact_id"))
    require_client_contact(effective_client_id, effective_contact_id)

    try:
        res = supabase.table("opportunities").update(updates).eq("opportunity_id", opportunity_id).execute()
    except Exception as e:
        raise db_http_error(e)
    if not res.data:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    write_audit_log(
        action="UPDATE",
        module_name="Sales",
        description=f"Updated opportunity ID {opportunity_id}",
        performed_by=performed_by,
        record_id=opportunity_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


@router.delete("/{opportunity_id}", status_code=204)
def delete_opportunity(opportunity_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    supabase.table("opportunities").delete().eq("opportunity_id", opportunity_id).execute()

    write_audit_log(
        action="DELETE",
        module_name="Sales",
        description=f"Deleted opportunity ID {opportunity_id}",
        performed_by=performed_by,
        record_id=opportunity_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return None


@router.get("/{opportunity_id}/related")
def get_related_records(opportunity_id: int):
    """Return related quotations, workflow approvals, and sales orders for a deal."""
    # Get the opportunity first
    opp = (
        supabase.table("opportunities")
        .select("*")
        .eq("opportunity_id", opportunity_id)
        .limit(1)
        .execute()
        .data or []
    )
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    opp = opp[0]

    project_name = (opp.get("project_name") or "").strip()
    client_id = opp.get("client_id")

    # ── Related Quotations ────────────────────────────────────────────────────
    quotations = []
    try:
        # Match by opportunity_id first
        q_by_id = (
            supabase.table("quotations")
            .select("quotation_id, quotation_no, project_name, status, client_id, created_at, updated_at, company")
            .eq("opportunity_id", opportunity_id)
            .order("quotation_id", desc=True)
            .execute()
            .data or []
        )
        seen_ids = {q["quotation_id"] for q in q_by_id}

        # Also match by project_name + client_id
        q_by_name = []
        if project_name:
            req = supabase.table("quotations").select(
                "quotation_id, quotation_no, project_name, status, client_id, created_at, updated_at, company"
            ).ilike("project_name", project_name)
            if client_id:
                req = req.eq("client_id", client_id)
            q_by_name = req.order("quotation_id", desc=True).execute().data or []

        for q in q_by_name:
            if q["quotation_id"] not in seen_ids:
                q_by_id.append(q)
                seen_ids.add(q["quotation_id"])

        quotations = q_by_id
    except Exception:
        pass

    # ── Related Workflow Approvals ────────────────────────────────────────────
    approvals = []
    try:
        # Get approvals linked to quotations of this opportunity
        qtn_ids = [q["quotation_id"] for q in quotations]
        if qtn_ids:
            wa = (
                supabase.table("workflow_approvals")
                .select("approval_id, request_type, reference_module, reference_id, reference_number, status, approver_name, decided_at, submitted_at")
                .eq("reference_module", "Quotations")
                .in_("reference_id", qtn_ids)
                .order("approval_id", desc=True)
                .execute()
                .data or []
            )
            approvals.extend(wa)

        # Get Deal Closure approvals linked to this opportunity
        deal_approvals = (
            supabase.table("workflow_approvals")
            .select("approval_id, request_type, reference_module, reference_id, reference_number, status, approver_name, decided_at, submitted_at")
            .eq("reference_module", "Sales")
            .eq("reference_id", opportunity_id)
            .order("approval_id", desc=True)
            .execute()
            .data or []
        )
        approvals.extend(deal_approvals)

        # Also check for pending connected quotations (not yet in workflow_approvals table)
        pending_qtns = [q for q in quotations if q.get("status") == "FOR_APPROVAL"]
        for pq in pending_qtns:
            # Check if this already has an approval record
            already = any(
                a.get("reference_module") == "Quotations" and a.get("reference_id") == pq["quotation_id"]
                for a in approvals
            )
            if not already:
                approvals.append({
                    "approval_id": f"QTN-{pq['quotation_id']}",
                    "request_type": "Quotation Approval",
                    "reference_module": "Quotations",
                    "reference_id": pq["quotation_id"],
                    "reference_number": pq.get("quotation_no"),
                    "status": "Pending",
                    "approver_name": None,
                    "decided_at": None,
                    "submitted_at": pq.get("created_at"),
                    "is_connected": True,
                })
    except Exception:
        pass

    # ── Related Sales Orders ─────────────────────────────────────────────────
    sales_orders = []
    try:
        qtn_ids = [q["quotation_id"] for q in quotations]
        if qtn_ids:
            so = (
                supabase.table("sales_orders")
                .select("sales_order_id, so_number, quotation_id, quotation_no, status, order_date, grand_total, client_id, project_name")
                .in_("quotation_id", qtn_ids)
                .order("sales_order_id", desc=True)
                .execute()
                .data or []
            )
            sales_orders = so

        # Also match by project_name
        if project_name and not sales_orders:
            so_by_name = (
                supabase.table("sales_orders")
                .select("sales_order_id, so_number, quotation_id, quotation_no, status, order_date, grand_total, client_id, project_name")
                .ilike("project_name", project_name)
                .order("sales_order_id", desc=True)
                .execute()
                .data or []
            )
            sales_orders = so_by_name
    except Exception:
        pass

    # ── Related Projects ─────────────────────────────────────────────────────
    projects = []
    try:
        if project_name:
            proj = (
                supabase.table("projects")
                .select("project_id, project_code, project_name, status, contract_value, entity")
                .ilike("project_name", project_name)
                .order("project_id", desc=True)
                .limit(5)
                .execute()
                .data or []
            )
            projects = proj
    except Exception:
        pass

    # ── Related AR Invoices (billing / payment tracking) ────────────────────────
    ar_invoices = []
    try:
        qtn_ids = [q["quotation_id"] for q in quotations]
        if qtn_ids:
            ar = (
                supabase.table("ar_invoices")
                .select("invoice_id, invoice_number, invoice_date, due_date, net_collectible, collection_status, record_status, lifecycle_status, sales_order_ref")
                .in_("source_quotation_id", qtn_ids)
                .order("invoice_id", desc=True)
                .execute()
                .data or []
            )
            ar_invoices = ar
    except Exception:
        pass

    # ── Related Purchase Orders (procurement) ─────────────────────────────────
    purchase_orders = []
    try:
        # Find PRs that reference this deal's quotation numbers
        qtn_numbers = [q.get("quotation_no") for q in quotations if q.get("quotation_no")]
        relevant_pr_ids = []
        if qtn_numbers:
            all_prs = supabase.table("purchase_requests").select("purchase_request_id, pr_number, remarks").execute().data or []
            for pr in all_prs:
                remarks = pr.get("remarks") or ""
                if any(qn in remarks for qn in qtn_numbers):
                    relevant_pr_ids.append(pr["purchase_request_id"])

        if relevant_pr_ids:
            pos = (
                supabase.table("purchase_orders")
                .select("purchase_order_id, po_number, purchase_request_id, supplier_id, status, po_date, delivery_date, payment_terms")
                .in_("purchase_request_id", relevant_pr_ids)
                .order("purchase_order_id", desc=True)
                .execute()
                .data or []
            )
            purchase_orders = pos
    except Exception:
        pass

    # ── Related Goods Receipts (delivery tracking) ────────────────────────────
    goods_receipts = []
    try:
        po_ids = [po["purchase_order_id"] for po in purchase_orders]
        if po_ids:
            gr = (
                supabase.table("goods_receipts")
                .select("goods_receipt_id, receipt_number, purchase_order_id, received_date, status, remarks")
                .in_("purchase_order_id", po_ids)
                .order("goods_receipt_id", desc=True)
                .execute()
                .data or []
            )
            goods_receipts = gr
    except Exception:
        pass

    # ── Related AP Bills (supplier bills) ─────────────────────────────────────
    ap_bills = []
    try:
        po_ids = [po["purchase_order_id"] for po in purchase_orders]
        po_numbers = [po.get("po_number") for po in purchase_orders if po.get("po_number")]

        if po_ids:
            # Match by source_purchase_order_id
            bills_by_id = (
                supabase.table("ap_bills")
                .select("bill_id, bill_number, po_number, bill_date, due_date, net_payable, payment_status, record_status, lifecycle_status")
                .in_("source_purchase_order_id", po_ids)
                .order("bill_id", desc=True)
                .execute()
                .data or []
            )
            ap_bills.extend(bills_by_id)

        if po_numbers:
            # Also match by po_number text field
            seen_ids = {b["bill_id"] for b in ap_bills}
            bills_by_po = (
                supabase.table("ap_bills")
                .select("bill_id, bill_number, po_number, bill_date, due_date, net_payable, payment_status, record_status, lifecycle_status")
                .in_("po_number", po_numbers)
                .order("bill_id", desc=True)
                .execute()
                .data or []
            )
            for b in bills_by_po:
                if b["bill_id"] not in seen_ids:
                    ap_bills.append(b)
                    seen_ids.add(b["bill_id"])
    except Exception:
        pass

    return {
        "quotations": quotations,
        "approvals": approvals,
        "sales_orders": sales_orders,
        "projects": projects,
        "ar_invoices": ar_invoices,
        "purchase_orders": purchase_orders,
        "goods_receipts": goods_receipts,
        "ap_bills": ap_bills,
        "tax_forms": _get_related_tax_forms(ar_invoices),
    }


def _get_related_tax_forms(ar_invoices: list, ap_bills: list = None) -> list:
    """Get BIR forms linked to any of the given AR invoices or AP bills."""
    try:
        form_ids = set()

        # Forms linked to AR invoices
        invoice_ids = [inv["invoice_id"] for inv in ar_invoices if inv.get("invoice_id")]
        if invoice_ids:
            links = (
                supabase.table("bir_form_invoices")
                .select("form_record_id")
                .in_("invoice_id", invoice_ids)
                .execute()
                .data or []
            )
            form_ids.update(l["form_record_id"] for l in links)

        # Forms linked to AP bills
        bill_ids = [b["bill_id"] for b in (ap_bills or []) if b.get("bill_id")]
        if bill_ids:
            bill_links = (
                supabase.table("bir_form_bills")
                .select("form_record_id")
                .in_("bill_id", bill_ids)
                .execute()
                .data or []
            )
            form_ids.update(l["form_record_id"] for l in bill_links)

        if not form_ids:
            return []

        forms = (
            supabase.table("bir_forms")
            .select("form_record_id, form_type, entity, period_from, period_to, status, payee_name, payee_tin, created_at")
            .in_("form_record_id", list(form_ids))
            .order("period_from", desc=True)
            .execute()
            .data or []
        )
        return forms
    except Exception:
        return []


# ── Document Status Explanations ──────────────────────────────────────────────

STAGE_ORDER = ["Prospecting", "Qualification", "Proposal", "Negotiation", "Approval", "Closed Won", "Closed Lost"]


@router.get("/{opportunity_id}/document-status")
def get_document_status(opportunity_id: int):
    """Return downstream document status for each module with explanations.

    For each document type (Sales Order, AR Invoice, Tax Forms, Purchase Orders,
    AP Bills), returns:
    - exists: whether the record exists
    - status: current status if it exists
    - reason: human-readable explanation of why it doesn't exist yet or what needs to happen next
    - action: what the user can do to progress
    """
    # Get the opportunity
    opp_rows = (
        supabase.table("opportunities")
        .select("*")
        .eq("opportunity_id", opportunity_id)
        .limit(1)
        .execute()
        .data or []
    )
    if not opp_rows:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    opp = opp_rows[0]

    stage = opp.get("stage") or "Prospecting"
    project_name = (opp.get("project_name") or "").strip()
    client_id = opp.get("client_id")

    # ── Gather related data ───────────────────────────────────────────────────
    # Quotations
    quotations = []
    try:
        q_by_id = (
            supabase.table("quotations")
            .select("quotation_id, quotation_no, status, company")
            .eq("opportunity_id", opportunity_id)
            .order("created_at", desc=True)
            .execute()
            .data or []
        )
        if not q_by_id and project_name:
            req = supabase.table("quotations").select(
                "quotation_id, quotation_no, status, company"
            ).ilike("project_name", project_name)
            if client_id:
                req = req.eq("client_id", client_id)
            q_by_id = req.order("created_at", desc=True).execute().data or []
        quotations = q_by_id
    except Exception:
        pass

    has_quotation = len(quotations) > 0
    latest_quotation = quotations[0] if quotations else None
    quotation_status = latest_quotation.get("status") if latest_quotation else None
    quotation_approved = quotation_status in (
        "APPROVED", "SENT", "COMPLETE", "ACCEPTED", "CONVERTED"
    )

    # Sales Orders
    sales_orders = []
    try:
        qtn_ids = [q["quotation_id"] for q in quotations]
        if qtn_ids:
            sales_orders = (
                supabase.table("sales_orders")
                .select("sales_order_id, so_number, status, order_type")
                .in_("quotation_id", qtn_ids)
                .order("sales_order_id", desc=True)
                .execute()
                .data or []
            )
    except Exception:
        pass

    has_sales_order = len(sales_orders) > 0
    latest_so = sales_orders[0] if sales_orders else None

    # AR Invoices
    ar_invoices = []
    try:
        qtn_ids = [q["quotation_id"] for q in quotations]
        seen_ids = set()

        # Match by source_quotation_id
        if qtn_ids:
            ar_by_qtn = (
                supabase.table("ar_invoices")
                .select("invoice_id, invoice_number, lifecycle_status, collection_status, record_status, wht_amount, received_2307_url")
                .in_("source_quotation_id", qtn_ids)
                .eq("record_status", "ACTIVE")
                .order("invoice_id", desc=True)
                .execute()
                .data or []
            )
            for inv in ar_by_qtn:
                seen_ids.add(inv["invoice_id"])
            ar_invoices.extend(ar_by_qtn)

        # Also match by sales_order_ref (SO number)
        so_numbers = [so.get("so_number") for so in sales_orders if so.get("so_number")]
        if so_numbers:
            ar_by_so = (
                supabase.table("ar_invoices")
                .select("invoice_id, invoice_number, lifecycle_status, collection_status, record_status, wht_amount, received_2307_url")
                .in_("sales_order_ref", so_numbers)
                .eq("record_status", "ACTIVE")
                .order("invoice_id", desc=True)
                .execute()
                .data or []
            )
            for inv in ar_by_so:
                if inv["invoice_id"] not in seen_ids:
                    ar_invoices.append(inv)
                    seen_ids.add(inv["invoice_id"])

        # Fallback: match by client_id + project_name if no invoices found yet
        if not ar_invoices and client_id:
            ar_by_client = (
                supabase.table("ar_invoices")
                .select("invoice_id, invoice_number, lifecycle_status, collection_status, record_status, wht_amount, received_2307_url")
                .eq("customer_id", client_id)
                .eq("record_status", "ACTIVE")
                .order("invoice_id", desc=True)
                .limit(10)
                .execute()
                .data or []
            )
            # If project_name is available, prefer invoices that reference it
            if project_name and ar_by_client:
                matched = [inv for inv in ar_by_client if project_name.lower() in (inv.get("invoice_number") or "").lower() or project_name.lower() in (inv.get("remarks") or "").lower()]
                if matched:
                    ar_by_client = matched
            for inv in ar_by_client:
                if inv["invoice_id"] not in seen_ids:
                    ar_invoices.append(inv)
                    seen_ids.add(inv["invoice_id"])
    except Exception:
        pass

    has_ar_invoice = len(ar_invoices) > 0
    latest_ar = ar_invoices[0] if ar_invoices else None
    ar_is_draft = latest_ar.get("lifecycle_status") == "DRAFT" if latest_ar else False
    ar_is_confirmed = latest_ar.get("lifecycle_status") == "CONFIRMED" if latest_ar else False
    ar_has_wht = float(latest_ar.get("wht_amount") or 0) > 0 if latest_ar else False
    ar_has_received_2307 = any(bool(inv.get("received_2307_url")) for inv in ar_invoices)

    # Tax Forms (from AR invoices)
    tax_forms = []
    try:
        invoice_ids = [inv["invoice_id"] for inv in ar_invoices]
        if invoice_ids:
            links = (
                supabase.table("bir_form_invoices")
                .select("form_record_id")
                .in_("invoice_id", invoice_ids)
                .execute()
                .data or []
            )
            form_ids = list({l["form_record_id"] for l in links})
            if form_ids:
                tax_forms = (
                    supabase.table("bir_forms")
                    .select("form_record_id, form_type, status")
                    .in_("form_record_id", form_ids)
                    .execute()
                    .data or []
                )
    except Exception:
        pass

    has_tax_forms = len(tax_forms) > 0

    # Purchase Orders (procurement for stock shortages)
    purchase_orders = []
    try:
        qtn_numbers = [q.get("quotation_no") for q in quotations if q.get("quotation_no")]
        if qtn_numbers:
            all_prs = supabase.table("purchase_requests").select("purchase_request_id, remarks").execute().data or []
            pr_ids = [
                pr["purchase_request_id"] for pr in all_prs
                if pr.get("remarks") and any(qn in pr["remarks"] for qn in qtn_numbers)
            ]
            if pr_ids:
                purchase_orders = (
                    supabase.table("purchase_orders")
                    .select("purchase_order_id, po_number, status")
                    .in_("purchase_request_id", pr_ids)
                    .order("purchase_order_id", desc=True)
                    .execute()
                    .data or []
                )
    except Exception:
        pass

    has_purchase_orders = len(purchase_orders) > 0

    # AP Bills (from POs)
    ap_bills = []
    try:
        po_numbers = [po.get("po_number") for po in purchase_orders if po.get("po_number")]
        if po_numbers:
            ap_bills = (
                supabase.table("ap_bills")
                .select("bill_id, bill_number, lifecycle_status, payment_status, record_status")
                .in_("po_number", po_numbers)
                .eq("record_status", "ACTIVE")
                .order("bill_id", desc=True)
                .execute()
                .data or []
            )
    except Exception:
        pass

    has_ap_bills = len(ap_bills) > 0



    # ── Build status explanations ─────────────────────────────────────────────

    # Quotation status
    quotation_doc = {
        "id": "quotation",
        "label": "Quotation",
        "exists": has_quotation,
        "status": quotation_status,
        "count": len(quotations),
    }
    if not has_quotation:
        quotation_doc["reason"] = "No quotation has been created for this deal yet."
        quotation_doc["action"] = "Create a quotation to define pricing and scope."
    elif quotation_status == "DRAFT":
        quotation_doc["reason"] = "Quotation is still in draft. It needs to be submitted for approval."
        quotation_doc["action"] = "Submit the quotation for internal approval."
    elif quotation_status == "FOR_APPROVAL":
        quotation_doc["reason"] = "Quotation is awaiting internal approval."
        quotation_doc["action"] = "An approver needs to review and approve it."
    elif quotation_status == "REJECTED":
        quotation_doc["reason"] = "Quotation was rejected. A revised version may be needed."
        quotation_doc["action"] = "Create a revision addressing the feedback."
    elif quotation_status == "APPROVED":
        quotation_doc["reason"] = "Quotation is approved. Ready to be sent to the client."
        quotation_doc["action"] = "Send the quotation to the client."
    elif quotation_status == "SENT":
        quotation_doc["reason"] = "Quotation has been sent to the client, awaiting response."
        quotation_doc["action"] = "Follow up with the client for acceptance."
    elif quotation_status in ("COMPLETE", "ACCEPTED", "CONVERTED"):
        quotation_doc["reason"] = "Quotation is complete and the sale is Closed Won."
        quotation_doc["action"] = None

    # Sales Order status
    so_doc = {
        "id": "sales_order",
        "label": "Sales Order",
        "exists": has_sales_order,
        "status": latest_so.get("status") if latest_so else None,
        "count": len(sales_orders),
    }
    if not has_sales_order:
        if stage in ("Closed Won",):
            so_doc["reason"] = "Sales order auto-creation failed — usually because no approved quotation is linked to this deal."
            so_doc["action"] = "Ensure a quotation exists and is approved/sent, then move the deal out and back to Closed Won."
        elif stage == "Closed Lost":
            so_doc["reason"] = "Deal was lost — no sales order was created."
            so_doc["action"] = None
        else:
            so_doc["reason"] = "Sales orders are created automatically when a deal moves to Closed Won."
            so_doc["action"] = f"Advance this deal to Closed Won (currently at {stage})."
    else:
        so_status = latest_so.get("status", "").upper()
        if so_status == "CANCELLED":
            so_doc["reason"] = "Sales order was cancelled (deal may have been reopened)."
            so_doc["action"] = "Close the deal as Won again to create a new sales order."
        elif so_status == "DELIVERED":
            so_doc["reason"] = "Sales order has been fulfilled and delivered."
            so_doc["action"] = None
        else:
            so_doc["reason"] = f"Sales order is active ({so_status.replace('_', ' ').title()})."
            so_doc["action"] = None

    # AR Invoice status
    ar_doc = {
        "id": "ar_invoice",
        "label": "AR Invoice",
        "exists": has_ar_invoice,
        "status": (latest_ar.get("lifecycle_status") + " / " + latest_ar.get("collection_status")) if latest_ar else None,
        "count": len(ar_invoices),
    }
    if not has_ar_invoice:
        if not has_sales_order:
            if stage == "Closed Won":
                ar_doc["reason"] = "No sales order was created — the automation may have failed because no approved quotation was linked."
                ar_doc["action"] = "Ensure a quotation is linked and approved, then move the deal out and back to Closed Won to re-trigger."
            else:
                ar_doc["reason"] = "AR invoices are automatically created when a deal moves to Closed Won."
                ar_doc["action"] = f"Advance this deal to Closed Won (currently at {stage}). The invoice will be auto-generated."
        elif stage == "Closed Won":
            ar_doc["reason"] = "Sales order exists but the AR invoice auto-creation failed. This can happen if the quotation had no line items."
            ar_doc["action"] = "Go to the Sales Order and click 'Generate Invoice', or create one manually in Accounts Receivable."
        else:
            ar_doc["reason"] = "AR invoices are automatically created when the deal closes as Won."
            ar_doc["action"] = f"Advance this deal to Closed Won (currently at {stage}). The invoice will be auto-generated."
    elif ar_is_draft:
        ar_doc["reason"] = "Invoice exists as a DRAFT — it needs to be reviewed and confirmed."
        ar_doc["action"] = "Go to Accounts Receivable and confirm the invoice to activate it for collection."
    elif ar_is_confirmed:
        collection = latest_ar.get("collection_status", "UNPAID")
        if collection == "UNPAID":
            ar_doc["reason"] = "Invoice is confirmed and awaiting payment from the client."
            ar_doc["action"] = "Record collections as the client pays."
        elif collection in ("PARTIALLY_PAID", "PARTIALLY_COLLECTED"):
            ar_doc["reason"] = "Partial payment has been received."
            ar_doc["action"] = "Continue collecting the remaining balance."
        elif collection in ("COLLECTED", "PAID", "FULLY_PAID"):
            ar_doc["reason"] = "Invoice has been fully collected."
            ar_doc["action"] = None
        else:
            ar_doc["reason"] = f"Invoice is confirmed ({collection})."
            ar_doc["action"] = None
    else:
        ar_doc["reason"] = f"Invoice is active."
        ar_doc["action"] = None

    # Tax Forms status (from AR)
    tax_doc = {
        "id": "tax_forms",
        "label": "Tax Forms (BIR 2307)",
        "exists": has_tax_forms,
        "status": tax_forms[0].get("status") if tax_forms else None,
        "count": len(tax_forms),
    }
    if not has_tax_forms:
        if ar_has_received_2307:
            tax_doc["exists"] = True
            tax_doc["status"] = "RECEIVED"
            tax_doc["reason"] = "Received BIR 2307 from client has been uploaded."
            tax_doc["action"] = None
        elif not has_ar_invoice:
            tax_doc["reason"] = "No AR invoice exists yet — tax forms are generated from confirmed invoices."
            tax_doc["action"] = "Tax forms (BIR 2307) will be auto-generated when the AR invoice is confirmed."
        elif ar_is_draft:
            tax_doc["reason"] = "The AR invoice is still a DRAFT. Tax forms are generated upon invoice confirmation."
            tax_doc["action"] = "Confirm the AR invoice in Accounts Receivable to trigger tax form generation."
        elif ar_is_confirmed and not ar_has_wht:
            tax_doc["reason"] = "The invoice has no withholding tax (WHT) applied — BIR 2307 is only needed when clients withhold tax."
            tax_doc["action"] = None
            tax_doc["not_required"] = True
        elif ar_is_confirmed:
            tax_doc["reason"] = "Invoice is confirmed but tax form generation may have failed."
            tax_doc["action"] = "Check Tax Management module or manually generate the form."
        else:
            tax_doc["reason"] = "Tax forms are generated when AR invoices with WHT are confirmed."
            tax_doc["action"] = "Confirm the AR invoice to trigger automatic generation."
    else:
        statuses = [tf.get("status", "DRAFT") for tf in tax_forms]
        if all(s in ("FILED", "SUBMITTED", "COMPLETED") for s in statuses):
            tax_doc["reason"] = "All tax forms have been filed."
            tax_doc["action"] = None
        elif any(s == "DRAFT" for s in statuses):
            tax_doc["reason"] = "Tax form(s) exist as DRAFT — they need to be submitted and filed."
            tax_doc["action"] = "Review and submit the tax forms for filing."
        else:
            tax_doc["reason"] = f"Tax forms are in progress ({', '.join(set(statuses))})."
            tax_doc["action"] = "Complete the filing process."

    # Purchase Orders status (procurement)
    po_doc = {
        "id": "purchase_orders",
        "label": "Purchase Orders",
        "exists": has_purchase_orders,
        "status": purchase_orders[0].get("status") if purchase_orders else None,
        "count": len(purchase_orders),
    }
    if not has_purchase_orders:
        if not has_quotation:
            po_doc["reason"] = "No quotation exists — purchase orders are created when stock shortages are identified."
            po_doc["action"] = "Create a quotation first. If items are out of stock, a purchase request can be raised."
        else:
            po_doc["reason"] = "No stock shortages were identified, or all items are available in inventory."
            po_doc["action"] = None
            po_doc["not_required"] = True
    else:
        received_count = sum(1 for po in purchase_orders if (po.get("status") or "").upper() in ("RECEIVED", "PARTIALLY_RECEIVED"))
        if received_count == len(purchase_orders):
            po_doc["reason"] = "All purchase orders have been received."
            po_doc["action"] = None
        else:
            po_doc["reason"] = f"{received_count}/{len(purchase_orders)} POs received."
            po_doc["action"] = "Awaiting supplier delivery for remaining orders."

    # AP Bills status (supplier bills)
    ap_doc = {
        "id": "ap_bills",
        "label": "AP Bills (Supplier)",
        "exists": has_ap_bills,
        "status": ap_bills[0].get("payment_status") if ap_bills else None,
        "count": len(ap_bills),
    }
    if not has_ap_bills:
        if not has_purchase_orders:
            ap_doc["reason"] = "No purchase orders exist — AP bills are created from received supplier goods."
            ap_doc["action"] = None
            ap_doc["not_required"] = True if not has_purchase_orders or (po_doc.get("not_required")) else None
        else:
            received_pos = [po for po in purchase_orders if (po.get("status") or "").upper() in ("RECEIVED", "PARTIALLY_RECEIVED")]
            if not received_pos:
                ap_doc["reason"] = "Purchase orders have not been received yet — AP bills are created after goods receipt."
                ap_doc["action"] = "Wait for the supplier to deliver goods, then record the goods receipt."
            else:
                ap_doc["reason"] = "Goods have been received but no supplier bill has been recorded yet."
                ap_doc["action"] = "Create a draft bill from the received purchase order in Accounts Payable."
    else:
        draft_bills = [b for b in ap_bills if b.get("lifecycle_status") == "DRAFT"]
        confirmed_bills = [b for b in ap_bills if b.get("lifecycle_status") == "CONFIRMED"]
        paid_bills = [b for b in ap_bills if (b.get("payment_status") or "").upper() == "PAID"]
        if draft_bills and not confirmed_bills:
            ap_doc["reason"] = "Supplier bill(s) exist as DRAFT — they need to be confirmed."
            ap_doc["action"] = "Review and confirm the AP bill to commit it as a payable."
        elif paid_bills and len(paid_bills) == len(ap_bills):
            ap_doc["reason"] = "All supplier bills have been paid."
            ap_doc["action"] = None
        else:
            unpaid = len(ap_bills) - len(paid_bills)
            ap_doc["reason"] = f"{unpaid} bill(s) pending payment."
            ap_doc["action"] = "Create payment vouchers and process payments."

    # Project status
    projects = []
    try:
        if project_name:
            projects = (
                supabase.table("projects")
                .select("project_id, project_code, status")
                .ilike("project_name", project_name)
                .order("project_id", desc=True)
                .limit(3)
                .execute()
                .data or []
            )
    except Exception:
        pass

    project_doc = {
        "id": "project",
        "label": "Project",
        "exists": len(projects) > 0,
        "status": projects[0].get("status") if projects else None,
        "count": len(projects),
    }
    # Determine if project is needed based on order type
    so_order_type = latest_so.get("order_type", "DIRECT") if latest_so else None
    project_needed = so_order_type in ("MTO", "SERVICE", "MIXED") if so_order_type else True

    if not projects:
        if not project_needed:
            project_doc["reason"] = "Not required for direct goods sales — fulfillment tracked via Sales Order and Delivery."
            project_doc["action"] = None
            project_doc["not_required"] = True
        elif stage in ("Closed Won",):
            project_doc["reason"] = "Project creation may have failed during automation."
            project_doc["action"] = "Manually create a project from the sales order."
        else:
            project_doc["reason"] = "Projects are created for service/MTO deals when moved to Closed Won."
            project_doc["action"] = f"Advance this deal to Closed Won (currently at {stage})." if project_needed else None
    else:
        p_status = (projects[0].get("status") or "").upper()
        if p_status == "CANCELLED":
            project_doc["reason"] = "Project was cancelled (deal may have been reopened)."
            project_doc["action"] = "Close the deal as Won again to create a new project."
        elif p_status in ("COMPLETED", "CLOSED"):
            project_doc["reason"] = "Project has been completed."
            project_doc["action"] = None
        else:
            project_doc["reason"] = f"Project is active ({p_status.replace('_', ' ').title()})."
            project_doc["action"] = None

    return {
        "opportunity_id": opportunity_id,
        "stage": stage,
        "documents": [
            quotation_doc,
            so_doc,
            ar_doc,
            tax_doc,
            po_doc,
            ap_doc,
            project_doc,
        ],
    }
