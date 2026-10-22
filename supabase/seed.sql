-- QuickCut Platform - Seed Script
-- File: supabase/seed.sql

-- Safe cleanup for fresh seed
TRUNCATE TABLE public.audit_logs CASCADE;
TRUNCATE TABLE public.support_tickets CASCADE;
TRUNCATE TABLE public.notifications CASCADE;
TRUNCATE TABLE public.payments CASCADE;
TRUNCATE TABLE public.fee_records CASCADE;
TRUNCATE TABLE public.queue_entries CASCADE;
TRUNCATE TABLE public.services CASCADE;
TRUNCATE TABLE public.barbers CASCADE;
TRUNCATE TABLE public.shop_staff CASCADE;
TRUNCATE TABLE public.shops CASCADE;
TRUNCATE TABLE public.profiles CASCADE;

-- 1. Create Auth Users (Pre-registered test accounts with password: Password123!)
-- Admin
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'admin@quickcut.com',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Platform Administrator","role":"admin"}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
) ON CONFLICT (id) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password;

-- Owner
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'owner.alex@quickcut.com',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Alex Miller","role":"owner"}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
) ON CONFLICT (id) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password;

-- Staff
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'staff.sam@quickcut.com',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Sam Wilson","role":"staff"}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
) ON CONFLICT (id) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password;

-- Customer 1
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'customer.rahul@quickcut.com',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Rahul Sharma","role":"customer"}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
) ON CONFLICT (id) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password;

-- Customer 2
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000005',
    'authenticated',
    'authenticated',
    'customer.priya@quickcut.com',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Priya Patel","role":"customer"}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
) ON CONFLICT (id) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password;

-- Ensure auth.identities are mapped for all seeded users
INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
SELECT 
    id, id as user_id,
    jsonb_build_object('sub', id::text, 'email', email),
    'email' as provider,
    id::text as provider_id,
    now(), now(), now()
FROM auth.users
ON CONFLICT (provider, provider_id) DO NOTHING;

-- 2. Insert Profiles (Mapped to above auth.users)
-- Admin
INSERT INTO public.profiles (id, role, full_name, phone, avatar_url)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin',
    'Platform Administrator',
    '+91 98765 00001',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Shop Owner: Alex Miller
INSERT INTO public.profiles (id, role, full_name, phone, avatar_url)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    'owner',
    'Alex Miller',
    '+91 98765 00002',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'
) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Staff: Sam Barber
INSERT INTO public.profiles (id, role, full_name, phone, avatar_url)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    'staff',
    'Sam Wilson',
    '+91 98765 00003',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150'
) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Customer 1: Rahul Sharma
INSERT INTO public.profiles (id, role, full_name, phone, avatar_url)
VALUES (
    '00000000-0000-0000-0000-000000000004',
    'customer',
    'Rahul Sharma',
    '+91 98765 00004',
    'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150'
) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Customer 2: Priya Patel
INSERT INTO public.profiles (id, role, full_name, phone, avatar_url)
VALUES (
    '00000000-0000-0000-0000-000000000005',
    'customer',
    'Priya Patel',
    '+91 98765 00005',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150'
) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Insert Shops
-- 1. Crown & Blade Barbershop (Approved)
INSERT INTO public.shops (id, owner_id, name, address, phone, latitude, longitude, status, opening_time, closing_time)
VALUES (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'Crown & Blade Barbershop',
    '42 Brigade Road, Indiranagar, Bengaluru',
    '+91 80 4123 4567',
    12.9716,
    77.5946,
    'approved',
    '09:00:00',
    '21:00:00'
);

-- 2. Urban Fades Lounge (Pending Admin Approval)
INSERT INTO public.shops (id, owner_id, name, address, phone, latitude, longitude, status, opening_time, closing_time)
VALUES (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'Urban Fades Lounge',
    '18 Koramangala 5th Block, Bengaluru',
    '+91 80 4987 6543',
    12.9352,
    77.6245,
    'pending',
    '10:00:00',
    '22:00:00'
);

-- Insert Staff Assignment
INSERT INTO public.shop_staff (id, shop_id, user_id, role)
VALUES (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    'senior_barber'
);

-- Insert Barbers / Chairs
INSERT INTO public.barbers (id, shop_id, user_id, name, is_active)
VALUES 
(
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    'Sam Wilson (Master Stylist)',
    true
),
(
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    NULL,
    'Leo Gomez (Fade Specialist)',
    true
),
(
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    NULL,
    'Marco Rossi (Beard Artist)',
    true
);

-- Insert Services
INSERT INTO public.services (id, shop_id, name, price, avg_minutes, is_active)
VALUES
(
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Classic Haircut & Styling',
    350.00,
    25,
    true
),
(
    '40000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Beard Sculpting & Hot Towel',
    200.00,
    15,
    true
),
(
    '40000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'The Executive Royal Package (Hair + Beard + Wash)',
    650.00,
    45,
    true
);

