"""HR utility functions — pure computation logic for the HR Management module.

All functions use only the Python standard library (datetime, re).
"""

from datetime import date, time, datetime, timedelta
import re


# ---------------------------------------------------------------------------
# Business Days Calculation
# ---------------------------------------------------------------------------

def compute_business_days(start_date: date, end_date: date, holidays: list[date]) -> int:
    """Count business days between start_date and end_date (inclusive),
    excluding weekends (Sat=5, Sun=6) and provided PH holidays.

    Returns 0 if end_date < start_date.
    """
    if end_date < start_date:
        return 0

    holiday_set = set(holidays)
    count = 0
    current = start_date

    while current <= end_date:
        if current.weekday() < 5 and current not in holiday_set:
            count += 1
        current += timedelta(days=1)

    return count


# ---------------------------------------------------------------------------
# Attendance Hours Computation
# ---------------------------------------------------------------------------

def compute_attendance_hours(time_in: time, time_out: time) -> float:
    """Compute total working hours.

    Calculates time_out - time_in in hours.
    Deducts 1 hour for lunch if span exceeds 5 hours.
    Rounds to 2 decimal places.
    """
    dt_in = datetime.combine(date.today(), time_in)
    dt_out = datetime.combine(date.today(), time_out)

    span = (dt_out - dt_in).total_seconds() / 3600

    if span > 5:
        span -= 1  # lunch deduction

    return round(span, 2)


# ---------------------------------------------------------------------------
# Attendance Status Derivation
# ---------------------------------------------------------------------------

def derive_attendance_status(
    time_in: time,
    time_out: time | None,
    standard_start: time,
    total_hours: float | None,
) -> str:
    """Derive attendance status based on lateness and undertime conditions.

    Returns one of: 'Late/Undertime', 'Late', 'Undertime', or 'Present'.

    - Late: time_in > standard_start
    - Undertime: total_hours < 8
    """
    is_late = time_in > standard_start
    is_undertime = total_hours is not None and total_hours < 8

    if is_late and is_undertime:
        return "Late/Undertime"
    elif is_late:
        return "Late"
    elif is_undertime:
        return "Undertime"
    return "Present"


# ---------------------------------------------------------------------------
# OJT Completion
# ---------------------------------------------------------------------------

def compute_ojt_completion(hours_rendered: float, required_hours: float) -> float:
    """Compute OJT completion percentage.

    Returns (hours_rendered / required_hours) * 100, rounded to 1 decimal place.
    Returns 0.0 if required_hours <= 0.
    """
    if required_hours <= 0:
        return 0.0
    return round((hours_rendered / required_hours) * 100, 1)


def should_auto_complete(status: str, hours_rendered: float, required_hours: float) -> bool:
    """Determine if an OJT trainee should be automatically set to Completed.

    Returns True if status is 'Active' or 'Extended' and
    hours_rendered >= required_hours.
    """
    return status in ('Active', 'Extended') and hours_rendered >= required_hours


# ---------------------------------------------------------------------------
# Performance Rating
# ---------------------------------------------------------------------------

def compute_performance_rating(scores: list[int]) -> float:
    """Compute overall performance rating as the average of 5 category scores.

    Each score is an integer 1-5. Result is rounded to 2 decimal places.
    Raises ValueError if not exactly 5 scores are provided.
    """
    if len(scores) != 5:
        raise ValueError("Exactly 5 category scores required")
    return round(sum(scores) / 5, 2)


# ---------------------------------------------------------------------------
# Government Number Validation
# ---------------------------------------------------------------------------

GOV_NUMBER_PATTERNS: dict[str, str] = {
    'sss':        r'^\d{2}-\d{7}-\d{1}$',       # DD-DDDDDDD-D
    'philhealth': r'^\d{2}-\d{9}-\d{1}$',       # DD-DDDDDDDDD-D
    'pagibig':    r'^\d{4}-\d{4}-\d{4}$',       # DDDD-DDDD-DDDD
    'tin':        r'^\d{3}-\d{3}-\d{3}-\d{3}$', # DDD-DDD-DDD-DDD
}


def validate_gov_number(number_type: str, value: str) -> bool:
    """Validate a Philippine government number format.

    Supported types: 'sss', 'philhealth', 'pagibig', 'tin' (case-insensitive).
    Raises ValueError for unknown number_type.
    """
    pattern = GOV_NUMBER_PATTERNS.get(number_type.lower())
    if not pattern:
        raise ValueError(f"Unknown number type: {number_type}")
    return bool(re.match(pattern, value))


# ---------------------------------------------------------------------------
# Leave Overlap Detection
# ---------------------------------------------------------------------------

def compute_leave_overlap(
    existing: list[tuple[date, date]],
    new_start: date,
    new_end: date,
) -> bool:
    """Detect if a new leave date range overlaps with any existing range.

    Two ranges [a, b] and [c, d] overlap if a <= d AND c <= b.
    Returns True if overlap is found.
    """
    for (ex_start, ex_end) in existing:
        if new_start <= ex_end and ex_start <= new_end:
            return True
    return False


# ---------------------------------------------------------------------------
# Absenteeism Rate
# ---------------------------------------------------------------------------

def compute_absenteeism_rate(absent_days: int, total_working_days: int) -> float:
    """Compute absenteeism rate as a percentage.

    Returns (absent_days / total_working_days) * 100, rounded to 2 decimal places.
    Returns 0.0 if total_working_days <= 0.
    """
    if total_working_days <= 0:
        return 0.0
    return round((absent_days / total_working_days) * 100, 2)
