---
name: fyso-ui
description: "Design and generate a complete frontend UI for your Fyso app. Handles discovery (objective, roles, style), mockup validation, API contracts documentation, and code generation using @fyso/ui components."
argument-hint: "[plan | infer | mockup | contracts | build | audit | all]"
---

# Fyso UI — Frontend Generation Pipeline

You design and generate a complete frontend for a Fyso app. This is the final phase of the GSD pipeline — after entities, rules, and channels are built, this skill creates the UI that users interact with.

The generated UI uses Astro, React, and Tailwind CSS — calling the Fyso API directly without UI library dependencies.

## Pipeline — Sequence of Steps

**The UI pipeline has a strict order. Never skip steps or build the frontend before the backend is ready.**

```
BACKEND FIRST (via /fyso:plan + /fyso:build)
  └─▶ Phase 1..N: entities, rules, channels — all published in tenant

UI DESIGN (this skill — design only, no code yet)
  ├─▶ /fyso:ui plan      → discovery questions → UI-SPEC.md
  │     or
  │   /fyso:ui infer     → AI infers everything → UI-SPEC.md + MOCKUPS + CONTRACTS
  ├─▶ /fyso:ui mockup    → ASCII wireframes → UI-MOCKUPS.md (approved)
  └─▶ /fyso:ui contracts → API contracts, roles, auth → UI-CONTRACTS.md

UI BUILD (only when backend is fully built)
  └─▶ /fyso:ui build     → generate frontend code

UI AUDIT (after build)
  └─▶ /fyso:ui audit     → security, domain, permissions, UX checks
```

**Gate rule:** `/fyso:ui build` is BLOCKED unless:
1. All entities defined in UI-SPEC.md are published in the tenant (verified via MCP)
2. UI-SPEC.md, UI-MOCKUPS.md, and UI-CONTRACTS.md all exist

If either condition fails, explain what's missing and suggest the correct next step instead.

## Modes

```
/fyso-ui plan              # Discovery + design: ask questions, generate UI spec
/fyso-ui infer "<desc>"    # AI-inferred: generate everything from short description
/fyso-ui mockup            # Generate ASCII mockups for validation
/fyso-ui contracts         # Document API contracts, roles, auth flows
/fyso-ui build             # Generate the actual UI code (blocked until backend ready)
/fyso-ui audit             # Audit: security, domain, permissions, UX problems
/fyso-ui all               # Full pipeline: plan → mockup → contracts → build
```

---

## Mode: PLAN — UI Discovery & Design

### Step 1: Read Project Context

Before asking anything, load context:

1. Read `.planning/PROJECT.md` — app domain, core value
2. Read `.planning/REQUIREMENTS.md` — entities, rules, relations
3. Read `.planning/STATE.md` — current entities, what's published
4. Query tenant if MCP is available:
   ```
   select_tenant → list_entities → get_entity_schema (for each)
   ```

This gives you the complete data model to design the UI around.

### Step 2: Discovery Questions

Ask the user systematically. Group questions into rounds of 3-5 max.

#### Round 1: Objective & Audience

1. **What's the main objective of this UI?**
   - Internal admin panel (you and your team manage data)
   - Client-facing portal (your clients see their data)
   - Public website (anyone can browse)
   - Mixed (admin + client areas)

2. **Who are the users?** Map to roles:
   - `owner` — Full control, sees everything
   - `admin` — Manages users and configuration
   - `member` — Creates and edits records (employees, staff)
   - `viewer` — Read-only access (clients, external users)
   - `public` — No login required (landing page, catalog)

3. **Does each role see a different UI?**
   - Same UI, different permissions (hide buttons, disable actions)
   - Completely different layouts per role (e.g., admin dashboard vs client portal)
   - Public pages + authenticated area

#### Round 2: Functionality

4. **For each entity, what operations does the UI expose?**

   | Entity | Public View | List | Create | Edit | Delete | Detail |
   |--------|-------------|------|--------|------|--------|--------|
   | pacientes | no | yes | yes | yes | no | yes |
   | sesiones | no | yes | yes | yes | no | yes |
   | facturas | no | yes | no | no | no | yes |

5. **Any special views?**
   - Dashboard with KPIs/stats (e.g., "15 patients this month", "revenue: $45,000")
   - Calendar view for date-based entities (sessions, appointments)
   - Kanban board for status-based entities (jobs, tasks)
   - Reports or charts

6. **Search and filters?**
   - Global search across entities
   - Per-entity filters (by status, date range, category)
   - Saved filters / presets

#### Round 3: Authentication & Access

7. **Authentication flow:**
   - No auth (fully public)
   - Login only (no self-registration, admin creates users)
   - Login + self-registration (users sign up themselves)
   - Login + self-registration + email verification

8. **API access model:**
   - Tenant user tokens (users get session tokens via login)
   - Admin API key (for server-to-server or internal tools)
   - Both (admin backend + user frontend)

9. **User management in UI?**
   - Admin can create/manage users from the UI
   - Users manage their own profile
   - No user management (handled externally)

#### Round 4: Style & Layout

10. **Visual style:**
    - Minimal/clean (whitespace, simple typography)
    - Professional/corporate (structured, formal)
    - Modern/colorful (gradients, bold colors)
    - Dark mode default
    - Match an existing brand (provide colors/logo)

11. **Layout pattern:**
    - Sidebar navigation (admin panels — most common)
    - Top navbar + content (simpler apps)
    - Landing page + app area (public + authenticated)

12. **Responsive?**
    - Desktop only
    - Desktop + mobile (responsive)
    - Mobile-first

13. **Language:**
    - Spanish only
    - English only
    - Bilingual (Spanish + English with language switcher)

### Step 3: Generate UI Spec

Write `.planning/UI-SPEC.md`:

