"""Shared client-contact ownership and quotation snapshot helpers."""

from typing import Optional

from fastapi import HTTPException

from database import supabase


def contact_name(contact: dict) -> str:
    return " ".join(
        part.strip()
        for part in (contact.get("first_name") or "", contact.get("last_name") or "")
        if part and part.strip()
    )


def require_client(client_id: int) -> dict:
    client = (
        supabase.table("client_list")
        .select("client_id, company_name")
        .eq("client_id", client_id)
        .limit(1)
        .execute()
    )
    if not client.data:
        raise HTTPException(status_code=422, detail="Selected client does not exist.")
    return client.data[0]


def require_client_contact(client_id: Optional[int], contact_id: Optional[int]) -> Optional[dict]:
    """Return a contact only when it belongs to the selected client."""
    if contact_id is None:
        return None
    if client_id is None:
        raise HTTPException(status_code=422, detail="Select a client before selecting a contact person.")

    contact = (
        supabase.table("contact_list")
        .select("contact_id, client_id, first_name, last_name, job_title, email, landline")
        .eq("contact_id", contact_id)
        .eq("client_id", client_id)
        .limit(1)
        .execute()
    )
    if not contact.data:
        raise HTTPException(
            status_code=422,
            detail="Selected contact person does not belong to the selected client.",
        )
    return contact.data[0]


def quotation_contact_snapshot(client_id: int, contact_id: Optional[int]) -> dict:
    """Return immutable contact fields to persist on a quotation."""
    if contact_id is None:
        return {
            "contact_id": None,
            "contact_name_snapshot": None,
            "contact_job_title_snapshot": None,
            "contact_email_snapshot": None,
            "contact_phone_snapshot": None,
        }

    contact = require_client_contact(client_id, contact_id)
    return {
        "contact_id": contact_id,
        "contact_name_snapshot": contact_name(contact) or None,
        "contact_job_title_snapshot": contact.get("job_title") or None,
        "contact_email_snapshot": contact.get("email") or None,
        "contact_phone_snapshot": contact.get("landline") or None,
    }


def primary_contact_details(contacts: list[dict]) -> dict:
    """Return a display-safe primary contact projection for read models."""
    if not contacts:
        return {"primary_contact_name": None, "primary_contact_email": None}
    contact = next((row for row in contacts if row.get("is_primary_contact")), contacts[0])
    return {
        "primary_contact_name": contact_name(contact) or None,
        "primary_contact_email": contact.get("email") or None,
    }
