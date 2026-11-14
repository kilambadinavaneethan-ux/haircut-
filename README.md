# QuickCut - Barber Shop Queue Management Platform

QuickCut is a multi-platform barber shop queue management monorepo designed to eliminate physical waiting lines in barber shops. It includes real-time mobile queues with QR check-in verification, dynamic wait time estimation, shop owner controls, and platform administration.

---

## 📁 Monorepo Architecture

```
/
├── apps/
│   ├── customer/       # Customer Mobile App (Expo React Native, Android target)
│   ├── staff/          # Staff / Barber Mobile App (Expo React Native, Android target)
│   ├── owner/          # Shop Owner Web Dashboard (React + TypeScript + Vite)
│   └── admin/          # Platform Admin Web Dashboard (React + TypeScript + Vite)
├── packages/
│   └── shared/         # Shared TypeScript domain types, Supabase client, utilities & business invariants
├── supabase/
│   ├── config.toml     # Supabase local environment config
│   ├── migrations/     # Versioned SQL migrations (Schema, RLS, Triggers & Functions)
│   │   ├── 20261022000001_initial_schema.sql
│   │   ├── 20261022000002_rls_policies.sql
│   │   └── 20261022000003_functions_and_triggers.sql
│   └── seed.sql        # Realistic seed data with mock profiles, shops, queue entries, fees
└── package.json        # Workspace orchestrator
```

---

## 🗄️ Database Tables & Schema

| Table | Description |
| :--- | :--- |
| **`profiles`** | User profiles extending Supabase auth (`customer`, `staff`, `owner`, `admin`) |
| **`shops`** | Barber shops (`pending`, `approved`, `suspended`) with GPS coordinates and hours |
| **`shop_staff`** | Maps staff profiles to their assigned barber shop |
| **`barbers`** | Barber stations / personnel roster per shop |
| **`services`** | Haircut & grooming services (`name`, `price`, `avg_minutes`, `is_active`) |
| **`queue_entries`** | Live queue tickets (`waiting`, `in_service`, `completed`, `cancelled`, `no_show`) |
| **`fee_records`** | Historical fee records table (deactivated under zero-fee platform model) |
| **`payments`** | Payment transaction history table |
| **`notifications`** | Real-time user queue & status alerts |
| **`support_tickets`** | Platform customer and shop support ticketing |
| **`audit_logs`** | Tamper-evident administrative and security audit trail |

---

## 🔑 Development Test Accounts

Pre-configured development and test accounts (configured via local [supabase/seed.sql](file:///d:/my-first-website/hair%20cut%20app/supabase/seed.sql)):

| Portal / App | Email | Role | Assigned Shop / Scope |
| :--- | :--- | :--- | :--- |
| **Platform Admin** (`/apps/admin`) | `admin@quickcut.com` | `admin` | Global platform administration & shop moderation |
| **Shop Owner** (`/apps/owner`) | `owner.alex@quickcut.com` | `owner` | Crown & Blade Barbershop (Approved) |
| **Staff App** (`/apps/staff`) | `staff.sam@quickcut.com` | `staff` | Crown & Blade Barbershop (Queue & QR arrival scanner) |
| **Customer App** (`/apps/customer`) | `customer.rahul@quickcut.com` | `customer` | Active ticket #101 |
| **Customer App** (`/apps/customer`) | `customer.priya@quickcut.com` | `customer` | Waiting queue ticket #102 |

> [!NOTE]
> For security, development account passwords should be managed via environment variables (`.env.local`) or generated via your local Supabase test seeds. Never commit production passwords or service-role keys to version control.

---

## 🔒 Row Level Security (RLS) Matrix

RLS is strictly enabled on **all 11 tables**:

- **Customers**:
  - Can only view and update their own profile (`id = auth.uid()`).
  - Can view approved shops and active services/barbers.
  - Can only view and cancel their own queue entries (`customer_id = auth.uid()`).
  - Cannot see other customers' personal details.
- **Staff**:
  - Can view and manage queue entries **only for their assigned shop** (`is_shop_staff(shop_id)`).
  - Can perform QR check-in verification, seat customers (`in_service`), and mark completions.
  - Cannot access platform administration.
- **Owners**:
  - Can manage only their own shops (`owner_id = auth.uid()`), catalog services, and barbers.
  - Can view live queue entries, completed haircut history, and shop statistics.
  - Cannot approve their own shops (must be approved by admin).
- **Admins**:
  - Full read/write access across all tables via `is_admin()` security definer function.

---

## 💼 Zero Platform Fee Model (₹0 Platform Fee)

QuickCut operates with **ZERO platform fees**:
- **Customer platform fee**: **₹0**
- **Barber shop platform fee**: **₹0**
- **Per-service commission**: **₹0**
- **Monthly platform subscription**: **₹0**

### Service Completion Workflow:
When a haircut service is completed:
1. The queue entry status updates from `in_service` to `completed`.
2. Completion timestamp `completed_at` is authoritatively recorded.
3. No platform fee, payment obligation, invoice, or commission is generated.
4. Barber shop owners retain 100% of their earnings from in-shop customer services.

---

## ⏱️ Dynamic Estimated Wait Time Formula

$$\text{Estimated Wait (minutes)} = \sum_{\text{entries ahead}} \text{avg\_minutes of services}$$

- **Entries ahead** include:
  1. All queue entries in the same shop currently `in_service`
  2. All queue entries with `status = 'waiting'` created prior to the customer's entry
- Exposed through both:
  - SQL function: `get_estimated_wait_time(target_queue_entry_id UUID)`
  - TypeScript utility: `calculateEstimatedWaitTime(...)` in `@quickcut/shared`
- **Estimate Disclaimer**: The UI clearly states that this is an estimate subject to service complexity.

---

## 🚀 How to Run Migrations & Seed the Database

### Option A: Using the Supabase CLI (Recommended)

1. **Install dependencies and initialize local Supabase**:
   ```bash
   npx supabase start
   ```

2. **Apply migrations and seed data**:
   ```bash
   npx supabase db reset
   ```
   *(This automatically executes migrations in order from `supabase/migrations/` and runs `supabase/seed.sql`)*.

3. **Check Supabase Studio**:
   Open [http://localhost:54324](http://localhost:54324) in your browser to inspect tables, RLS policies, and realtime publications.

---

### Option B: Using the Supabase Cloud Dashboard

1. Log into your project at [supabase.com](https://supabase.com).
2. Go to the **SQL Editor** in the left sidebar.
3. Open and run the migration files in this exact order:
   - `supabase/migrations/20261022000001_initial_schema.sql`
   - `supabase/migrations/20261022000002_rls_policies.sql`
   - `supabase/migrations/20261022000003_functions_and_triggers.sql`
4. Run `supabase/seed.sql` to populate initial mock data for immediate testing.

---

## 💻 Running the Applications

### 1. Build Shared Package First
```bash
npm run build:shared
```

### 2. Run Admin Dashboard (Web)
```bash
npm run dev:admin
# Runs on http://localhost:3002
```

### 3. Run Shop Owner Dashboard (Web)
```bash
npm run dev:owner
# Runs on http://localhost:3001
```

### 4. Run Customer Mobile App (Expo)
```bash
npm run dev:customer
# Press 'a' for Android emulator or scan QR with Expo Go on your Android device
```

### 5. Run Staff Mobile App (Expo)
```bash
npm run dev:staff
# Press 'a' for Android emulator or scan QR with Expo Go on your Android device
```
