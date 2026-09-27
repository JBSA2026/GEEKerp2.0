"""Shared, framework-free calculation utilities for financial reporting.

Extracted from the inline logic that used to live in `routers/general_ledger.py`
(trial balance, income statement, balance sheet) and `routers/commission.py`
(commission computation), following the same pure-function extraction pattern
already established by `routers/ar_ap_calc.py` for AR/AP calculations.

Every function here is a pure function of its inputs — no Supabase calls, no
FastAPI dependencies. Both the originating Source_Module router (General
Ledger, Commission Management) and the Reports Module aggregator
(`routers/reports.py`) call these exact functions, so a given figure is
computed identically everywhere and can never drift out of sync between
modules.

All monetary results are rounded to two decimal places to match the
``numeric(14,2)`` columns used for persistence.
"""
from typing import Optional


# ---------------------------------------------------------------------------
# General Ledger — Trial Balance / Income Statement / Balance Sheet
# ---------------------------------------------------------------------------

def compute_trial_balance(lines: list, accounts: dict) -> dict:
    """Aggregate posted journal lines into a trial balance.

    Args:
        lines: A list of journal line dicts, each with ``account_id``,
            ``debit``, and ``credit`` keys (already filtered to posted
            entries matching the desired entity/date scope by the caller).
        accounts: A mapping of ``account_id`` -> account dict (with
            ``account_code``, ``account_name``, ``account_type``), as
            returned by the Chart of Accounts.

    Returns:
        A dict with ``rows`` (one per account with a debit/credit/balance),
        ``total_debit``, ``total_credit``, and ``is_balanced``.
    """
    balances: dict = {}
    for ln in lines:
        aid = ln["account_id"]
        if aid not in balances:
            balances[aid] = {"debit": 0.0, "credit": 0.0}
        balances[aid]["debit"] += float(ln.get("debit") or 0)
        balances[aid]["credit"] += float(ln.get("credit") or 0)

    rows = []
    total_debit = 0.0
    total_credit = 0.0
    for aid, bal in sorted(balances.items(), key=lambda x: accounts.get(x[0], {}).get("account_code", "")):
        a = accounts.get(aid, {})
        rows.append({
            "account_id": aid,
            "account_code": a.get("account_code"),
            "account_name": a.get("account_name"),
            "account_type": a.get("account_type"),
            "debit": round(bal["debit"], 2),
            "credit": round(bal["credit"], 2),
            "balance": round(bal["debit"] - bal["credit"], 2),
        })
        total_debit += bal["debit"]
        total_credit += bal["credit"]
    return {
        "rows": rows,
        "total_debit": round(total_debit, 2),
        "total_credit": round(total_credit, 2),
        "is_balanced": round(total_debit, 2) == round(total_credit, 2),
    }


def compute_income_statement(lines: list, accounts: dict) -> dict:
    """Aggregate posted journal lines into a revenue/expense income statement.

    Args:
        lines: A list of journal line dicts (posted, scoped by the caller).
        accounts: A mapping of ``account_id`` -> account dict.

    Returns:
        A dict with ``revenue`` and ``expenses`` (lists of per-account
        amounts), ``total_revenue``, ``total_expenses``, and ``net_income``.
    """
    revenue_accounts: list = []
    expense_accounts: list = []
    for ln in lines:
        aid = ln["account_id"]
        a = accounts.get(aid, {})
        at = a.get("account_type")
        if at not in ("Revenue", "Expense"):
            continue
        net = (
            float(ln.get("credit") or 0) - float(ln.get("debit") or 0)
            if at == "Revenue"
            else float(ln.get("debit") or 0) - float(ln.get("credit") or 0)
        )
        target = revenue_accounts if at == "Revenue" else expense_accounts
        found = next((r for r in target if r["account_id"] == aid), None)
        if found:
            found["amount"] += net
        else:
            target.append({
                "account_id": aid,
                "account_code": a.get("account_code"),
                "account_name": a.get("account_name"),
                "amount": net,
            })

    for r in revenue_accounts:
        r["amount"] = round(r["amount"], 2)
    for r in expense_accounts:
        r["amount"] = round(r["amount"], 2)

    total_revenue = round(sum(r["amount"] for r in revenue_accounts), 2)
    total_expense = round(sum(r["amount"] for r in expense_accounts), 2)
    net_income = round(total_revenue - total_expense, 2)
    return {
        "revenue": revenue_accounts,
        "expenses": expense_accounts,
        "total_revenue": total_revenue,
        "total_expenses": total_expense,
        "net_income": net_income,
    }


