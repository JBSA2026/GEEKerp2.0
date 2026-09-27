# GEEK ERP

Full-stack ERP application built with React/Vite, FastAPI, and Supabase (PostgreSQL only — no Supabase Auth).

## Prerequisites

- Node.js and npm
- Python 3.14
- [uv](https://docs.astral.sh/uv/) — install on Windows:

```powershell
winget install --id=astral-sh.uv -e
```

Restart the terminal after installing.

## Database Setup

In your Supabase SQL Editor, run the files in [`database/`](database/README.md) in order:
`01_schema.sql`, `02_functions.sql`, `03_seed.sql`, `04_storage.sql`.
They create every table, function and storage bucket the backend uses, plus
roles, the four companies, tax codes and a starter chart of accounts.
See [`database/README.md`](database/README.md) for details and the optional
production lock-down (`05_enable_rls.sql`).

A default Super Admin account is created automatically. **Change its password after the first login.**

| Field    | Value             |
| -------- | ----------------- |
| Email    | superadmin@geek   |
| Password | admin@123         |

## Environment Setup

`backend/.env` — copy from `backend/.env.example`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-secret-key   # service_role / sb_secret_... (see database/README.md)

JWT_SECRET=your-secret-key-change-in-production
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=480
```

`frontend/.env` — copy from `frontend/.env.example`:

```env
VITE_API_URL=http://localhost:8000
```

## Install Dependencies

Backend:

```powershell
cd backend
uv sync
```

Frontend:

```powershell
cd frontend
npm install
```

## Run Locally

Start both servers from the `frontend` folder:

```powershell
cd frontend
npm run dev
```

Or start them separately:

```powershell
# Terminal 1 — backend
cd backend
uv run uvicorn main:app --reload

# Terminal 2 — frontend
cd frontend
npm run dev:frontend
```

Frontend runs at `http://localhost:5173`, backend at `http://localhost:8000`.  
Interactive API docs: `http://localhost:8000/docs`

## Demo Data (optional, test databases only)

With the backend running, load one example of every main flow (employees, clients,
products, quotations, purchasing → AP, AR, GL, payroll, commissions, tax forms)
so every screen has data to look at:

```powershell
cd backend
uv run python seed_demo.py
```

## API Endpoints

| Method | Endpoint | Auth | Description |
| ------ | -------- | ---- | ----------- |
| `POST` | `/auth/login` | — | Login, returns JWT |
| `POST` | `/auth/logout` | ✓ | Logout |
| `GET` | `/auth/me` | ✓ | Current user + roles |
| `GET` | `/clients/` | ✓ | List / search clients |
| `POST` | `/clients/` | ✓ | Add a client |
| `GET` | `/products/` | ✓ | List / search products |
| `POST` | `/products/` | ✓ | Add a product |

## Protecting Routes (Backend)

```python
from routers.auth import require_roles

@router.get("/example")
def example(user = Depends(require_roles("SUPER_ADMIN", "HR_MANAGER"))):
    ...
```

## Checking Roles (Frontend)

```js
import { hasRole } from '@/utils/api'

{hasRole('SUPER_ADMIN') && <Button>Admin Action</Button>}
```
