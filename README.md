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
| **`fee_records`** | Monthly platform billing statements (`shop_id`, `month`, `amount`, `status`, `disputed_until`) |
| **`payments`** | Platform fee settlement records (UPI, cards, transaction refs) |
| **`notifications`** | Real-time user queue & billing alerts |
| **`support_tickets`** | Platform customer and shop support ticketing |
| **`audit_logs`** | Tamper-evident administrative and security audit trail |

---

## 🔑 Pre-Configured Login Credentials

All seed accounts are pre-configured in [supabase/seed.sql](file:///d:/my-first-website/hair%20cut%20app/supabase/seed.sql) with the default password: **`Password123!`**

| Portal / App | Email | Password | Role | Assigned Shop / Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Platform Admin** (`/apps/admin`) | `admin@quickcut.com` | `Password123!` | `admin` | Global platform moderation & fee settlement |
| **Shop Owner** (`/apps/owner`) | `owner.alex@quickcut.com` | `Password123!` | `owner` | Crown & Blade Barbershop (Approved) |
| **Staff App** (`/apps/staff`) | `staff.sam@quickcut.com` | `Password123!` | `staff` | Crown & Blade Barbershop (Queue & QR scanner) |
| **Customer App** (`/apps/customer`) | `customer.rahul@quickcut.com` | `Password123!` | `customer` | In-service ticket #101 |
| **Customer App** (`/apps/customer`) | `customer.priya@quickcut.com` | `Password123!` | `customer` | Waiting queue ticket #102 |

---

## 🔒 Row Level Security (RLS) Matrix

RLS is strictly enabled on **all 11 tables**:

- **Customers**:
  - Can only view and update their own profile (`id = auth.uid()`).
  - Can view approved shops and active services/barbers.
  - Can only view and cancel their own queue entries (`customer_id = auth.uid()`).
  - Cannot see other customers' personal details or shop financial fee records.
- **Staff**:
  - Can view and manage queue entries **only for their assigned shop** (`is_shop_staff(shop_id)`).
  - Can perform QR check-in verification, seat customers (`in_service`), and mark completions.
  - Cannot access owner monthly financial statements or platform administration.
- **Owners**:
  - Can manage only their own shops (`owner_id = auth.uid()`), catalog services, and barbers.
  - Can view live queue entries, monthly billing records (`fee_records`), and file disputes within the dispute window.
  - Cannot approve their own shops (must be approved by admin).
- **Admins**:
  - Full read/write access across all tables via `is_admin()` security definer function.

---

## 💼 Platform Fee & Billable Invariant

### The Billable Rule:
A queue entry is **billable** if and only if **all** of the following conditions are met:
1. **Customer QR check-in exists** (`checked_in_at IS NOT NULL`)
2. **Staff completion exists** (`completed_at IS NOT NULL` and `status = 'completed'`)
3. **Not a walk-in** (`is_walkin = false`)
4. **Not cancelled or marked no-show**

### Fee Calculation:
- **Rate**: **₹5.00 INR** per billable service completion.
- Managed automatically by the database trigger: `trg_compute_queue_entry_billable` on `queue_entries`.
- Walk-ins (`is_walkin = true`) and app cancellations/no-shows are **strictly exempt** from the platform fee.

### Monthly Fee Records & Disputes:
- Aggregated monthly via `generate_monthly_fee_record(p_shop_id, p_month)`.
- Includes a **7-day dispute window** (`disputed_until = now() + interval '7 days'`).
- Owners can dispute invoice discrepancies directly in their dashboard before the window closes.

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