```markdown
# UI Specification

## Objective
{What the UI does and for whom}

## Users & Roles

| Role | Access | Description |
|------|--------|-------------|
| owner | Full | App owner, full CRUD + user management |
| admin | Management | Manages records and users |
| member | CRUD | Creates and edits data |
| viewer | Read-only | Views data, no modifications |
| public | Public pages | No login, sees public content |

## Pages

### Public Pages (no auth)
| Page | Route | Description |
|------|-------|-------------|
| Landing | `/` | App landing page |
| Login | `/login` | Login form |
| Register | `/register` | Self-registration (if enabled) |

### Authenticated Pages
| Page | Route | Roles | Description |
|------|-------|-------|-------------|
| Dashboard | `/app` | all | KPIs and quick actions |
| Pacientes | `/app/pacientes` | owner, admin, member | List + CRUD |
| Paciente Detail | `/app/pacientes/:id` | owner, admin, member | Detail + related records |
| Sesiones | `/app/sesiones` | all | List + CRUD |
| Facturas | `/app/facturas` | owner, admin | List + view only |
| Users | `/app/users` | owner, admin | User management |
| Profile | `/app/profile` | all | Own profile |

## Entity → UI Mapping

| Entity | List | Create | Edit | Delete | Detail | Roles |
|--------|------|--------|------|--------|--------|-------|
| pacientes | DataGrid | DynamicForm | DynamicForm | confirm | RecordDetail | owner, admin, member |
| sesiones | DataGrid | DynamicForm | DynamicForm | no | RecordDetail | all |
| facturas | DataGrid | no | no | no | RecordDetail | owner, admin |

## Authentication
- **Method:** Tenant user tokens via `/api/auth/tenant/login`
- **Self-registration:** {yes/no}
- **Session storage:** httpOnly cookie / localStorage
- **Token refresh:** automatic on 401

## Style
- **Theme:** {minimal/professional/modern/dark}
- **Layout:** {sidebar/topnav/landing+app}
- **Colors:** {primary, accent, background}
- **Responsive:** {yes/no}
- **Language:** {es/en/both}

## Dashboard KPIs
| KPI | Source | Query |
|-----|--------|-------|
| Total pacientes | query_records(pacientes, limit:1) | pagination.total |
| Sesiones este mes | query_records(sesiones, filters:{fecha>=month_start}) | count |
| Facturacion total | query_records(facturas, filters:{estado=pagada}) | sum(total) |

## Navigation Structure
{Describe the sidebar/navbar items and their hierarchy}
```

---

## Mode: INFER — "La IA Sabe"

### Purpose

Fast-track mode. The user provides a short description and the AI infers **everything**: objective, roles, auth, pages, CRUD permissions, style, layout, KPIs, and navigation. No questions asked. The AI uses domain knowledge + the actual tenant data model to make smart defaults.

### When to Use

- User wants to move fast and trusts the AI's judgment
- The app domain is well-understood (clinic, store, school, etc.)
- User will review the output and adjust, rather than answer 13 questions upfront

### Command

```
/fyso-ui infer "Panel admin para consultorio de fonoaudiologia"
/fyso-ui infer "Portal de clientes para estudio contable"
/fyso-ui infer "Catalogo publico de productos con area de admin"
```

### Process

#### Step 1: Load Everything (silent, no questions)

Read ALL available context:

1. `.planning/PROJECT.md` — app domain, core value
2. `.planning/REQUIREMENTS.md` — entities, rules, relations
3. `.planning/STATE.md` — current entities, what's published
4. Query tenant via MCP:
   ```
   select_tenant → list_entities → get_entity_schema (for each)
   list_business_rules (for each entity)
   ```

#### Step 2: Analyze the Domain

From the entity names, field types, and relations, infer:

| Signal | Inference |
|--------|-----------|
| Entity names are Spanish | Language = Spanish |
| Entities like "pacientes", "sesiones", "profesionales" | Medical/therapy domain |
| Entities like "productos", "pedidos", "clientes" | E-commerce/retail domain |
| Entities like "alumnos", "materias", "notas" | Education domain |
| Entities like "empleados", "asistencia", "nomina" | HR domain |
| Entity with `estado` field (status) | Kanban or status filters |
| Entity with `fecha` field (date) | Calendar view candidate |
| Entity with `monto`/`total`/`precio` | Financial KPI candidate |
| Entity A has relation → Entity B | B is parent, A is detail. B detail page shows A list |
| Entity has `activo` boolean | Active/inactive filter |
| Presence of `facturas`/`pagos` | Revenue dashboard KPI |
| No `usuarios` entity | Auth via Fyso tenant users (built-in) |

#### Step 3: Apply Smart Defaults

Use a decision matrix based on the description + domain:

| Decision | Internal Admin Panel | Client Portal | Public Site | Mixed |
|----------|---------------------|---------------|-------------|-------|
| **Keyword triggers** | "panel", "admin", "gestion", "interno" | "portal", "clientes", "mis datos" | "catalogo", "publico", "sitio" | "portal + admin", "publico + gestion" |
| **Layout** | Sidebar | Sidebar or TopNav | Landing + App | Landing + App (with sidebar for admin) |
| **Auth** | Login only, no self-reg | Login + self-registration | No auth (public) or optional login | Mixed |
| **Roles** | owner, admin, member | owner, admin, viewer (client) | public (+ admin internally) | owner, admin, member, viewer, public |
| **Style** | Professional | Modern | Modern/Minimal | Modern |
| **Responsive** | Desktop + mobile | Desktop + mobile | Mobile-first | Desktop + mobile |
| **User mgmt** | Admin creates users | Self-register + admin manages | No users | Both |

**CRUD inference per entity:**