-- Insert Queue Entries demonstrating logic:
-- 1. In Service entry (Rahul Sharma, Classic Haircut = 25 mins)
INSERT INTO public.queue_entries (
    id, shop_id, customer_id, barber_id, service_id, queue_number, status, 
    qr_code_token, checked_in_at, called_at, is_walkin, created_at
)
VALUES (
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    101,
    'in_service',
    'a1111111-1111-1111-1111-111111111111',
    timezone('utc'::text, now() - INTERVAL '15 minutes'),
    timezone('utc'::text, now() - INTERVAL '10 minutes'),
    false,
    timezone('utc'::text, now() - INTERVAL '30 minutes')
);

-- 2. Waiting entry (Priya Patel, Beard/Trim = 15 mins). 
-- Wait time will be calculated dynamically based on entries ahead!
INSERT INTO public.queue_entries (
    id, shop_id, customer_id, barber_id, service_id, queue_number, status, 
    qr_code_token, is_walkin, created_at
)
VALUES (
    '50000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000005',
    '30000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000002',
    102,
    'waiting',
    'b2222222-2222-2222-2222-222222222222',
    false,
    timezone('utc'::text, now() - INTERVAL '10 minutes')
);

-- 3. Billable Completed entry (Customer QR Check-in + Staff Completion + Not Walkin)
-- Trigger will automatically compute is_billable = true!
INSERT INTO public.queue_entries (
    id, shop_id, customer_id, barber_id, service_id, queue_number, status, 
    qr_code_token, checked_in_at, called_at, completed_at, is_walkin, created_at
)
VALUES (
    '50000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    99,
    'completed',
    'c3333333-3333-3333-3333-333333333333',
    timezone('utc'::text, now() - INTERVAL '2 hours'),
    timezone('utc'::text, now() - INTERVAL '1 hour 45 minutes'),
    timezone('utc'::text, now() - INTERVAL '1 hour 20 minutes'),
    false,
    timezone('utc'::text, now() - INTERVAL '2 hours 15 minutes')
);

-- 4. Completed Walk-In entry (Should NOT be billable: is_walkin = true)
INSERT INTO public.queue_entries (
    id, shop_id, customer_id, barber_id, service_id, guest_name, queue_number, status, 
    qr_code_token, completed_at, is_walkin, created_at
)
VALUES (
    '50000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    NULL,
    '30000000-0000-0000-0000-000000000003',
    '40000000-0000-0000-0000-000000000002',
    'Walk-in Guest Dev',
    100,
    'completed',
    'd4444444-4444-4444-4444-444444444444',
    timezone('utc'::text, now() - INTERVAL '40 minutes'),
    true,
    timezone('utc'::text, now() - INTERVAL '1 hour')
);

-- Insert Fee Record for Shop (Demonstrates Rs 5 per billable service)
INSERT INTO public.fee_records (
    id, shop_id, month, billable_count, rate_per_service, amount, status, disputed_until, dispute_reason
)
VALUES (
    '60000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    to_char(timezone('utc'::text, now()), 'YYYY-MM'),
    148,
    5.00,
    740.00, -- 148 * Rs 5
    'pending',
    timezone('utc'::text, now() + INTERVAL '5 days'),
    NULL
);

-- Insert Sample Payment
INSERT INTO public.payments (
    id, fee_record_id, shop_id, amount, currency, status, payment_method, transaction_ref, paid_at
)
VALUES (
    '70000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    740.00,
    'INR',
    'completed',
    'UPI',
    'UPI/20261022/984719284',
    timezone('utc'::text, now() - INTERVAL '1 day')
);

-- Insert Notifications
INSERT INTO public.notifications (user_id, title, message, type, read)
VALUES 
(
    '00000000-0000-0000-0000-000000000004',
    'Your Turn is Approaching!',
    'Crown & Blade Barbershop: Sam Wilson is ready to welcome you shortly.',
    'queue_update',
    false
),
(
    '00000000-0000-0000-0000-000000000002',
    'Monthly Fee Statement Ready',
    'Your billing statement for this month has been generated: Rs 740.00 (148 billable cuts @ Rs 5/service).',
    'billing',
    false
);

-- Insert Support Ticket
INSERT INTO public.support_tickets (user_id, shop_id, subject, message, status, priority)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Inquiry about QR Scanner Hardware Support',
    'We are planning to add a fixed tablet scanner at our entrance. Does the staff app support continuous camera scan mode?',
    'open',
    'medium'
);

-- Insert Audit Log
INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, payload)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'SHOP_APPROVED',
    'shops',
    '10000000-0000-0000-0000-000000000001',
    '{"shop_name": "Crown & Blade Barbershop", "reviewer": "admin"}'::jsonb
);