def compute_balance_sheet(lines: list, accounts: dict) -> dict:
    """Aggregate posted journal lines (as of a cutoff) into a balance sheet.

    Args:
        lines: A list of journal line dicts (posted, scoped by the caller
            up to the desired as-of date).
        accounts: A mapping of ``account_id`` -> account dict.

    Returns:
        A dict with ``assets``, ``liabilities``, ``equity`` (lists of
        per-account balances), their totals, and ``is_balanced``.
    """
    balances: dict = {}
    for ln in lines:
        aid = ln["account_id"]
        if aid not in balances:
            balances[aid] = 0.0
        balances[aid] += float(ln.get("debit") or 0) - float(ln.get("credit") or 0)

    assets: list = []
    liabilities: list = []
    equity: list = []
    for aid, bal in sorted(balances.items(), key=lambda x: accounts.get(x[0], {}).get("account_code", "")):
        a = accounts.get(aid, {})
        at = a.get("account_type")
        row = {
            "account_id": aid,
            "account_code": a.get("account_code"),
            "account_name": a.get("account_name"),
            "balance": round(bal, 2),
        }
        if at == "Asset":
            assets.append(row)
        elif at == "Liability":
            row["balance"] = round(-bal, 2)  # Liabilities have credit normal balance
            liabilities.append(row)
        elif at == "Equity":
            row["balance"] = round(-bal, 2)
            equity.append(row)

    total_assets = round(sum(r["balance"] for r in assets), 2)
    total_liabilities = round(sum(r["balance"] for r in liabilities), 2)
    total_equity = round(sum(r["balance"] for r in equity), 2)
    return {
        "assets": assets,
        "liabilities": liabilities,
        "equity": equity,
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "total_equity": total_equity,
        "is_balanced": total_assets == round(total_liabilities + total_equity, 2),
    }


# ---------------------------------------------------------------------------
# Commission Management — Sales / Agent commission computation
# ---------------------------------------------------------------------------

WHT_RATE_DEFAULT = 10.00  # 10% withholding tax on commissions


def compute_commission(
    commission_type: str,
    contract_value: float,
    total_cost: float,
    collected_amount: float,
    commission_rate: float,
    outstanding_advances: float,
    commission_base_override: Optional[float] = None,
    wht_rate: float = WHT_RATE_DEFAULT,
) -> dict:
    """Compute Sales or Agent commission figures.

    Sales Commission:
      gross_profit = contract_value - total_cost
      gross_margin_pct = (gross_profit / contract_value) * 100
      collected_gross_profit = (collected_amount / contract_value) * gross_profit
      commission_amount = collected_gross_profit x (commission_rate / 100)

    Agent Commission:
      commission_base = commission_base_override or collected_amount
      commission_amount = commission_base x (commission_rate / 100)

    For both:
      withholding_tax = commission_amount x (wht_rate / 100)
      cash_advance_recovery = min(outstanding_advances, commission_amount - WHT)
      net_payable = commission_amount - withholding_tax - cash_advance_recovery

    Args:
        commission_type: ``"Sales"`` or ``"Agent"``.
        contract_value: The project's total contract value.
        total_cost: The project's total cost.
        collected_amount: The amount collected against the contract.
        commission_rate: The commission percentage rate.
        outstanding_advances: The employee's outstanding cash advance balance.
        commission_base_override: Optional override for the Agent commission base.
        wht_rate: The withholding tax percentage rate (defaults to 10%).

    Returns:
        A dict of the computed commission figures, all rounded to 2 decimals.
    """
    contract_value = round(contract_value, 2)
    total_cost = round(total_cost, 2)
    collected_amount = round(collected_amount, 2)
    rate = round(commission_rate, 2)

    gross_profit = round(contract_value - total_cost, 2)
    gross_margin_pct = round((gross_profit / contract_value * 100) if contract_value > 0 else 0, 2)

    if commission_type == "Sales":
        if contract_value > 0:
            collected_gross_profit = round((collected_amount / contract_value) * gross_profit, 2)
        else:
            collected_gross_profit = 0.0
        commission_base = collected_gross_profit
        commission_amount = round(collected_gross_profit * (rate / 100), 2)
    else:
        commission_base = round(commission_base_override if commission_base_override else collected_amount, 2)
        collected_gross_profit = round((collected_amount / contract_value) * gross_profit, 2) if contract_value > 0 else 0.0
        commission_amount = round(commission_base * (rate / 100), 2)

    withholding_tax = round(commission_amount * (wht_rate / 100), 2)

    max_recoverable = max(commission_amount - withholding_tax, 0)
    cash_advance_recovery = round(min(outstanding_advances, max_recoverable), 2)

    net_payable = round(commission_amount - withholding_tax - cash_advance_recovery, 2)

    return {
        "contract_value": contract_value,
        "total_cost": total_cost,
        "gross_profit": gross_profit,
        "gross_margin_pct": gross_margin_pct,
        "collected_amount": collected_amount,
        "collected_gross_profit": collected_gross_profit,
        "commission_base": commission_base,
        "commission_rate": rate,
        "commission_amount": commission_amount,
        "withholding_tax_rate": wht_rate,
        "withholding_tax": withholding_tax,
        "cash_advance_recovery": cash_advance_recovery,
        "net_payable": net_payable,
    }