| Entity Type | Default CRUD |
|-------------|-------------|
| Parent entity (patients, clients, products) | List, Create, Edit, Detail. Delete only for owner/admin |
| Detail entity (sessions, orders, invoices) | List, Create, Edit, Detail. Created from parent detail page |
| Reference entity (categories, statuses, types) | List, Create, Edit. Admin only |
| Read-only entity (logs, audit trails) | List, Detail only |
| Entities with `total`/`monto` | No create/edit from UI if calculated by rules |

**Dashboard KPI inference:**

| Domain Signal | KPI |
|---------------|-----|
| Count of parent entities | "Total {entity}: {count}" |
| Entity with date field | "{entity} este mes: {count}" |
| Entity with money field | "Facturacion: ${sum}" |
| Entity with status field | "{count} pendientes / {count} completados" |
| Entity with boolean `activo` | "{count} activos" |

#### Step 4: Generate All Artifacts at Once

Generate in sequence, without stopping to ask:

1. **`UI-SPEC.md`** — Complete spec with all inferred decisions
2. **`UI-MOCKUPS.md`** — ASCII wireframes for every page
3. **`UI-CONTRACTS.md`** — Full API contracts

#### Step 5: Present Summary for Validation

After generating all 3 documents, present a concise summary:

```
## La IA infirió lo siguiente:

**Tipo de app:** Panel admin interno
**Dominio:** Consultorio de fonoaudiología
**Idioma:** Español

**Roles:**
- owner: Todo (CRUD + usuarios + config)
- admin: Gestión (CRUD + usuarios)
- member: Operativo (CRUD de pacientes y sesiones)

**Páginas (7):**
- Dashboard: 3 KPIs (pacientes activos, sesiones este mes, facturado)
- Pacientes: Lista + crear + editar + detalle (con sesiones y facturas)
- Sesiones: Lista + crear + editar + detalle
- Facturas: Lista + detalle (solo lectura, generadas por regla)
- Profesionales: Lista + crear + editar
- Usuarios: Gestión (solo admin+)
- Perfil: Datos propios

**Auth:** Login con usuario de tenant, sin auto-registro
**Layout:** Sidebar, responsive
**Estilo:** Professional

¿Quieres que ajuste algo antes de generar el código?
```

The user can:
- Say "change X" → adjust and regenerate the affected doc
- Say "I want to review the mockups" → show detailed mockups
- Say "ok" / approve → do NOT proceed to build automatically (see below)

#### Step 6: Check backend status before suggesting build

After the user approves the UI design, check whether the backend is ready:

```
select_tenant → list_entities
```

Compare the published entities against the entities listed in UI-SPEC.md.

**If all entities are published:**
```
✅ UI diseñada y backend listo.

Próximo paso:
  /fyso:ui build — generar el frontend
```

**If entities are missing or not published:**
```
⏳ UI diseñada. Falta construir el backend primero.

Entidades requeridas por la UI:       Publicadas en tenant:
  - pacientes                           ✅ pacientes
  - sesiones                            ❌ sesiones (no existe)
  - facturas                            ❌ facturas (no existe)

Construí el backend primero:
  /fyso:build phase 2   → sesiones + facturas

Cuando termines, volvé con:
  /fyso:ui build
```

Never suggest `/fyso:ui build` if the backend is not ready.

### Inference Quality Rules

1. **Never guess entity fields.** Always query the real tenant to get actual schemas.
2. **Prefer restrictive permissions.** Default to less access, not more. Viewer can't edit. Member can't delete. Only owner/admin manage users.
3. **Follow the domain.** A medical app should look professional, not colorful. An e-commerce app should be modern with product images. A school app can be clean and minimal.
4. **Dashboard shows what matters.** For a clinic: patients, sessions this month, revenue. For a store: products, orders today, sales. For a school: students, classes, attendance.
5. **Relations drive navigation.** If `sesiones` belongs to `pacientes`, the paciente detail page shows sesiones. Don't create a separate sesiones page unless it makes sense to see all sessions across patients.
6. **Rules drive read-only.** If a business rule auto-calculates `factura.total`, don't let users edit that field in the form.
7. **Present confidence.** Be explicit about what you inferred vs what you assumed. Let the user course-correct easily.

---

## Mode: MOCKUP — ASCII Wireframe Validation

### Purpose

Before writing code, validate the layout with the user via ASCII mockups. This prevents expensive rework.

### Process

1. Read `.planning/UI-SPEC.md`
2. Generate ASCII mockup for each unique page type
3. Present to user for approval
4. Iterate until approved
5. Save approved mockups to `.planning/UI-MOCKUPS.md`

### Mockup Format

Use ASCII art that clearly shows layout, navigation, and content areas:

