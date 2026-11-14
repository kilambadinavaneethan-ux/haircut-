# QuickCut - Barber Shop Queue Management Platform

QuickCut is a high-reliability, real-time barber shop queue management monorepo engineered to eliminate physical waiting lines in barber shops. It provides real-time mobile customer queues, staff queue control with arrival QR check-in verification, dynamic multi-barber wait-time estimation, shop owner controls, and platform administration.

---

## 📁 Monorepo Architecture

```
/
├── apps/
│   ├── customer/       # Customer Mobile App (Expo React Native, Android & iOS target)
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
│   │   ├── 20261022000003_functions_and_triggers.sql
│   │   ├── 20261023000001_security_and_invariants_fix.sql
│   │   ├── 20261023000002_security_auth_roles_rls.sql
│   │   ├── 20261023000003_atomic_queue_and_transitions.sql
│   │   ├── 20261023000004_billing_and_payments.sql
│   │   ├── 20261024000001_remove_platform_fee.sql
│   │   ├── 20261024000002_fix_queue_aggregates_and_security.sql
│   │   ├── 20261024000003_qr_join_queue_and_security_hardening.sql
│   │   ├── 20261024000004_payment_and_audit_hardening.sql
│   │   ├── 20261024000005_storage_and_error_sanitization.sql
│   │   ├── 20261024000006_refined_wait_time_simulation.sql
│   │   └── 20261024000007_prevent_customer_self_checkin_and_discrete_sim.sql
│   ├── seed.sql        # Realistic development seed data (Strictly for local testing)
│   └── setup_all.sql   # Consolidated end-to-end idempotent deployment script
└── package.json        # Workspace orchestrator with multi-application validation scripts
```

---

## 🗄️ Database Tables & Schema

| Table | Description |
| :--- | :--- |
| **`profiles`** | User profiles extending Supabase auth (`customer`, `staff`, `owner`, `admin`) with strict column-level RLS |
| **`shops`** | Barber shops (`pending`, `approved`, `suspended`) with GPS coordinates, hours, and owner linkage |
| **`shop_staff`** | Maps staff profiles to their authorized barber shop |
| **`barbers`** | Active barber stations and personnel roster per shop |
| **`services`** | Haircut & grooming catalog (`name`, `price`, `avg_minutes`, `is_active`) |
| **`queue_entries`** | Real-time queue tickets (`waiting`, `in_service`, `completed`, `cancelled`, `no_show`) |
| **`shop_daily_counters`** | Row-locked daily counters for atomic, contiguous, collision-free queue numbering |
| **`fee_records`** | Historical billing archive table (deactivated under zero-fee platform model) |
| **`payments`** | Customer-to-shop service transaction records (cash, UPI, card payment receipts) |
| **`notifications`** | Real-time user queue, ticket, and status alerts |
| **`support_tickets`** | Platform customer and shop support ticketing |
| **`audit_logs`** | Append-only, tamper-evident administrative and security audit trail |

---

## 💼 Business Rule: Zero Platform Fee Model (₹0 Platform Fee)

QuickCut is completely free for customers and shop owners:

- **Customer platform fee**: **₹0**
- **Barber shop platform fee**: **₹0**
- **Per-service platform commission**: **₹0**
- **Monthly platform subscription**: **₹0**
- **Platform transaction fee**: **₹0**

### Service Completion Workflow:
1. When a barber completes a service, the queue entry transitions from `in_service` to `completed`.
2. The completion timestamp `completed_at` is authoritatively recorded.
3. No platform fee, payment obligation, invoice, or commission is generated.
4. Barber shops retain 100% of customer earnings.
5. **Customer-to-Shop Payments**: If customers pay shops for haircut services (cash, UPI, card), transaction records are safely logged in `public.payments` without platform deductions.

---

## 🔐 QR Security & Arrival Verification Architecture

To prevent queue fraud and queue hopping, physical presence verification is enforced:

1. **Cryptographic Token Generation**: When an authenticated user joins a queue via `join_queue()`, a server-generated 128-bit cryptographic UUID (`qr_code_token`) is generated authoritatively in PostgreSQL. Clients cannot forge or inject tokens.
2. **QR Check-In at the Shop**: Upon physical arrival at the barber shop, staff scan the customer's QR code.
3. **Arrival Verification (`verify_qr_checkin`)**:
   - Compares the cryptographic token or JSON payload.
   - Rejects simple queue numbers (`#101`), shop IDs, or truncated tokens.
   - Enforces a 24-hour expiration window.
   - Prevents cross-shop check-ins (tickets belong strictly to the assigned shop).
   - Acquires a row lock (`FOR UPDATE`) to prevent concurrent double-scans.
4. **Sanitized Error Messaging**: Invalid or expired QR attempts return uniform, sanitized error messages without leaking internal ticket sequence numbers or raw database IDs.

---

## 🗄️ Storage Security & Least-Privilege Policies

Supabase Storage buckets are secured via Row Level Security:

1. **`avatars` Bucket**:
   - Public read access for profile display.
   - Writes restricted strictly to the user's own folder: `(storage.foldername(name))[1] = auth.uid()::text`.
   - Max file size: **5 MB**.
   - Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
2. **`shop-assets` Bucket**:
   - Public read access for shop banners and catalog images.
   - Writes restricted to the verified shop owner via relational join:  
     `EXISTS (SELECT 1 FROM public.shops WHERE id::text = (storage.foldername(name))[1] AND owner_id = auth.uid())`  
     or authorized platform admins (`is_admin()`).
   - Max file size: **5 MB**. Allowed MIME types: image formats only.

---

## ⏱️ Multi-Server Discrete Wait-Time Estimation

