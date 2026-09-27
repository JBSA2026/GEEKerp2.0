"""Seed script for HR module data.
Run from the backend directory: uv run python seed_hr.py
"""
import sys
from datetime import date, datetime
from database import supabase
import bcrypt


# Default password hash for seed employees
DEFAULT_PW_HASH = bcrypt.hashpw("GeekERP2025!".encode(), bcrypt.gensalt()).decode()


def seed():
    print("🌱 Seeding HR module data...")

    # ── 1. Ensure employees exist ────────────────────────────────────────────
    employees_data = [
        {"first_name": "Maria", "last_name": "Santos", "email": "maria.santos@geekgroup.ph", "is_active": True, "address": "Quezon City, Metro Manila"},
        {"first_name": "Juan", "last_name": "dela Cruz", "email": "juan.delacruz@geekgroup.ph", "is_active": True, "address": "Makati City, Metro Manila"},
        {"first_name": "Ana", "last_name": "Reyes", "email": "ana.reyes@geekgroup.ph", "is_active": True, "address": "Pasig City, Metro Manila"},
        {"first_name": "Carlos", "last_name": "Garcia", "email": "carlos.garcia@geekgroup.ph", "is_active": True, "address": "Taguig City, Metro Manila"},
        {"first_name": "Patricia", "last_name": "Mendoza", "email": "patricia.mendoza@geekgroup.ph", "is_active": True, "address": "Mandaluyong City"},
        {"first_name": "Roberto", "last_name": "Aquino", "email": "roberto.aquino@geekgroup.ph", "is_active": True, "address": "San Juan City"},
        {"first_name": "Jessica", "last_name": "Tan", "email": "jessica.tan@geekgroup.ph", "is_active": True, "address": "Marikina City"},
        {"first_name": "Miguel", "last_name": "Lim", "email": "miguel.lim@geekgroup.ph", "is_active": True, "address": "Paranaque City"},
        {"first_name": "Christine", "last_name": "Ramos", "email": "christine.ramos@geekgroup.ph", "is_active": True, "address": "Las Pinas City"},
        {"first_name": "Daniel", "last_name": "Cruz", "email": "daniel.cruz@geekgroup.ph", "is_active": True, "address": "Muntinlupa City"},
        {"first_name": "Sophia", "last_name": "Villanueva", "email": "sophia.villanueva@geekgroup.ph", "is_active": True, "address": "Caloocan City"},
        {"first_name": "Marco", "last_name": "Bautista", "email": "marco.bautista@geekgroup.ph", "is_active": True, "address": "Valenzuela City"},
        {"first_name": "Angela", "last_name": "Torres", "email": "angela.torres@geekgroup.ph", "is_active": False, "address": "Antipolo City"},
        {"first_name": "Rafael", "last_name": "Gonzales", "email": "rafael.gonzales@geekgroup.ph", "is_active": True, "address": "Cavite City"},
        {"first_name": "Isabella", "last_name": "Fernandez", "email": "isabella.fernandez@geekgroup.ph", "is_active": True, "address": "Laguna"},
    ]

    # Upsert employees (include password_hash for NOT NULL constraint)
    for emp in employees_data:
        existing = supabase.table("employees").select("employee_id").eq("email", emp["email"]).execute()
        if not existing.data:
            emp_with_pw = {**emp, "password_hash": DEFAULT_PW_HASH}
            supabase.table("employees").insert(emp_with_pw).execute()
            print(f"  ✓ Created employee: {emp['first_name']} {emp['last_name']}")

    # Get employee IDs by email
    def get_eid(email):
        r = supabase.table("employees").select("employee_id").eq("email", email).execute()
        return r.data[0]["employee_id"] if r.data else None

    e1 = get_eid("maria.santos@geekgroup.ph")
    e2 = get_eid("juan.delacruz@geekgroup.ph")
    e3 = get_eid("ana.reyes@geekgroup.ph")
    e4 = get_eid("carlos.garcia@geekgroup.ph")
    e5 = get_eid("patricia.mendoza@geekgroup.ph")
    e6 = get_eid("roberto.aquino@geekgroup.ph")
    e7 = get_eid("jessica.tan@geekgroup.ph")
    e8 = get_eid("miguel.lim@geekgroup.ph")
    e9 = get_eid("christine.ramos@geekgroup.ph")
    e10 = get_eid("daniel.cruz@geekgroup.ph")
    e11 = get_eid("sophia.villanueva@geekgroup.ph")
    e12 = get_eid("marco.bautista@geekgroup.ph")
    e13 = get_eid("angela.torres@geekgroup.ph")
    e14 = get_eid("rafael.gonzales@geekgroup.ph")
    e15 = get_eid("isabella.fernandez@geekgroup.ph")

    print(f"  Employee IDs: e1={e1}, e2={e2}, ... e15={e15}")

    # ── 2. Employee 201 Records ──────────────────────────────────────────────
    print("\n📋 Seeding Employee 201 records...")
    emp201_data = [
        {"employee_id": e1, "department": "Human Resources", "position": "HR Manager", "entity": "Expedia", "employment_status": "Active", "date_hired": "2020-03-15", "salary": 85000, "sss_number": "34-1234567-8", "philhealth_number": "12-123456789-0", "pagibig_number": "1234-5678-9012", "tin_number": "123-456-789-000", "emergency_contact_name": "Pedro Santos", "emergency_contact_number": "09171234567"},
        {"employee_id": e2, "department": "Engineering", "position": "Senior Developer", "entity": "Expedia", "employment_status": "Active", "date_hired": "2021-06-01", "salary": 75000, "sss_number": "34-2345678-9", "philhealth_number": "12-234567890-1", "pagibig_number": "2345-6789-0123", "tin_number": "234-567-890-001", "emergency_contact_name": "Rosa dela Cruz", "emergency_contact_number": "09182345678", "supervisor_id": e1},
        {"employee_id": e3, "department": "Engineering", "position": "Junior Developer", "entity": "GreatnessLab", "employment_status": "Active", "date_hired": "2023-01-15", "salary": 45000, "sss_number": "34-3456789-0", "philhealth_number": "12-345678901-2", "pagibig_number": "3456-7890-1234", "tin_number": "345-678-901-002", "emergency_contact_name": "Jose Reyes", "emergency_contact_number": "09193456789", "supervisor_id": e2},
        {"employee_id": e4, "department": "Sales", "position": "Sales Manager", "entity": "GreatnessLab", "employment_status": "Active", "date_hired": "2019-08-20", "salary": 90000, "sss_number": "34-4567890-1", "philhealth_number": "12-456789012-3", "pagibig_number": "4567-8901-2345", "tin_number": "456-789-012-003", "emergency_contact_name": "Elena Garcia", "emergency_contact_number": "09204567890"},
        {"employee_id": e5, "department": "Finance", "position": "Accountant", "entity": "Exigent", "employment_status": "Active", "date_hired": "2022-04-10", "salary": 55000, "sss_number": "34-5678901-2", "philhealth_number": "12-567890123-4", "pagibig_number": "5678-9012-3456", "tin_number": "567-890-123-004", "emergency_contact_name": "Luis Mendoza", "emergency_contact_number": "09215678901", "supervisor_id": e4},
        {"employee_id": e6, "department": "Operations", "position": "Project Manager", "entity": "Exigent", "employment_status": "Active", "date_hired": "2020-11-05", "salary": 80000, "sss_number": "34-6789012-3", "philhealth_number": "12-678901234-5", "pagibig_number": "6789-0123-4567", "tin_number": "678-901-234-005", "emergency_contact_name": "Carmen Aquino", "emergency_contact_number": "09226789012"},
        {"employee_id": e7, "department": "Marketing", "position": "Marketing Specialist", "entity": "KSI", "employment_status": "Active", "date_hired": "2023-07-01", "salary": 50000, "sss_number": "34-7890123-4", "philhealth_number": "12-789012345-6", "pagibig_number": "7890-1234-5678", "tin_number": "789-012-345-006", "emergency_contact_name": "William Tan", "emergency_contact_number": "09237890123", "supervisor_id": e4},
        {"employee_id": e8, "department": "Engineering", "position": "DevOps Engineer", "entity": "KSI", "employment_status": "Active", "date_hired": "2022-09-15", "salary": 70000, "sss_number": "34-8901234-5", "philhealth_number": "12-890123456-7", "pagibig_number": "8901-2345-6789", "tin_number": "890-123-456-007", "emergency_contact_name": "Grace Lim", "emergency_contact_number": "09248901234", "supervisor_id": e2},
        {"employee_id": e9, "department": "Human Resources", "position": "HR Assistant", "entity": "Expedia", "employment_status": "Probationary", "date_hired": "2025-05-01", "salary": 35000, "emergency_contact_name": "Mark Ramos", "emergency_contact_number": "09259012345", "supervisor_id": e1},
        {"employee_id": e10, "department": "Engineering", "position": "QA Engineer", "entity": "GreatnessLab", "employment_status": "Active", "date_hired": "2021-12-01", "salary": 60000, "sss_number": "34-0123456-7", "philhealth_number": "12-012345678-9", "pagibig_number": "0123-4567-8901", "tin_number": "012-345-678-009", "emergency_contact_name": "Liza Cruz", "emergency_contact_number": "09260123456", "supervisor_id": e2},
        {"employee_id": e11, "department": "Sales", "position": "Sales Representative", "entity": "Exigent", "employment_status": "Active", "date_hired": "2024-01-15", "salary": 40000, "emergency_contact_name": "Tony Villanueva", "emergency_contact_number": "09271234567", "supervisor_id": e4},
        {"employee_id": e12, "department": "Operations", "position": "Logistics Coordinator", "entity": "KSI", "employment_status": "Active", "date_hired": "2023-03-20", "salary": 45000, "sss_number": "34-1234560-8", "philhealth_number": "12-123456780-0", "pagibig_number": "1234-5670-9012", "tin_number": "123-456-780-010", "emergency_contact_name": "Nancy Bautista", "emergency_contact_number": "09282345678", "supervisor_id": e6},
        {"employee_id": e13, "department": "Engineering", "position": "Frontend Developer", "entity": "Expedia", "employment_status": "Resigned", "date_hired": "2021-04-01", "salary": 65000, "sss_number": "34-2345670-9", "philhealth_number": "12-234567890-1", "pagibig_number": "2345-6780-0123", "tin_number": "234-567-890-011", "emergency_contact_name": "Paul Torres", "emergency_contact_number": "09293456789", "supervisor_id": e2},
        {"employee_id": e14, "department": "Finance", "position": "Finance Manager", "entity": "GreatnessLab", "employment_status": "Active", "date_hired": "2018-06-15", "salary": 95000, "sss_number": "34-3456780-0", "philhealth_number": "12-345678900-2", "pagibig_number": "3456-7800-1234", "tin_number": "345-678-900-012", "emergency_contact_name": "Mila Gonzales", "emergency_contact_number": "09304567890"},
        {"employee_id": e15, "department": "Marketing", "position": "Content Writer", "entity": "Exigent", "employment_status": "On Leave", "date_hired": "2022-11-01", "salary": 42000, "sss_number": "34-4567800-1", "philhealth_number": "12-456789000-3", "pagibig_number": "4567-8000-2345", "tin_number": "456-789-000-013", "emergency_contact_name": "Rico Fernandez", "emergency_contact_number": "09315678901", "supervisor_id": e7},
    ]
    for rec in emp201_data:
        if rec["employee_id"] is None:
            continue
        existing = supabase.table("employee_201").select("id").eq("employee_id", rec["employee_id"]).execute()
        if not existing.data:
            supabase.table("employee_201").insert(rec).execute()
    print(f"  ✓ Inserted {len(emp201_data)} employee 201 records")

    # ── 3. Job Openings ──────────────────────────────────────────────────────
    print("\n💼 Seeding Job Openings...")
    openings = [
        {"position_title": "Full Stack Developer", "department": "Engineering", "entity": "Expedia", "employment_type": "Full-time", "status": "Open", "target_hire_date": "2025-08-30", "job_description": "Develop and maintain web applications using React and Python/FastAPI.", "required_qualifications": "BS Computer Science, 3+ years experience with React and Python", "date_posted": "2025-06-01"},
        {"position_title": "Marketing Manager", "department": "Marketing", "entity": "GreatnessLab", "employment_type": "Full-time", "status": "Open", "target_hire_date": "2025-09-15", "job_description": "Lead marketing campaigns and brand strategy.", "required_qualifications": "MBA or equivalent, 5+ years marketing experience", "date_posted": "2025-06-10"},
        {"position_title": "Accounting Clerk", "department": "Finance", "entity": "Exigent", "employment_type": "Full-time", "status": "Open", "target_hire_date": "2025-08-01", "job_description": "Process AP/AR transactions, bank reconciliation.", "required_qualifications": "BS Accountancy, CPA preferred", "date_posted": "2025-05-20"},
        {"position_title": "Network Technician", "department": "Operations", "entity": "KSI", "employment_type": "Full-time", "status": "Closed", "target_hire_date": "2025-06-30", "job_description": "Install and maintain network infrastructure.", "required_qualifications": "CCNA certified, 2+ years experience", "date_posted": "2025-04-01"},
        {"position_title": "UI/UX Designer", "department": "Engineering", "entity": "Expedia", "employment_type": "Contract", "status": "Open", "target_hire_date": "2025-09-01", "job_description": "Design user interfaces for ERP applications.", "required_qualifications": "Portfolio required, Figma proficiency", "date_posted": "2025-06-15"},
        {"position_title": "Sales Executive", "department": "Sales", "entity": "GreatnessLab", "employment_type": "Full-time", "status": "On Hold", "target_hire_date": "2025-10-01", "job_description": "Manage B2B sales pipeline for IT solutions.", "required_qualifications": "BS Business, 3+ years B2B sales", "date_posted": "2025-05-01"},
    ]
    for op in openings:
        existing = supabase.table("job_openings").select("id").eq("position_title", op["position_title"]).eq("entity", op["entity"]).execute()
        if not existing.data:
            supabase.table("job_openings").insert(op).execute()
    print(f"  ✓ Inserted {len(openings)} job openings")

    # ── 4. Applicants ────────────────────────────────────────────────────────
    print("\n👥 Seeding Applicants...")
    # Get opening IDs
    def get_opening_id(title):
        r = supabase.table("job_openings").select("id").eq("position_title", title).execute()
        return r.data[0]["id"] if r.data else None

    applicants = [
        {"job_opening_id": get_opening_id("Full Stack Developer"), "applicant_name": "Kevin Pascual", "contact_email": "kevin.pascual@gmail.com", "contact_number": "09171112222", "application_date": "2025-06-05", "source": "LinkedIn", "status": "Interview", "remarks": "Strong React portfolio"},
        {"job_opening_id": get_opening_id("Full Stack Developer"), "applicant_name": "Mark Rivera", "contact_email": "mark.rivera@yahoo.com", "contact_number": "09182223333", "application_date": "2025-06-08", "source": "Job Board", "status": "Screening"},
        {"job_opening_id": get_opening_id("Full Stack Developer"), "applicant_name": "Diana Lopez", "contact_email": "diana.lopez@outlook.com", "contact_number": "09193334444", "application_date": "2025-06-12", "source": "Referral", "status": "Applied", "remarks": "Referred by Juan dela Cruz"},
        {"job_opening_id": get_opening_id("Marketing Manager"), "applicant_name": "Sarah Chua", "contact_email": "sarah.chua@gmail.com", "contact_number": "09204445555", "application_date": "2025-06-12", "source": "LinkedIn", "status": "Offer", "remarks": "MBA from Ateneo, 7 yrs exp"},
        {"job_opening_id": get_opening_id("Marketing Manager"), "applicant_name": "Robert Sy", "contact_email": "robert.sy@gmail.com", "contact_number": "09215556666", "application_date": "2025-06-14", "source": "Walk-in", "status": "Rejected", "remarks": "Insufficient experience"},
        {"job_opening_id": get_opening_id("Accounting Clerk"), "applicant_name": "Trisha Manalo", "contact_email": "trisha.manalo@gmail.com", "contact_number": "09226667777", "application_date": "2025-05-25", "source": "School Partnership", "status": "Interview", "remarks": "Fresh CPA, top of class"},
        {"job_opening_id": get_opening_id("Network Technician"), "applicant_name": "Jerome Villar", "contact_email": "jerome.villar@gmail.com", "contact_number": "09237778888", "application_date": "2025-04-10", "source": "Job Board", "status": "Hired", "remarks": "CCNA certified, started June 16"},
        {"job_opening_id": get_opening_id("UI/UX Designer"), "applicant_name": "Bianca Ong", "contact_email": "bianca.ong@gmail.com", "contact_number": "09248889999", "application_date": "2025-06-18", "source": "LinkedIn", "status": "Applied", "remarks": "Impressive Behance portfolio"},
        {"job_opening_id": get_opening_id("Sales Executive"), "applicant_name": "Anton Reyes", "contact_email": "anton.reyes@gmail.com", "contact_number": "09259990000", "application_date": "2025-05-05", "source": "Referral", "status": "Screening"},
    ]
    for app in applicants:
        if app["job_opening_id"] is None:
            continue
        existing = supabase.table("applicants").select("id").eq("applicant_name", app["applicant_name"]).eq("job_opening_id", app["job_opening_id"]).execute()
        if not existing.data:
            supabase.table("applicants").insert(app).execute()
    print(f"  ✓ Inserted {len(applicants)} applicants")

    # ── 5. OJT Trainees ──────────────────────────────────────────────────────
    print("\n🎓 Seeding OJT Trainees...")
    ojt_data = [
        {"trainee_name": "Jasmine Reyes", "school": "University of the Philippines", "program": "BS Computer Science", "department": "Engineering", "supervisor_id": e2, "entity": "Expedia", "start_date": "2025-06-01", "end_date": "2025-09-30", "required_hours": 480, "hours_rendered": 320, "completion_percentage": 66.7, "status": "Active", "remarks": "Working on frontend components"},
        {"trainee_name": "Kenneth Lim", "school": "De La Salle University", "program": "BS Information Technology", "department": "Engineering", "supervisor_id": e8, "entity": "KSI", "start_date": "2025-05-15", "end_date": "2025-08-15", "required_hours": 400, "hours_rendered": 400, "completion_percentage": 100.0, "status": "Completed", "remarks": "Excellent performance in DevOps"},
        {"trainee_name": "Samantha Cruz", "school": "Ateneo de Manila University", "program": "BS Management", "department": "Sales", "supervisor_id": e4, "entity": "GreatnessLab", "start_date": "2025-06-15", "end_date": "2025-10-15", "required_hours": 500, "hours_rendered": 180, "completion_percentage": 36.0, "status": "Active", "remarks": "Assisting with client presentations"},
        {"trainee_name": "Paolo Mendoza", "school": "Mapua University", "program": "BS Electrical Engineering", "department": "Operations", "supervisor_id": e6, "entity": "Exigent", "start_date": "2025-04-01", "end_date": "2025-07-31", "required_hours": 480, "hours_rendered": 450, "completion_percentage": 93.8, "status": "Active", "remarks": "Almost done — site installations"},
        {"trainee_name": "Rina Santos", "school": "Polytechnic University", "program": "BS Accountancy", "department": "Finance", "supervisor_id": e5, "entity": "Exigent", "start_date": "2025-03-01", "end_date": "2025-06-30", "required_hours": 300, "hours_rendered": 300, "completion_percentage": 100.0, "status": "Completed", "remarks": "Great at financial reporting"},
        {"trainee_name": "Jaymark Torres", "school": "Technological University", "program": "BS Computer Engineering", "department": "Engineering", "supervisor_id": e2, "entity": "Expedia", "start_date": "2025-07-01", "end_date": "2025-11-30", "required_hours": 600, "hours_rendered": 45, "completion_percentage": 7.5, "status": "Active", "remarks": "Just started"},
    ]
    for t in ojt_data:
        if t["supervisor_id"] is None:
            continue
        existing = supabase.table("ojt_trainees").select("id").eq("trainee_name", t["trainee_name"]).execute()
        if not existing.data:
            supabase.table("ojt_trainees").insert(t).execute()
    print(f"  ✓ Inserted {len(ojt_data)} OJT trainees")

    # ── 6. PH Holidays 2025 ─────────────────────────────────────────────────
    print("\n🎌 Seeding PH Holidays 2025...")
    holidays = [
        {"holiday_date": "2025-01-01", "name": "New Year's Day", "type": "Regular", "year": 2025},
        {"holiday_date": "2025-04-09", "name": "Araw ng Kagitingan", "type": "Regular", "year": 2025},
        {"holiday_date": "2025-04-17", "name": "Maundy Thursday", "type": "Regular", "year": 2025},
        {"holiday_date": "2025-04-18", "name": "Good Friday", "type": "Regular", "year": 2025},
        {"holiday_date": "2025-05-01", "name": "Labor Day", "type": "Regular", "year": 2025},
        {"holiday_date": "2025-06-12", "name": "Independence Day", "type": "Regular", "year": 2025},
        {"holiday_date": "2025-08-25", "name": "National Heroes Day", "type": "Regular", "year": 2025},
        {"holiday_date": "2025-11-30", "name": "Bonifacio Day", "type": "Regular", "year": 2025},
        {"holiday_date": "2025-12-25", "name": "Christmas Day", "type": "Regular", "year": 2025},
        {"holiday_date": "2025-12-30", "name": "Rizal Day", "type": "Regular", "year": 2025},
        {"holiday_date": "2025-01-29", "name": "Chinese New Year", "type": "Special Non-Working", "year": 2025},
        {"holiday_date": "2025-02-25", "name": "EDSA People Power Revolution", "type": "Special Non-Working", "year": 2025},
        {"holiday_date": "2025-04-19", "name": "Black Saturday", "type": "Special Non-Working", "year": 2025},
        {"holiday_date": "2025-08-21", "name": "Ninoy Aquino Day", "type": "Special Non-Working", "year": 2025},
        {"holiday_date": "2025-11-01", "name": "All Saints' Day", "type": "Special Non-Working", "year": 2025},
        {"holiday_date": "2025-12-08", "name": "Feast of the Immaculate Conception", "type": "Special Non-Working", "year": 2025},
        {"holiday_date": "2025-12-31", "name": "Last Day of the Year", "type": "Special Non-Working", "year": 2025},
    ]
    for h in holidays:
        existing = supabase.table("ph_holidays").select("id").eq("holiday_date", h["holiday_date"]).execute()
        if not existing.data:
            supabase.table("ph_holidays").insert(h).execute()
    print(f"  ✓ Inserted {len(holidays)} PH holidays")

    # ── 7. Leave Balances ────────────────────────────────────────────────────
    print("\n📊 Seeding Leave Balances...")
    leave_bal = [
        (e1, "Vacation", 15.0, 3.0), (e1, "Sick", 10.0, 1.0), (e1, "Emergency", 3.0, 0.0),
        (e2, "Vacation", 12.0, 5.0), (e2, "Sick", 10.0, 2.0), (e2, "Emergency", 3.0, 1.0),
        (e3, "Vacation", 5.0, 2.0), (e3, "Sick", 5.0, 0.0),
        (e4, "Vacation", 15.0, 8.0), (e4, "Sick", 10.0, 0.0),
        (e5, "Vacation", 10.0, 4.0), (e5, "Sick", 10.0, 3.0),
        (e6, "Vacation", 15.0, 2.0), (e6, "Sick", 10.0, 1.0),
        (e7, "Vacation", 5.0, 1.0), (e7, "Sick", 5.0, 0.0),
        (e8, "Vacation", 10.0, 3.0), (e8, "Sick", 10.0, 0.0),
        (e10, "Vacation", 12.0, 6.0), (e10, "Sick", 10.0, 2.0),
        (e11, "Vacation", 5.0, 0.0), (e11, "Sick", 5.0, 1.0),
        (e12, "Vacation", 8.0, 2.0), (e12, "Sick", 8.0, 0.0),
        (e14, "Vacation", 20.0, 10.0), (e14, "Sick", 15.0, 3.0),
        (e15, "Vacation", 10.0, 5.0), (e15, "Sick", 10.0, 2.0),
    ]
    for eid, ltype, total, used in leave_bal:
        if eid is None:
            continue
        existing = supabase.table("leave_balances").select("id").eq("employee_id", eid).eq("leave_type", ltype).eq("year", 2025).execute()
        if not existing.data:
            supabase.table("leave_balances").insert({"employee_id": eid, "leave_type": ltype, "year": 2025, "total_credits": total, "used_credits": used}).execute()
    print(f"  ✓ Inserted {len(leave_bal)} leave balance records")

    # ── 8. Leave Requests ────────────────────────────────────────────────────
    print("\n📝 Seeding Leave Requests...")
    leave_reqs = [
        {"employee_id": e2, "leave_type": "Vacation", "start_date": "2025-07-14", "end_date": "2025-07-18", "number_of_days": 5, "reason": "Family vacation in Palawan", "status": "Approved", "filed_date": "2025-06-20", "approved_by": e1, "entity": "Expedia"},
        {"employee_id": e4, "leave_type": "Vacation", "start_date": "2025-08-04", "end_date": "2025-08-08", "number_of_days": 5, "reason": "Personal trip", "status": "Pending", "filed_date": "2025-06-25", "entity": "GreatnessLab"},
        {"employee_id": e5, "leave_type": "Sick", "start_date": "2025-06-23", "end_date": "2025-06-24", "number_of_days": 2, "reason": "Flu and fever", "status": "Approved", "filed_date": "2025-06-23", "approved_by": e6, "entity": "Exigent"},
        {"employee_id": e3, "leave_type": "Vacation", "start_date": "2025-07-21", "end_date": "2025-07-22", "number_of_days": 2, "reason": "Moving to new apartment", "status": "Approved", "filed_date": "2025-06-18", "approved_by": e2, "entity": "GreatnessLab"},
        {"employee_id": e7, "leave_type": "Sick", "start_date": "2025-06-16", "end_date": "2025-06-16", "number_of_days": 1, "reason": "Dental appointment", "status": "Approved", "filed_date": "2025-06-14", "approved_by": e4, "entity": "KSI"},
        {"employee_id": e10, "leave_type": "Vacation", "start_date": "2025-08-11", "end_date": "2025-08-15", "number_of_days": 5, "reason": "Province visit", "status": "Pending", "filed_date": "2025-06-28", "entity": "GreatnessLab"},
        {"employee_id": e8, "leave_type": "Emergency", "start_date": "2025-06-09", "end_date": "2025-06-09", "number_of_days": 1, "reason": "Family emergency", "status": "Approved", "filed_date": "2025-06-09", "approved_by": e2, "entity": "KSI"},
        {"employee_id": e15, "leave_type": "Sick", "start_date": "2025-06-25", "end_date": "2025-06-27", "number_of_days": 3, "reason": "Hospitalization", "status": "Approved", "filed_date": "2025-06-25", "approved_by": e6, "entity": "Exigent"},
        {"employee_id": e11, "leave_type": "Vacation", "start_date": "2025-07-07", "end_date": "2025-07-08", "number_of_days": 2, "reason": "Birthday leave", "status": "Rejected", "rejection_reason": "Insufficient staffing during that period", "filed_date": "2025-06-22", "entity": "Exigent"},
        {"employee_id": e1, "leave_type": "Vacation", "start_date": "2025-09-01", "end_date": "2025-09-03", "number_of_days": 3, "reason": "Anniversary trip", "status": "Pending", "filed_date": "2025-06-30", "entity": "Expedia"},
    ]
    for lr in leave_reqs:
        if lr["employee_id"] is None:
            continue
        supabase.table("leave_requests").insert(lr).execute()
    print(f"  ✓ Inserted {len(leave_reqs)} leave requests")

    # ── 9. Attendance Records ────────────────────────────────────────────────
    print("\n⏰ Seeding Attendance Records...")
    attendance = [
        (e1, "2025-06-23", "07:55", "17:05", 8.17, "Present", None, "Expedia"),
        (e2, "2025-06-23", "08:10", "17:30", 8.33, "Late", None, "Expedia"),
        (e3, "2025-06-23", "07:50", "17:00", 8.17, "Present", None, "GreatnessLab"),
        (e4, "2025-06-23", "08:00", "17:00", 8.0, "Present", None, "GreatnessLab"),
        (e6, "2025-06-23", "07:45", "16:30", 7.75, "Undertime", "Left early", "Exigent"),
        (e7, "2025-06-23", "08:20", "16:45", 7.42, "Late/Undertime", None, "KSI"),
        (e8, "2025-06-23", "07:58", "17:15", 8.28, "Present", None, "KSI"),
        (e10, "2025-06-23", "08:05", "17:10", 8.08, "Late", None, "GreatnessLab"),
        (e11, "2025-06-23", "07:50", "17:00", 8.17, "Present", None, "Exigent"),
        (e12, "2025-06-23", "08:00", "17:00", 8.0, "Present", None, "KSI"),
        (e1, "2025-06-24", "07:50", "17:10", 8.33, "Present", None, "Expedia"),
        (e2, "2025-06-24", "07:55", "17:00", 8.08, "Present", None, "Expedia"),
        (e3, "2025-06-24", "08:15", "17:00", 7.75, "Late/Undertime", None, "GreatnessLab"),
        (e4, "2025-06-24", "07:45", "17:30", 8.75, "Present", None, "GreatnessLab"),
        (e6, "2025-06-24", "08:00", "17:00", 8.0, "Present", None, "Exigent"),
        (e7, "2025-06-24", "08:00", "17:05", 8.08, "Present", None, "KSI"),
        (e8, "2025-06-24", "08:30", "17:00", 7.5, "Late/Undertime", "Traffic", "KSI"),
        (e10, "2025-06-24", "07:55", "17:00", 8.08, "Present", None, "GreatnessLab"),
        (e11, "2025-06-24", "08:00", "17:15", 8.25, "Present", None, "Exigent"),
        (e12, "2025-06-24", "07:50", "16:50", 8.0, "Present", None, "KSI"),
        (e1, "2025-06-25", "08:00", "17:00", 8.0, "Present", None, "Expedia"),
        (e2, "2025-06-25", "07:45", "17:15", 8.5, "Present", None, "Expedia"),
        (e3, "2025-06-25", "08:00", "17:00", 8.0, "Present", None, "GreatnessLab"),
        (e4, "2025-06-25", "08:05", "17:00", 7.92, "Late/Undertime", None, "GreatnessLab"),
        (e6, "2025-06-25", "07:55", "17:30", 8.58, "Present", None, "Exigent"),
        (e7, "2025-06-25", "07:58", "17:00", 8.03, "Present", None, "KSI"),
        (e8, "2025-06-25", "08:00", "17:00", 8.0, "Present", None, "KSI"),
        (e10, "2025-06-25", "08:00", "17:00", 8.0, "Present", None, "GreatnessLab"),
        (e12, "2025-06-25", "08:10", "17:00", 7.83, "Late/Undertime", None, "KSI"),
    ]
    for eid, dt, ti, to_, hrs, st, rem, ent in attendance:
        if eid is None:
            continue
        existing = supabase.table("attendance_records").select("id").eq("employee_id", eid).eq("date", dt).execute()
        if not existing.data:
            supabase.table("attendance_records").insert({"employee_id": eid, "date": dt, "time_in": ti, "time_out": to_, "total_hours": hrs, "status": st, "remarks": rem, "entity": ent}).execute()
    print(f"  ✓ Inserted {len(attendance)} attendance records")

    # ── 10. Performance Evaluations ──────────────────────────────────────────
    print("\n⭐ Seeding Performance Evaluations...")
    perf_evals = [
        {"employee_id": e2, "evaluator_id": e1, "evaluation_period": "Quarterly", "evaluation_date": "2025-03-31", "quality_of_work": 5, "productivity": 4, "communication": 4, "teamwork": 5, "initiative": 4, "overall_rating": 4.40, "comments": "Consistently delivers high-quality code. Mentors junior developers.", "status": "Completed", "date_completed": "2025-04-02", "entity": "Expedia"},
        {"employee_id": e3, "evaluator_id": e2, "evaluation_period": "Quarterly", "evaluation_date": "2025-03-31", "quality_of_work": 3, "productivity": 4, "communication": 3, "teamwork": 4, "initiative": 3, "overall_rating": 3.40, "comments": "Good progress. Needs to improve communication.", "status": "Completed", "date_completed": "2025-04-03", "entity": "GreatnessLab"},
        {"employee_id": e4, "evaluator_id": e14, "evaluation_period": "Quarterly", "evaluation_date": "2025-03-31", "quality_of_work": 5, "productivity": 5, "communication": 5, "teamwork": 4, "initiative": 5, "overall_rating": 4.80, "comments": "Outstanding sales performance. Exceeded Q1 targets by 30%.", "status": "Completed", "date_completed": "2025-04-01", "entity": "GreatnessLab"},
        {"employee_id": e5, "evaluator_id": e6, "evaluation_period": "Quarterly", "evaluation_date": "2025-03-31", "quality_of_work": 4, "productivity": 4, "communication": 3, "teamwork": 4, "initiative": 3, "overall_rating": 3.60, "comments": "Reliable. Could take more initiative.", "status": "Completed", "date_completed": "2025-04-05", "entity": "Exigent"},
        {"employee_id": e8, "evaluator_id": e2, "evaluation_period": "Quarterly", "evaluation_date": "2025-03-31", "quality_of_work": 5, "productivity": 5, "communication": 4, "teamwork": 4, "initiative": 5, "overall_rating": 4.60, "comments": "Exceptional DevOps work. CI/CD pipeline reduced deploy time by 60%.", "status": "Completed", "date_completed": "2025-04-02", "entity": "KSI"},
        {"employee_id": e10, "evaluator_id": e2, "evaluation_period": "Quarterly", "evaluation_date": "2025-06-30", "quality_of_work": 4, "productivity": 4, "communication": 4, "teamwork": 5, "initiative": 4, "overall_rating": 4.20, "comments": "Solid QA coverage. Caught 3 critical bugs.", "status": "Completed", "date_completed": "2025-07-01", "entity": "GreatnessLab"},
        {"employee_id": e1, "evaluator_id": e14, "evaluation_period": "Semi-Annual", "evaluation_date": "2025-06-30", "quality_of_work": 5, "productivity": 4, "communication": 5, "teamwork": 5, "initiative": 5, "overall_rating": 4.80, "comments": "Excellent HR leadership.", "status": "Completed", "date_completed": "2025-07-02", "entity": "Expedia"},
        {"employee_id": e6, "evaluator_id": e14, "evaluation_period": "Quarterly", "evaluation_date": "2025-06-30", "quality_of_work": 4, "productivity": 5, "communication": 4, "teamwork": 4, "initiative": 4, "overall_rating": 4.20, "comments": "Projects on time. Good stakeholder management.", "status": "Completed", "date_completed": "2025-07-01", "entity": "Exigent"},
        {"employee_id": e2, "evaluator_id": e1, "evaluation_period": "Quarterly", "evaluation_date": "2025-06-30", "quality_of_work": 5, "productivity": 5, "communication": 4, "teamwork": 5, "initiative": 5, "overall_rating": 4.80, "comments": "Led the ERP HR module. Exceptional quarter.", "status": "Draft", "entity": "Expedia"},
        {"employee_id": e11, "evaluator_id": e4, "evaluation_period": "Quarterly", "evaluation_date": "2025-06-30", "quality_of_work": 3, "productivity": 3, "communication": 4, "teamwork": 3, "initiative": 3, "overall_rating": 3.20, "comments": "Meeting baseline. Needs prospecting skills.", "status": "Draft", "entity": "Exigent"},
    ]
    for ev in perf_evals:
        if ev["employee_id"] is None or ev["evaluator_id"] is None:
            continue
        supabase.table("performance_evaluations").insert(ev).execute()
    print(f"  ✓ Inserted {len(perf_evals)} performance evaluations")

    # ── 11. Training Records ─────────────────────────────────────────────────
    print("\n📚 Seeding Training Records...")
    training = [
        {"employee_id": e2, "training_title": "Advanced Python & FastAPI", "provider": "Internal", "training_date": "2025-03-15", "duration_hours": 16.0, "training_type": "Internal", "status": "Completed", "entity": "Expedia"},
        {"employee_id": e3, "training_title": "React Fundamentals Bootcamp", "provider": "Udemy", "training_date": "2025-02-01", "duration_hours": 40.0, "training_type": "Online", "status": "Completed", "entity": "GreatnessLab"},
        {"employee_id": e8, "training_title": "AWS Solutions Architect", "provider": "Amazon Web Services", "training_date": "2025-04-20", "duration_hours": 32.0, "training_type": "External", "status": "Completed", "certificate_path": "aws-cert-miguel.pdf", "entity": "KSI"},
        {"employee_id": e1, "training_title": "Philippine Labor Law Updates 2025", "provider": "DOLE", "training_date": "2025-05-10", "duration_hours": 8.0, "training_type": "Seminar", "status": "Completed", "entity": "Expedia"},
        {"employee_id": e4, "training_title": "B2B Sales Masterclass", "provider": "Sandler Training", "training_date": "2025-06-05", "duration_hours": 16.0, "training_type": "Workshop", "status": "Completed", "certificate_path": "sandler-cert-carlos.pdf", "entity": "GreatnessLab"},
        {"employee_id": e6, "training_title": "PMP Exam Prep", "provider": "PMI", "training_date": "2025-07-15", "duration_hours": 40.0, "training_type": "Online", "status": "In Progress", "entity": "Exigent"},
        {"employee_id": e7, "training_title": "Digital Marketing Strategy", "provider": "Google", "training_date": "2025-08-01", "duration_hours": 24.0, "training_type": "Online", "status": "Scheduled", "entity": "KSI"},
        {"employee_id": e5, "training_title": "Advanced Excel & Power BI", "provider": "Microsoft", "training_date": "2025-06-20", "duration_hours": 16.0, "training_type": "Online", "status": "Completed", "entity": "Exigent"},
        {"employee_id": e10, "training_title": "Selenium Test Automation", "provider": "Test Automation University", "training_date": "2025-05-25", "duration_hours": 20.0, "training_type": "Online", "status": "Completed", "certificate_path": "selenium-cert-daniel.pdf", "entity": "GreatnessLab"},
        {"employee_id": e12, "training_title": "Supply Chain Management", "provider": "APICS", "training_date": "2025-09-01", "duration_hours": 32.0, "training_type": "External", "status": "Scheduled", "entity": "KSI"},
        {"employee_id": e2, "training_title": "Kubernetes for Developers", "provider": "CNCF", "training_date": "2025-07-20", "duration_hours": 24.0, "training_type": "Online", "status": "In Progress", "entity": "Expedia"},
        {"employee_id": e14, "training_title": "Financial Analysis & Modeling", "provider": "CFA Institute", "training_date": "2025-04-10", "duration_hours": 40.0, "training_type": "External", "status": "Completed", "certificate_path": "cfa-cert-rafael.pdf", "entity": "GreatnessLab"},
    ]
    for tr in training:
        if tr["employee_id"] is None:
            continue
        supabase.table("training_records").insert(tr).execute()
    print(f"  ✓ Inserted {len(training)} training records")

    print("\n✅ HR module seeding complete!")


if __name__ == "__main__":
    try:
        seed()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