```
┌─────────────────────────────────────────────────────────────┐
│  Logo   Mi Consultorio                    [Juan] [Logout]   │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│ Dashboard│  Dashboard                                       │
│ ─────────│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│ Pacientes│  │ 127      │ │ 43       │ │ $450,000 │        │
│ Sesiones │  │ Pacientes│ │ Sesiones │ │ Facturado│        │
│ Facturas │  │ activos  │ │ este mes │ │ este mes │        │
│          │  └──────────┘ └──────────┘ └──────────┘        │
│ ─────────│                                                  │
│ Usuarios │  Proximas sesiones                               │
│ Perfil   │  ┌───────────────────────────────────────────┐  │
│          │  │ Fecha  │ Paciente     │ Prof.   │ Estado  │  │
│          │  │ 25/02  │ Maria Garcia │ Lic.Ana │ Confirm │  │
│          │  │ 25/02  │ Pedro Lopez  │ Lic.Ana │ Pend.   │  │
│          │  │ 26/02  │ Laura Diaz   │ Lic.Ana │ Prog.   │  │
│          │  └───────────────────────────────────────────┘  │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────┐
│  Logo   Mi Consultorio                    [Juan] [Logout]   │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│ Dashboard│  Pacientes                    [+ Nuevo Paciente] │
│ ─────────│  ┌─────────────────────────────────────────────┐│
│ Pacientes│  │ [Buscar...]           [Filtro: Activos ▾]   ││
│ > Lista  │  ├─────────────────────────────────────────────┤│
│ Sesiones │  │ Nombre       │ DNI      │ O.Social │ Tel    ││
│ Facturas │  │──────────────│──────────│──────────│────────││
│          │  │ Maria Garcia │ 30123456 │ OSDE     │ 11-... ││
│ ─────────│  │ Pedro Lopez  │ 28456789 │ Swiss    │ 11-... ││
│ Usuarios │  │ Laura Diaz   │ 35789012 │ Galeno   │ 11-... ││
│ Perfil   │  ├─────────────────────────────────────────────┤│
│          │  │ Mostrando 1-10 de 127    [< Prev] [Next >] ││
│          │  └─────────────────────────────────────────────┘│
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

Generate mockups for:
- Dashboard (landing after login)
- Each entity list page
- Entity detail page (with related records)
- Create/edit form (if applicable)
- Login page
- Register page (if self-registration)
- User management page (if admin manages users)
- Mobile view of key pages (if responsive)

---

## Mode: CONTRACTS — API & Auth Documentation

### Purpose

Document everything needed to connect the UI to the backend: API endpoints, auth flows, data shapes, and role permissions.

### Process

1. Read `.planning/UI-SPEC.md` and `.planning/REQUIREMENTS.md`
2. Query the real tenant to get actual entity schemas
3. Generate `.planning/UI-CONTRACTS.md`

### Contract Document Structure

Write `.planning/UI-CONTRACTS.md`:

```markdown
# UI → API Contracts

## Base Configuration

| Key | Value |
|-----|-------|
| API URL | `https://{host}/api` |
| Tenant ID | `{tenant-slug}` |
| Auth mode | Tenant user tokens |
| Token header | `X-API-Key: {token}` + `X-Tenant-ID: {slug}` |

## Authentication Endpoints

### Login
```
POST /api/auth/tenant/login
Headers: X-Tenant-ID: {slug}
Body: { email, password }
Response: { token, user: { id, email, name, role } }
```

### Register (if self-registration)
```
POST /api/auth/tenant/register
Headers: X-Tenant-ID: {slug}
Body: { email, password, name }
Response: { token, user: { id, email, name, role } }
```

### Logout
```
POST /api/auth/tenant/logout
Headers: X-API-Key: {token}, X-Tenant-ID: {slug}
```

### Current User
```
GET /api/auth/tenant/me
Headers: X-API-Key: {token}, X-Tenant-ID: {slug}
Response: { id, email, name, role, permissions }
```

## Data Endpoints

### {Entity Name}

**Schema:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| nombre | text | yes | — |
| email | email | no | — |
| ...

**List:**
```
GET /api/entities/{entity}/records?page=1&limit=20&sort=name&order=asc
Headers: X-API-Key: {token}, X-Tenant-ID: {slug}
Response: { data: Record[], total, page, limit, totalPages }
```

**Get One:**
```
GET /api/entities/{entity}/records/{id}
Response: { id, entityId, name, data: { ...fields }, createdAt, updatedAt }
```

**Create:**
```
POST /api/entities/{entity}/records
Body: { field1: value1, field2: value2 }
Response: { id, data: { ...fields } }
```

**Update:**
```
PUT /api/entities/{entity}/records/{id}
Body: { field1: newValue }
Response: { id, data: { ...fields } }
```

**Delete:**
```
DELETE /api/entities/{entity}/records/{id}
Response: { success: true }
```

## Role → Permission Matrix

| Action | owner | admin | member | viewer | public |
|--------|-------|-------|--------|--------|--------|
| View dashboard | yes | yes | yes | yes | no |
| List pacientes | yes | yes | yes | yes | no |
| Create paciente | yes | yes | yes | no | no |
| Edit paciente | yes | yes | yes | no | no |
| Delete paciente | yes | yes | no | no | no |
| Manage users | yes | yes | no | no | no |
| View own profile | yes | yes | yes | yes | no |

## API Keys & Tokens

| Type | Scope | TTL | Storage |
|------|-------|-----|---------|
| Admin API key | All tenants, all operations | Permanent | Server env only |
| User session token | Single tenant, role-based | 7 days | httpOnly cookie |
| OAuth access token | MCP operations | 1 hour | Memory |

## User Levels

| Level | How created | Permissions |
|-------|-------------|-------------|
| Owner | First admin or platform admin | Everything |
| Admin | Created by owner | Manage users + all CRUD |
| Member | Created by admin or self-register | CRUD on assigned entities |
| Viewer | Created by admin or self-register | Read-only |

## Error Handling

| Code | HTTP | UI Action |
|------|------|-----------|
| UNAUTHORIZED | 401 | Redirect to /login |
| FORBIDDEN | 403 | Show "no permission" message |
| NOT_FOUND | 404 | Show "not found" page |
| VALIDATION_ERROR | 400 | Show field-level errors on form |
| BUSINESS_RULE_ERROR | 400 | Show rule error message as toast |
```

---

## Mode: BUILD — Generate the UI

### Prerequisites Check (mandatory, run before generating any code)

Before writing a single line of frontend code, verify:

**1. Design docs exist:**
- `.planning/UI-SPEC.md` → if missing: `run /fyso:ui plan or /fyso:ui infer first`
- `.planning/UI-MOCKUPS.md` → if missing: `run /fyso:ui mockup first`
- `.planning/UI-CONTRACTS.md` → if missing: `run /fyso:ui contracts first`

**2. Backend is built — query the tenant:**
```
select_tenant → list_entities
```
Cross-reference with every entity listed in UI-SPEC.md. If any entity is missing or not published, STOP and tell the user:

```
🚫 No se puede construir el frontend todavía.

