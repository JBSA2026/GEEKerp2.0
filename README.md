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

Run `sql/employees.sql` in your Supabase SQL Editor. This creates:

- `roles` — reference table of all valid roles
- `employees` — employee accounts
- `employee_roles` — assigns one or more roles per employee

A default Super Admin account is created automatically:

| Field    | Value             |
| -------- | ----------------- |
| Email    | superadmin@geek   |
| Password | admin@123         |

## Environment Setup

`backend/.env` — copy from `backend/.env.example`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-publishable-key

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