Rather than naively dividing the total shop workload across active barbers, QuickCut implements a **discrete multi-server queue scheduling simulation**:

1. **Individual Barber Workloads**: Tracks the remaining in-chair service time for each active barber station, deducting elapsed time from `called_at` or `created_at`.
2. **Dedicated Barber Routing**: If a customer requests a specific barber, their wait time is determined exclusively by that barber's queue timeline.
3. **Unassigned Queue Dispatch**: Waiting customers without a preferred barber are greedily dispatched to the barber who becomes available earliest.
4. **Target Arrival Estimation**:
   - Customers requesting Barber $K$ wait until Barber $K$'s timeline finishes.
   - Unassigned pool customers wait until $\min(\text{timeline})$ across all active barbers.
5. **Estimate Demarcation**: All calculations are labeled with an explicit disclaimer that wait times are approximate and dynamically computed based on queue progress.

---

## 🔑 Development Test Accounts & Security Warning

> [!CAUTION]
> **DEVELOPMENT & TESTING ONLY**  
> Pre-configured development credentials (password: `Password123!`) in `supabase/seed.sql` are **strictly restricted to local development and unit/integration testing**. Never run `seed.sql` against a production database. Production user accounts must be provisioned through authentic Supabase Auth registration flows with secure, user-defined passwords.

| Portal / App | Email | Role | Scope |
| :--- | :--- | :--- | :--- |
| **Platform Admin** (`/apps/admin`) | `admin@quickcut.com` | `admin` | Global platform administration & shop moderation |
| **Shop Owner** (`/apps/owner`) | `owner.alex@quickcut.com` | `owner` | Crown & Blade Barbershop (Approved) |
| **Staff App** (`/apps/staff`) | `staff.sam@quickcut.com` | `staff` | Crown & Blade Barbershop (Queue & QR scanner) |
| **Customer App** (`/apps/customer`) | `customer.rahul@quickcut.com` | `customer` | Active ticket #101 |
| **Customer App** (`/apps/customer`) | `customer.priya@quickcut.com` | `customer` | Waiting queue ticket #102 |

---

## 🚀 Build, Typecheck & Testing Commands

QuickCut includes comprehensive validation scripts across all four applications and the shared package:

```bash
# 1. Complete validation of all 4 applications + shared package + test suite
npm run validate:all

# 2. Typecheck all applications individually or together
npm run typecheck:all
npm run typecheck:customer   # Customer Mobile App (Expo / React Native)
npm run typecheck:staff      # Staff Mobile App (Expo / React Native)
npm run typecheck:owner      # Shop Owner Web Dashboard (React / Vite)
npm run typecheck:admin      # Super Admin Web Dashboard (React / Vite)

# 3. Production web build
npm run build:all

# 4. Invariant & Security Unit Test Suite (32 tests across 15 suites)
npm run test

# 5. Real PostgreSQL Concurrency Integration Test Harness
npm run test:integration
```

---

## 🗄️ Database Setup & Migration Sequence

### Complete Migration Sequence (Additive & Idempotent):

1. `20261022000001_initial_schema.sql` - Core relational tables and enum types
2. `20261022000002_rls_policies.sql` - Initial Row Level Security policies
3. `20261022000003_functions_and_triggers.sql` - Queue numbering and helper functions
4. `20261023000001_security_and_invariants_fix.sql` - Daily counter locking & queue validation
5. `20261023000002_security_auth_roles_rls.sql` - Multi-role auth and customer isolation
6. `20261023000003_atomic_queue_and_transitions.sql` - State machine and atomic queue transitions
7. `20261023000004_billing_and_payments.sql` - Billing schema safeguards
8. `20261024000001_remove_platform_fee.sql` - Complete ₹0 platform fee deactivation
9. `20261024000002_fix_queue_aggregates_and_security.sql` - Queue aggregate hardening
10. `20261024000003_qr_join_queue_and_security_hardening.sql` - Cryptographic QR verification & join_queue hardening
11. `20261024000004_payment_and_audit_hardening.sql` - Customer payments support & staff audit trail
12. `20261024000005_storage_and_error_sanitization.sql` - Storage bucket RLS & QR error sanitization
13. `20261024000006_refined_wait_time_simulation.sql` - Multi-server discrete wait-time estimation
14. `20261024000007_prevent_customer_self_checkin_and_discrete_sim.sql` - Critical QR self-checkin prevention & discrete multi-server scheduling synchronization

### Local Supabase Setup:
```bash
# 1. Start local Supabase environment (requires Docker Desktop or Podman)
npx supabase start

# 2. Reset database and apply all migrations and seeds
npx supabase db reset

# 3. Open Supabase Studio locally
# http://localhost:54324
```

### Staging or Production Setup:
Apply migrations additively using `npx supabase migration up` or execute the consolidated idempotent script [`supabase/setup_all.sql`](file:///d:/my-first-website/hair%20cut%20app/supabase/setup_all.sql) in the Supabase SQL editor. Never run `db reset` on production.

---

## 💻 Running the Applications Locally

```bash
# 1. Run Super Admin Dashboard (Web)
npm run dev:admin
# Accessible on http://localhost:3002

# 2. Run Shop Owner Dashboard (Web)
npm run dev:owner
# Accessible on http://localhost:3001

# 3. Run Customer Mobile App (Expo SDK 58)
npm run dev:customer
# To start with a clean Metro cache: npm run dev:customer -- -c
# Press 'a' for Android emulator or scan QR with Expo Go (SDK 58)

# 4. Run Staff Mobile App (Expo SDK 58)
npm run dev:staff
# To start with a clean Metro cache: npm run dev:staff -- -c
# Press 'a' for Android emulator or scan QR with Expo Go (SDK 58)
```