Entidades faltantes en el tenant:
  - {entity_name} (requerida por UI-SPEC.md, no publicada)

Construí el backend primero:
  /fyso:build phase N

Cuando todas las entidades estén publicadas, volvé con:
  /fyso:ui build
```

Only proceed to generate code when **both** conditions are fully met.

### Technology Stack

The generated UI uses:
- **Framework:** Astro (file-based routing, island architecture)
- **React integration:** `@astrojs/react` for interactive components
- **Styling:** Tailwind CSS (`@astrojs/tailwind`)
- **API:** Direct Fyso REST API calls — no `@fyso/ui` library dependency
- **Routing:** File-based routing via Astro pages (`src/pages/`)
- **State:** React context for auth + custom hooks for data fetching
- **Icons:** Lucide React

**Do NOT use `@fyso/ui`.** Generate custom components that call the Fyso API directly:
```ts
// src/lib/api.ts
const BASE = import.meta.env.PUBLIC_API_URL   // e.g. https://app.fyso.dev
const TENANT = import.meta.env.PUBLIC_TENANT  // tenant slug

async function apiFetch(path: string, options: RequestInit = {}, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': TENANT,
      ...(token ? { 'X-API-Key': token } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) throw await res.json()
  return res.json()
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch('/api/auth/tenant/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: (token: string) => apiFetch('/api/auth/tenant/me', {}, token),
  list: (entity: string, token: string, params = '') =>
    apiFetch(`/api/entities/${entity}/records?${params}`, {}, token),
  get: (entity: string, id: string, token: string) =>
    apiFetch(`/api/entities/${entity}/records/${id}`, {}, token),
  create: (entity: string, data: object, token: string) =>
    apiFetch(`/api/entities/${entity}/records`, { method: 'POST', body: JSON.stringify(data) }, token),
  update: (entity: string, id: string, data: object, token: string) =>
    apiFetch(`/api/entities/${entity}/records/${id}`, { method: 'PUT', body: JSON.stringify(data) }, token),
  remove: (entity: string, id: string, token: string) =>
    apiFetch(`/api/entities/${entity}/records/${id}`, { method: 'DELETE' }, token),
}
```

### Generation Steps

#### Step 1: Create project structure

```
{app-name}/
├── astro.config.mjs            # Astro config (@astrojs/react + @astrojs/tailwind)
├── tailwind.config.mjs
├── package.json
├── public/                     # Static assets (logo, favicon)
└── src/
    ├── pages/                  # File-based routing (Astro pages)
    │   ├── index.astro         # Landing / redirect to /app
    │   ├── login.astro         # Login page
    │   ├── register.astro      # Registration (if enabled)
    │   └── app/
    │       ├── index.astro     # Dashboard
    │       ├── users.astro     # User management (admin+)
    │       ├── profile.astro   # Own profile
    │       └── {entity}/
    │           ├── index.astro # Entity list
    │           ├── new.astro   # Create form
    │           └── [id].astro  # Entity detail + edit
    ├── layouts/
    │   ├── AppLayout.astro     # Sidebar + content layout (wraps authenticated pages)
    │   └── PublicLayout.astro  # Minimal layout for public pages
    ├── components/
    │   ├── auth/
    │   │   ├── AuthProvider.tsx    # Auth context + token management — React
    │   │   ├── LoginForm.tsx       # Login form — React island
    │   │   ├── RegisterForm.tsx    # Registration form — React island
    │   │   └── useAuth.ts          # useAuth() hook
    │   ├── layout/
    │   │   ├── Sidebar.tsx         # Navigation sidebar — React island
    │   │   └── TopBar.tsx          # Header with user menu + logout — React island
    │   ├── ui/
    │   │   ├── Table.tsx           # Generic data table with pagination
    │   │   ├── Form.tsx            # Generic form with field rendering
    │   │   ├── Modal.tsx           # Confirmation dialog
    │   │   ├── Toast.tsx           # Success/error notifications
    │   │   └── KpiCard.tsx         # Dashboard metric card
    │   └── pages/
    │       ├── Dashboard.tsx       # Dashboard with KPIs — React
    │       ├── EntityList.tsx      # Entity list + search + pagination
    │       ├── EntityDetail.tsx    # Entity detail with related records
    │       ├── EntityForm.tsx      # Create/edit form with validation
    │       ├── UserManagement.tsx  # Admin: list + create + edit users
    │       └── Profile.tsx         # Own profile page
    ├── lib/
    │   ├── api.ts              # API client (createFysoClient wrapper)
    │   ├── config.ts           # API URL, tenant slug
    │   └── roles.ts            # Permission helpers
    └── styles/
        └── global.css          # Tailwind base + theme tokens
```

**`astro.config.mjs`:**
```js
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwind from '@astrojs/tailwind'

export default defineConfig({
  integrations: [react(), tailwind()],
  output: 'static',   // or 'server' if SSR is needed
})
```

**Astro page pattern (e.g., `src/pages/app/pacientes/index.astro`):**
```astro
---
// Auth check is done client-side in the React island via AuthProvider
---
<AppLayout title="Pacientes">
  <EntityList client:only="react" entity="pacientes" />
</AppLayout>
```

Use `client:only="react"` for all interactive React islands (they use browser APIs and auth context).

#### Step 2: Generate each file

Follow the UI-SPEC for:
- Which pages to create
- Which entities appear in the sidebar
- Which operations are available per entity per role
- Dashboard KPI queries
- Auth flow (login, register, token storage)
- Style theme (colors, layout)

#### Step 3: Wire components to the Fyso API

All data goes through `src/lib/api.ts`. Components fetch data directly:

**Auth context (wraps every authenticated island):**
```tsx
// AuthProvider.tsx
const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem('fyso_token'))
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    if (token) api.me(token).then(setUser).catch(() => { setToken(null); localStorage.removeItem('fyso_token') })
  }, [token])

  const login = async (email: string, password: string) => {
    const { token: t, user: u } = await api.login(email, password)
    localStorage.setItem('fyso_token', t)
    setToken(t); setUser(u)
  }
  const logout = () => { localStorage.removeItem('fyso_token'); setToken(null); setUser(null) }

  return <AuthContext.Provider value={{ user, token, login, logout }}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)!
