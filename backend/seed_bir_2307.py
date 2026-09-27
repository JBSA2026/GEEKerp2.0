"""Seed BIR Form 2307 mock data with realistic Philippine tax data.

Run: cd backend && uv run python seed_bir_2307.py
"""

import sys
sys.path.insert(0, ".")

from database import supabase
from datetime import datetime


def seed_2307_forms():
    """Insert mock BIR 2307 forms for demonstration."""

    # ── Helper: build empty table rows ─────────────────────────────────────────
    def empty_row():
        return {"nature": "", "atc": "", "month1": "", "month2": "", "month3": "", "total": "", "tax_withheld": ""}

    def pad_table(rows, count=11):
        while len(rows) < count:
            rows.append(empty_row())
        return rows[:count]

    # ── Mock 2307 Forms ────────────────────────────────────────────────────────
    forms = [
        # 1. Expedia — Q2 2026 — ACME Corp (service fees)
        {
            "form_type": "2307",
            "form_code": "EXP-2026-BIR2307-0001",
            "entity": "Expedia",
            "customer_id": None,
            "period_from": "2026-04-01",
            "period_to": "2026-06-30",
            "status": "FINALIZED",
            "finalized_at": "2026-07-08T10:00:00",
            "payee_tin": "006-789-012-000",
            "payee_name": "Expedia Solutions Specialist Inc.",
            "payee_address": "Unit 2401 Jollibee Plaza, Ortigas Center, Pasig City",
            "payee_zip_code": "1605",
            "payor_tin": "123-456-789-000",
            "payor_name": "ACME Corporation Philippines",
            "payor_address": "12F Tower One, Ayala Triangle, Makati City",
            "payor_zip_code": "1226",
            "payor_signatory_name": "Maria Santos",
            "payor_signatory_title_tin": "Chief Financial Officer / 123-456-789-000",
            "payee_signatory_name": "James Reyes",
            "payee_signatory_title_tin": "General Manager / 006-789-012-000",
            "form_data": {
                "period_from": "2026-04-01",
                "period_to": "2026-06-30",
                "payor_tin": ["123", "456", "789", "000"],
                "payor_name": "ACME Corporation Philippines",
                "payor_address": "12F Tower One, Ayala Triangle, Makati City",
                "payor_zip_code": "1226",
                "payee_tin": ["006", "789", "012", "000"],
                "payee_name": "Expedia Solutions Specialist Inc.",
                "payee_address": "Unit 2401 Jollibee Plaza, Ortigas Center, Pasig City",
                "payee_zip_code": "1605",
                "payee_foreign_address": "",
                "payor_signatory_name": "Maria Santos",
                "payor_signatory_title_tin": "CFO / 123-456-789-000",
                "payor_agent_accreditation_no": "",
                "payor_date_of_issue": "",
                "payor_date_of_expiry": "",
                "payee_signatory_name": "James Reyes",
                "payee_signatory_title_tin": "General Manager / 006-789-012-000",
                "payee_agent_accreditation_no": "",
                "payee_date_of_issue": "",
                "payee_date_of_expiry": "",
                "table_a": pad_table([
                    {
                        "nature": "Professional/Service fees (2%)",
                        "atc": "WC010",
                        "month1": "250000.00",
                        "month2": "180000.00",
                        "month3": "320000.00",
                        "total": "750000.00",
                        "tax_withheld": "15000.00",
                    },
                    {
                        "nature": "Material purchases (1%)",
                        "atc": "WC158",
                        "month1": "85000.00",
                        "month2": "",
                        "month3": "120000.00",
                        "total": "205000.00",
                        "tax_withheld": "2050.00",
                    },
                ]),
                "table_b": pad_table([]),
            },
        },

        # 2. Expedia — Q2 2026 — Globe Telecom (service fees - DRAFT)
        {
            "form_type": "2307",
            "form_code": "EXP-2026-BIR2307-0002",
            "entity": "Expedia",
            "customer_id": None,
            "period_from": "2026-04-01",
            "period_to": "2026-06-30",
            "status": "DRAFT",
            "payee_tin": "006-789-012-000",
            "payee_name": "Expedia Solutions Specialist Inc.",
            "payee_address": "Unit 2401 Jollibee Plaza, Ortigas Center, Pasig City",
            "payee_zip_code": "1605",
            "payor_tin": "000-477-000-000",
            "payor_name": "Globe Telecom Inc.",
            "payor_address": "Globe Tower, 32nd Street cor. 7th Avenue, BGC, Taguig City",
            "payor_zip_code": "1634",
            "payor_signatory_name": "",
            "payor_signatory_title_tin": "",
            "payee_signatory_name": "James Reyes",
            "payee_signatory_title_tin": "General Manager / 006-789-012-000",
            "form_data": {
                "period_from": "2026-04-01",
                "period_to": "2026-06-30",
                "payor_tin": ["000", "477", "000", "000"],
                "payor_name": "Globe Telecom Inc.",
                "payor_address": "Globe Tower, 32nd Street cor. 7th Avenue, BGC, Taguig City",
                "payor_zip_code": "1634",
                "payee_tin": ["006", "789", "012", "000"],
                "payee_name": "Expedia Solutions Specialist Inc.",
                "payee_address": "Unit 2401 Jollibee Plaza, Ortigas Center, Pasig City",
                "payee_zip_code": "1605",
                "payee_foreign_address": "",
                "payor_signatory_name": "",
                "payor_signatory_title_tin": "",
                "payor_agent_accreditation_no": "",
                "payor_date_of_issue": "",
                "payor_date_of_expiry": "",
                "payee_signatory_name": "James Reyes",
                "payee_signatory_title_tin": "General Manager / 006-789-012-000",
                "payee_agent_accreditation_no": "",
                "payee_date_of_issue": "",
                "payee_date_of_expiry": "",
                "table_a": pad_table([
                    {
                        "nature": "Professional/Service fees (2%)",
                        "atc": "WC010",
                        "month1": "450000.00",
                        "month2": "450000.00",
                        "month3": "500000.00",
                        "total": "1400000.00",
                        "tax_withheld": "28000.00",
                    },
                ]),
                "table_b": pad_table([]),
            },
        },

        # 3. GreatnessLab — Q2 2026 — SM Investments (material + service)
        {
            "form_type": "2307",
            "form_code": "GLB-2026-BIR2307-0001",
            "entity": "GreatnessLab",
            "customer_id": None,
            "period_from": "2026-04-01",
            "period_to": "2026-06-30",
            "status": "PENDING_APPROVAL",
            "payee_tin": "008-123-456-000",
            "payee_name": "GreatnessLab Inc.",
            "payee_address": "3F Greatness Building, Quezon Avenue, Quezon City",
            "payee_zip_code": "1103",
            "payor_tin": "000-160-006-000",
            "payor_name": "SM Investments Corporation",
            "payor_address": "10F SM Corporate Offices, Building F, Bay City, Pasay",
            "payor_zip_code": "1300",
            "payor_signatory_name": "Roberto Tan",
            "payor_signatory_title_tin": "VP Finance / 000-160-006-000",
            "payee_signatory_name": "Patricia Lim",
            "payee_signatory_title_tin": "CEO / 008-123-456-000",
            "form_data": {
                "period_from": "2026-04-01",
                "period_to": "2026-06-30",
                "payor_tin": ["000", "160", "006", "000"],
                "payor_name": "SM Investments Corporation",
                "payor_address": "10F SM Corporate Offices, Building F, Bay City, Pasay",
                "payor_zip_code": "1300",
                "payee_tin": ["008", "123", "456", "000"],
                "payee_name": "GreatnessLab Inc.",
                "payee_address": "3F Greatness Building, Quezon Avenue, Quezon City",
                "payee_zip_code": "1103",
                "payee_foreign_address": "",
                "payor_signatory_name": "Roberto Tan",
                "payor_signatory_title_tin": "VP Finance / 000-160-006-000",
                "payor_agent_accreditation_no": "",
                "payor_date_of_issue": "",
                "payor_date_of_expiry": "",
                "payee_signatory_name": "Patricia Lim",
                "payee_signatory_title_tin": "CEO / 008-123-456-000",
                "payee_agent_accreditation_no": "",
                "payee_date_of_issue": "",
                "payee_date_of_expiry": "",
                "table_a": pad_table([
                    {
                        "nature": "Material purchases (1%)",
                        "atc": "WC158",
                        "month1": "650000.00",
                        "month2": "480000.00",
                        "month3": "720000.00",
                        "total": "1850000.00",
                        "tax_withheld": "18500.00",
                    },
                    {
                        "nature": "Professional/Service fees (2%)",
                        "atc": "WC010",
                        "month1": "150000.00",
                        "month2": "200000.00",
                        "month3": "175000.00",
                        "total": "525000.00",
                        "tax_withheld": "10500.00",
                    },
                ]),
                "table_b": pad_table([]),
            },
        },

        # 4. KSI — Q1 2026 — Ayala Land (FINALIZED)
        {
            "form_type": "2307",
            "form_code": "KSI-2026-BIR2307-0001",
            "entity": "KSI",
            "customer_id": None,
            "period_from": "2026-01-01",
            "period_to": "2026-03-31",
            "status": "FINALIZED",
            "finalized_at": "2026-04-12T14:30:00",
            "payee_tin": "009-876-543-000",
            "payee_name": "Kyrios Solutions Inc.",
            "payee_address": "Unit 501 KSI Tower, Alabang, Muntinlupa City",
            "payee_zip_code": "1781",
            "payor_tin": "000-106-223-000",
            "payor_name": "Ayala Land Inc.",
            "payor_address": "31F Tower One, Ayala Triangle, Makati City",
            "payor_zip_code": "1226",
            "payor_signatory_name": "Elena Cruz",
            "payor_signatory_title_tin": "Assistant VP / 000-106-223-000",
            "payee_signatory_name": "Marco Villanueva",
            "payee_signatory_title_tin": "President / 009-876-543-000",
            "form_data": {
                "period_from": "2026-01-01",
                "period_to": "2026-03-31",
                "payor_tin": ["000", "106", "223", "000"],
                "payor_name": "Ayala Land Inc.",
                "payor_address": "31F Tower One, Ayala Triangle, Makati City",
                "payor_zip_code": "1226",
                "payee_tin": ["009", "876", "543", "000"],
                "payee_name": "Kyrios Solutions Inc.",
                "payee_address": "Unit 501 KSI Tower, Alabang, Muntinlupa City",
                "payee_zip_code": "1781",
                "payee_foreign_address": "",
                "payor_signatory_name": "Elena Cruz",
                "payor_signatory_title_tin": "Asst VP / 000-106-223-000",
                "payor_agent_accreditation_no": "",
                "payor_date_of_issue": "",
                "payor_date_of_expiry": "",
                "payee_signatory_name": "Marco Villanueva",
                "payee_signatory_title_tin": "President / 009-876-543-000",
                "payee_agent_accreditation_no": "",
                "payee_date_of_issue": "",
                "payee_date_of_expiry": "",
                "table_a": pad_table([
                    {
                        "nature": "Professional/Service fees (2%)",
                        "atc": "WC010",
                        "month1": "380000.00",
                        "month2": "420000.00",
                        "month3": "395000.00",
                        "total": "1195000.00",
                        "tax_withheld": "23900.00",
                    },
                ]),
                "table_b": pad_table([]),
            },
        },

        # 5. Exigent — Q2 2026 — BDO Unibank (service fees - DRAFT)
        {
            "form_type": "2307",
            "form_code": "EXG-2026-BIR2307-0001",
            "entity": "Exigent",
            "customer_id": None,
            "period_from": "2026-04-01",
            "period_to": "2026-06-30",
            "status": "DRAFT",
            "payee_tin": "007-654-321-000",
            "payee_name": "Exigent Corporation",
            "payee_address": "15F Pacific Star Building, Makati Avenue, Makati City",
            "payee_zip_code": "1209",
            "payor_tin": "000-520-041-000",
            "payor_name": "BDO Unibank Inc.",
            "payor_address": "BDO Corporate Center, Ortigas, Mandaluyong City",
            "payor_zip_code": "1550",
            "payor_signatory_name": "",
            "payor_signatory_title_tin": "",
            "payee_signatory_name": "Ricardo Fernandez",
            "payee_signatory_title_tin": "Managing Director / 007-654-321-000",
            "form_data": {
                "period_from": "2026-04-01",
                "period_to": "2026-06-30",
                "payor_tin": ["000", "520", "041", "000"],
                "payor_name": "BDO Unibank Inc.",
                "payor_address": "BDO Corporate Center, Ortigas, Mandaluyong City",
                "payor_zip_code": "1550",
                "payee_tin": ["007", "654", "321", "000"],
                "payee_name": "Exigent Corporation",
                "payee_address": "15F Pacific Star Building, Makati Avenue, Makati City",
                "payee_zip_code": "1209",
                "payee_foreign_address": "",
                "payor_signatory_name": "",
                "payor_signatory_title_tin": "",
                "payor_agent_accreditation_no": "",
                "payor_date_of_issue": "",
                "payor_date_of_expiry": "",
                "payee_signatory_name": "Ricardo Fernandez",
                "payee_signatory_title_tin": "Managing Director / 007-654-321-000",
                "payee_agent_accreditation_no": "",
                "payee_date_of_issue": "",
                "payee_date_of_expiry": "",
                "table_a": pad_table([
                    {
                        "nature": "Professional/Service fees (2%)",
                        "atc": "WC010",
                        "month1": "190000.00",
                        "month2": "210000.00",
                        "month3": "185000.00",
                        "total": "585000.00",
                        "tax_withheld": "11700.00",
                    },
                    {
                        "nature": "Material purchases (1%)",
                        "atc": "WC158",
                        "month1": "95000.00",
                        "month2": "110000.00",
                        "month3": "88000.00",
                        "total": "293000.00",
                        "tax_withheld": "2930.00",
                    },
                ]),
                "table_b": pad_table([]),
            },
        },

        # 6. Expedia — Q1 2026 — Meralco (material - FINALIZED)
        {
            "form_type": "2307",
            "form_code": "EXP-2026-BIR2307-0003",
            "entity": "Expedia",
            "customer_id": None,
            "period_from": "2026-01-01",
            "period_to": "2026-03-31",
            "status": "FINALIZED",
            "finalized_at": "2026-04-10T09:00:00",
            "payee_tin": "006-789-012-000",
            "payee_name": "Expedia Solutions Specialist Inc.",
            "payee_address": "Unit 2401 Jollibee Plaza, Ortigas Center, Pasig City",
            "payee_zip_code": "1605",
            "payor_tin": "000-188-146-000",
            "payor_name": "Manila Electric Company (MERALCO)",
            "payor_address": "Lopez Building, Meralco Center, Ortigas, Pasig City",
            "payor_zip_code": "1600",
            "payor_signatory_name": "Atty. Ramon Lopez",
            "payor_signatory_title_tin": "VP Procurement / 000-188-146-000",
            "payee_signatory_name": "James Reyes",
            "payee_signatory_title_tin": "General Manager / 006-789-012-000",
            "form_data": {
                "period_from": "2026-01-01",
                "period_to": "2026-03-31",
                "payor_tin": ["000", "188", "146", "000"],
                "payor_name": "Manila Electric Company (MERALCO)",
                "payor_address": "Lopez Building, Meralco Center, Ortigas, Pasig City",
                "payor_zip_code": "1600",
                "payee_tin": ["006", "789", "012", "000"],
                "payee_name": "Expedia Solutions Specialist Inc.",
                "payee_address": "Unit 2401 Jollibee Plaza, Ortigas Center, Pasig City",
                "payee_zip_code": "1605",
                "payee_foreign_address": "",
                "payor_signatory_name": "Atty. Ramon Lopez",
                "payor_signatory_title_tin": "VP Procurement / 000-188-146-000",
                "payor_agent_accreditation_no": "",
                "payor_date_of_issue": "",
                "payor_date_of_expiry": "",
                "payee_signatory_name": "James Reyes",
                "payee_signatory_title_tin": "General Manager / 006-789-012-000",
                "payee_agent_accreditation_no": "",
                "payee_date_of_issue": "",
                "payee_date_of_expiry": "",
                "table_a": pad_table([
                    {
                        "nature": "Material purchases (1%)",
                        "atc": "WC158",
                        "month1": "1200000.00",
                        "month2": "980000.00",
                        "month3": "1450000.00",
                        "total": "3630000.00",
                        "tax_withheld": "36300.00",
                    },
                ]),
                "table_b": pad_table([]),
            },
        },
    ]

    # ── Insert forms ───────────────────────────────────────────────────────────
    inserted = 0
    for form in forms:
        # Check if form_code already exists
        existing = (
            supabase.table("bir_forms")
            .select("form_record_id")
            .eq("form_code", form["form_code"])
            .execute()
            .data
        )
        if existing:
            print(f"  [skip] {form['form_code']} (already exists)")
            continue

        res = supabase.table("bir_forms").insert(form).execute()
        if res.data:
            fid = res.data[0]["form_record_id"]
            print(f"  [ok] Created {form['form_code']} -> ID {fid}")

            # Add history entry
            supabase.table("bir_form_history").insert({
                "form_record_id": fid,
                "action": "SEEDED",
                "details": f"Mock data seeded for demonstration ({form['status']})",
                "performed_by": "System (seed script)",
            }).execute()

            inserted += 1
        else:
            print(f"  [fail] Failed to insert {form['form_code']}")

    return inserted


if __name__ == "__main__":
    print("\n=== Seeding BIR Form 2307 Mock Data ===\n")
    count = seed_2307_forms()
    print(f"\nDone! Inserted {count} BIR 2307 form(s).\n")