```

**Entity list with pagination:**
```tsx
// EntityList.tsx
export function EntityList({ entity }: { entity: string }) {
  const { token, user } = useAuth()
  const [records, setRecords] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    api.list(entity, token!, `page=${page}&limit=20`)
      .then(r => { setRecords(r.data); setTotal(r.total) })
  }, [entity, page, token])

  return (
    <div>
      <Table rows={records} onRowClick={...} />
      <Pagination page={page} total={total} onChange={setPage} />
    </div>
  )
}
```

**Create/edit form:**
```tsx
// EntityForm.tsx
export function EntityForm({ entity, id, fields }: FormProps) {
  const { token } = useAuth()
  const [data, setData] = useState<Record<string, unknown>>({})

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (id) await api.update(entity, id, data, token!)
    else await api.create(entity, data, token!)
  }

  return (
    <form onSubmit={handleSubmit}>
      {fields.map(f => <FormField key={f.key} field={f} value={data[f.key]} onChange={v => setData(d => ({...d, [f.key]: v}))} />)}
      <button type="submit">Guardar</button>
    </form>
  )
}
```

**Note:** Field definitions come from the entity schema — query `get_entity_schema` via MCP during `build` to embed the actual schema in the generated code.

#### Step 4: Role-based access

```tsx
function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" />
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <NoPermission />
  }
  return children
}
```

#### Step 5: Generate plans

For complex UIs, break the build into phases:

**Plan 1:** Project setup + auth flow (login, register, token management)
**Plan 2:** Layout (sidebar, topbar, routing)
**Plan 3:** Entity pages (list, detail, form) — one per entity or grouped
**Plan 4:** Dashboard with KPIs
**Plan 5:** User management + profile
**Plan 6:** Polish (responsive, error handling, loading states)

Each plan follows the standard `.planning/phases/` format with verification steps.

### Static Hosting Routing — CRITICAL

Fyso static hosting (`{subdomain}-sites.fyso.dev`) serves files exactly as uploaded. It does NOT process `_redirects` files or rewrite URLs.

**Problem with React SPA + BrowserRouter:**
- BrowserRouter uses `/dashboard` style URLs
- Static hosting only has `/index.html` — navigating directly to `/dashboard` returns 404
- `_redirects` files have no effect on Fyso hosting

**Why Astro avoids this problem:**
- Astro generates actual `index.html` files per route: `dist/app/index.html`, `dist/login/index.html`, etc.
- Each page is a real file — no client-side routing issues
- This is the primary reason to use Astro for Fyso deployments

**If generating a pure SPA (not Astro), always use HashRouter:**
```tsx
// ❌ Don't use — breaks on static hosting
import { BrowserRouter } from 'react-router-dom'

// ✅ Use this — /#/dashboard always serves / and browser handles the rest
import { HashRouter } from 'react-router-dom'
```

#### Step 6: Verify

After generating:
1. `bun install` in the generated project
2. `bun run dev` — verify Astro dev server starts (default: http://localhost:4321)
3. Check each page loads without errors
4. Test login flow (token stored in localStorage, auth context propagates)
5. Test CRUD operations on at least one entity
6. Test role-based access (login as different roles)
7. `bun run build` — verify static build completes cleanly

---

## Mode: AUDIT — Security, Domain & UX Audit

### Purpose

Scan the generated UI (code, specs, contracts) for problems across 5 dimensions: security, domain logic, permissions, data exposure, and UX. Produces a structured report with severity levels and actionable fixes.

### When to Use

- After `/fyso-ui build` to validate the generated code
- After `/fyso-ui infer` to verify the AI's decisions
- Periodically on any Fyso app with a frontend
- Before deploying to production

### Command

```
/fyso-ui audit              # Full audit (all dimensions)
/fyso-ui audit security     # Security only
/fyso-ui audit domain       # Domain logic only
/fyso-ui audit permissions  # Role/permission issues only
/fyso-ui audit ux           # UX/accessibility issues only
```

### Process

#### Step 1: Load Context

Read everything:

1. `.planning/UI-SPEC.md` — what was intended
2. `.planning/UI-CONTRACTS.md` — what API contracts were documented
3. `.planning/UI-MOCKUPS.md` — what was approved
4. Actual generated code (all `.astro`, `.tsx`, `.ts`, `.css` files)
5. Query tenant via MCP for real entity schemas and rules

#### Step 2: Run Audit Checks

### Dimension 1: SECURITY

| Check | What to Look For | Severity |
|-------|------------------|----------|
| **API key exposure** | Admin API key hardcoded in browser-accessible code | CRITICAL |
| **Token storage** | Tokens in localStorage without XSS mitigation | HIGH |
| **XSS vectors** | `dangerouslySetInnerHTML`, unescaped user input in JSX | CRITICAL |
| **CORS misconfiguration** | `Access-Control-Allow-Origin: *` on auth endpoints | HIGH |
| **Auth bypass** | Routes that skip `ProtectedRoute` wrapper | CRITICAL |
| **Sensitive data in URL** | Tokens, passwords, API keys in query strings | HIGH |
| **Missing HTTPS** | HTTP URLs for API endpoints in production config | MEDIUM |
| **Dependency vulnerabilities** | Known CVEs in package.json dependencies | HIGH |
| **Missing rate limiting** | Login endpoint without brute-force protection | MEDIUM |
| **Debug mode in prod** | `development: true`, console.log with sensitive data | MEDIUM |
| **Insecure defaults** | Default passwords, admin accounts without forced reset | HIGH |
| **CSRF protection** | Forms that POST without CSRF tokens (if using cookies) | HIGH |

**How to check:**
```
# Look for hardcoded API keys
Grep: pattern="(API_KEY|api_key|apiKey|X-API-Key).*=.*['\"]" in src/**/*.{ts,tsx,astro}
# Verify they reference env vars, not literal strings

# Look for XSS
Grep: pattern="dangerouslySetInnerHTML" in src/**/*.tsx

# Look for unprotected routes
Grep: pattern="<Route" in src/**/*.tsx
# Verify each route is either public (intended) or wrapped in ProtectedRoute

# Look for sensitive console.log
Grep: pattern="console\.(log|debug).*token|password|key|secret" in src/**/*.{ts,tsx,astro}
```

### Dimension 2: DOMAIN LOGIC

| Check | What to Look For | Severity |
|-------|------------------|----------|
| **Editable calculated fields** | Form allows editing fields computed by business rules | HIGH |
| **Missing required fields** | Form doesn't enforce fields marked required in schema | HIGH |
| **Wrong field types** | Date field rendered as text input, number as text | MEDIUM |
| **Orphan records** | Can delete parent without warning about child records | HIGH |
| **Missing validations** | Client-side validation doesn't match entity schema constraints | MEDIUM |
| **Stale data** | No refresh after create/update/delete operations | MEDIUM |
| **Missing relations** | Detail page doesn't show related child entities | LOW |
| **Wrong sort defaults** | List defaults to alphabetical when chronological makes more sense | LOW |
| **Missing status flows** | Status field allows any value change when domain has ordered flow | MEDIUM |
| **Currency/number format** | Money fields shown without proper formatting or currency symbol | LOW |

**How to check:**
```
# Get business rules that compute fields
MCP: list_business_rules for each entity → identify computed fields
# Check if DynamicForm renders those fields as editable

# Compare entity schema required fields vs form validation
MCP: get_entity_schema → required fields
Grep: form validation in EntityForm.tsx

# Check for cascade delete warnings
MCP: entity relations → find parent entities with children
Grep: delete handler in EntityList/EntityDetail
```

### Dimension 3: PERMISSIONS

| Check | What to Look For | Severity |
|-------|------------------|----------|
| **Viewer can modify** | Edit/delete buttons visible or functional for viewer role | CRITICAL |
| **Public sees private data** | Entity data accessible without authentication | CRITICAL |
| **Missing role check** | Component doesn't check user role before showing actions | HIGH |
| **Client-only enforcement** | Role check only in UI, not validated server-side | HIGH |
| **Privilege escalation** | User can access admin routes by typing URL directly | HIGH |
| **Owner-only actions exposed** | Delete/user-mgmt available to non-owner roles | MEDIUM |
| **Missing per-entity permissions** | All entities share same permission set when they shouldn't | MEDIUM |
| **Token reuse across tenants** | Token from tenant A works on tenant B | CRITICAL |
| **Self-role-elevation** | User profile page allows changing own role | CRITICAL |
| **Stale permissions** | UI caches role from login, doesn't re-check on sensitive operations | MEDIUM |

**How to check:**
```
# Map every action button/link to its role guard
Grep: pattern="canPerform|hasRole|allowedRoles|role" in src/**/*.tsx
# Verify every create/edit/delete action checks role

# Check route protection
Read: App.tsx or router file
# Verify every /app/* route has ProtectedRoute with correct allowedRoles

# Check that user profile can't change own role
Read: Profile.tsx
# Verify role field is read-only or not shown in edit form
```

### Dimension 4: DATA EXPOSURE

| Check | What to Look For | Severity |
|-------|------------------|----------|
| **Over-fetching** | API calls return more fields than displayed (sensitive data in payload) | MEDIUM |
| **System fields visible** | Internal IDs, entityId, timestamps shown to end users | LOW |
| **PII in logs** | User email, name, or data logged to browser console | HIGH |
| **Sensitive data in error messages** | Stack traces, SQL errors, internal paths shown to users | HIGH |
| **Cache poisoning** | Sensitive data cached in browser that persists after logout | MEDIUM |
| **Export without filtering** | Export/download includes fields the user shouldn't see | HIGH |
| **Search returns too much** | Global search exposes records from entities user can't access | HIGH |
| **Relation data leak** | Viewing entity A reveals data from related entity B that user can't access | MEDIUM |

**How to check:**
```
# Check what's displayed vs what's fetched
Read: EntityList.tsx, EntityDetail.tsx
# Compare displayed columns/fields with API response shape

# Check error handling
Grep: pattern="catch|\.catch|error" in src/**/*.tsx
# Verify errors don't expose internal details

# Check logout cleanup
Read: AuthProvider.tsx
# Verify logout clears all stored data (tokens, cached records, user info)
```

### Dimension 5: UX & ACCESSIBILITY

| Check | What to Look For | Severity |
|-------|------------------|----------|
| **Missing loading states** | No spinner/skeleton during API calls | LOW |
| **No empty states** | Blank page when entity has no records | LOW |
| **Missing error feedback** | API errors silently swallowed, user doesn't know what failed | MEDIUM |
| **Form loses data** | Navigate away from unsaved form without warning | MEDIUM |
| **No keyboard navigation** | Can't tab through forms, can't press Enter to submit | LOW |
| **Missing labels** | Input fields without `<label>` or `aria-label` | MEDIUM |
| **Color contrast** | Text unreadable on background (< 4.5:1 ratio) | MEDIUM |
| **Mobile unusable** | Table overflows, buttons too small for touch | MEDIUM |
| **No confirmation on delete** | Delete action has no "Are you sure?" dialog | HIGH |
| **Success feedback missing** | Create/edit/delete succeeds but user gets no confirmation | MEDIUM |
| **Pagination absent** | Entity with 1000+ records loads all at once | HIGH |
| **No back navigation** | Detail/form pages have no way to go back | LOW |

#### Step 3: Generate Audit Report

Write `.planning/UI-AUDIT.md`:

```markdown
# UI Audit Report: {App Name}

**Date:** {date}
**Audited:** {what was audited — code, specs, or both}
**Mode:** {full / security / domain / permissions / ux}

## Summary

| Dimension | Critical | High | Medium | Low | Pass |
|-----------|----------|------|--------|-----|------|
| Security | {n} | {n} | {n} | {n} | {n}/{total} |
| Domain Logic | {n} | {n} | {n} | {n} | {n}/{total} |
| Permissions | {n} | {n} | {n} | {n} | {n}/{total} |
| Data Exposure | {n} | {n} | {n} | {n} | {n}/{total} |
| UX & A11y | {n} | {n} | {n} | {n} | {n}/{total} |
| **TOTAL** | **{n}** | **{n}** | **{n}** | **{n}** | **{n}/{total}** |

## Critical Issues (fix before deploy)

### [SECURITY] {Issue title}
- **File:** `src/lib/config.ts:5`
- **Problem:** Admin API key hardcoded in client-side code
- **Risk:** Anyone can inspect browser DevTools and get full admin access
- **Fix:**
  ```diff
  - const API_KEY = "sk-admin-abc123..."
  + // Use server-side proxy or tenant user tokens
  + // NEVER put admin keys in browser code
  ```
- **Effort:** 15 min

### [PERMISSIONS] {Issue title}
- **File:** `src/pages/EntityList.tsx:42`
- **Problem:** Delete button rendered for all roles, no role check
- **Risk:** Viewers can delete records
- **Fix:**
  ```diff
  - <DeleteButton record={record} />
  + {canPerform(user.role, 'delete') && <DeleteButton record={record} />}
  ```
- **Effort:** 5 min

## High Issues (fix before release)

### [DOMAIN] {Issue title}
...

## Medium Issues (fix soon)

### [UX] {Issue title}
...

## Low Issues (nice to have)

### [UX] {Issue title}
...

## Passed Checks

- ✅ [SECURITY] No XSS vectors found
- ✅ [SECURITY] All routes properly protected
- ✅ [PERMISSIONS] Role hierarchy correctly implemented
- ✅ [DOMAIN] All required fields enforced in forms
- ✅ [UX] Loading states present on all data-fetching pages
...

## Recommendations

1. **Immediate:** Fix {n} critical issues before any deployment
2. **Short-term:** Address {n} high issues before user-facing release
3. **Ongoing:** Set up automated security scanning in CI
```

#### Step 4: Present Results

Show the summary table and critical/high issues inline. For the full report, reference the file.

```
## Audit Results

| Dim. | CRIT | HIGH | MED | LOW |
|------|------|------|-----|-----|
| Security | 1 | 2 | 1 | 0 |
| Domain | 0 | 1 | 2 | 1 |
| Permissions | 1 | 0 | 1 | 0 |
| Data Exposure | 0 | 1 | 1 | 0 |
| UX | 0 | 1 | 3 | 2 |

**2 Critical issues found:**

1. [SECURITY] Admin API key in client code → `src/lib/config.ts:5`
2. [PERMISSIONS] Delete button visible to viewer → `src/pages/EntityList.tsx:42`

Full report: `.planning/UI-AUDIT.md`

¿Quieres que arregle los issues críticos y altos automáticamente?
```

If the user says yes, fix each issue, commit, and re-run the specific checks to verify the fixes.

### Audit Scope by Subcommand

| Subcommand | Dimensions | Checks |
|------------|------------|--------|
| `audit` (full) | All 5 | All checks |
| `audit security` | Security only | API keys, XSS, auth bypass, CORS, HTTPS, deps |
| `audit domain` | Domain only | Calculated fields, validations, relations, flows |
| `audit permissions` | Permissions only | Role guards, route protection, escalation, data scope |
| `audit ux` | UX + A11y only | Loading, errors, keyboard, contrast, mobile |

---

## Reference

- `FYSO-REFERENCE.md` — Consolidated reference (all Fyso concepts in one file — read this first)
- For deep dives:
  - `reference/auth-patterns.md` — Authentication flow patterns (4 patterns + token strategies)
  - `reference/ui-patterns.md` — Common UI patterns and components (layouts, pages, mobile, styles)
  - `reference/fyso-ui-components.md` — @fyso/ui component API reference (DataGrid, DynamicForm, RecordDetail)

## After Completion

```
UI generation complete!

Created:
  - {N} Astro pages ({list of pages})
  - {N} entity views (EntityList + EntityForm + EntityDetail)
  - Auth flow: login {+ register} with localStorage token
  - Role-based access: {list of roles}
  - Dashboard with {N} KPIs
  - Direct Fyso API integration (no @fyso/ui dependency)

Project: {app-name}/
Start: cd {app-name} && bun install && bun run dev
URL: http://localhost:4321

Build: bun run build → dist/

Next steps:
  - /fyso:release deploy to publish to sites.fyso.dev
  - Customize styles in src/styles/global.css
  - Add custom pages in src/pages/
```
