/**
 * QuickCut - Real PostgreSQL Concurrency & Isolation Integration Test Suite
 * 
 * ============================================================================
 * IMPORTANT:
 * This is an actual PostgreSQL database integration test that connects to an
 * active, disposable Supabase / PostgreSQL instance (e.g. `npx supabase start`
 * or an isolated disposable staging database).
 * 
 * Unlike in-memory unit simulations (Test Suite 14 in quickcut.test.ts), this suite
 * verifies PostgreSQL engine-level row locking on `shop_daily_counters`,
 * unique partial index `uq_active_customer_queue`, and RLS / RPC permissions.
 * 
 * Requirements:
 *   1. A disposable local or staging Supabase database running with migrations applied.
 *   2. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
 * 
 * Execution:
 *   $env:SUPABASE_URL="http://127.0.0.1:54321"
 *   $env:SUPABASE_ANON_KEY="<anon_key>"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
 *   npm run test:integration
 * ============================================================================
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Load .env if present
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const ALLOW_STAGING = process.env.QUICKCUT_ALLOW_STAGING_TEST === 'true';

test('QuickCut Real PostgreSQL Concurrency & Isolation Integration Suite', async (t) => {
  // 1. Fail-closed safeguard: Missing required credentials
  if (!SERVICE_ROLE_KEY || !ANON_KEY) {
    assert.fail(
      '\n============================================================\n' +
      '[INTEGRATION TEST CONFIGURATION ERROR]\n' +
      'Missing required environment variables:\n' +
      `  - SUPABASE_URL: ${SUPABASE_URL}\n` +
      `  - SUPABASE_ANON_KEY: ${ANON_KEY ? 'CONFIGURED' : 'MISSING'}\n` +
      `  - SUPABASE_SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY ? 'CONFIGURED' : 'MISSING'}\n\n` +
      'The real database integration test requires service-role credentials to provision\n' +
      'isolated test fixtures and test engine-level concurrency.\n\n' +
      'To execute this test:\n' +
      '  1. Start your local disposable Supabase instance: `npx supabase start`\n' +
      '  2. Export environment variables:\n' +
      '     $env:SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"\n' +
      '     $env:SUPABASE_ANON_KEY="<anon_key>"\n' +
      '  3. Run: npm run test:integration\n' +
      '============================================================\n'
    );
  }

  // 2. Fail-closed safeguard: Production Target Rejection
  const isLoopback = SUPABASE_URL.includes('127.0.0.1') || SUPABASE_URL.includes('localhost') || SUPABASE_URL.includes('[::1]');
  if (!isLoopback && !ALLOW_STAGING) {
    assert.fail(
      `\n============================================================\n` +
      `[SECURITY REJECTION] Target database is NOT local loopback:\n` +
      `  Target URL: ${SUPABASE_URL}\n` +
      `To prevent accidental destructive execution on non-local databases,\n` +
      `you must explicitly export QUICKCUT_ALLOW_STAGING_TEST="true" to target an approved staging instance.\n` +
      `============================================================\n`
    );
  }

  if (process.env.NODE_ENV === 'production') {
    assert.fail('[SECURITY REJECTION] Integration tests cannot run in NODE_ENV=production.');
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Verify connectivity
  try {
    const { error } = await adminClient.from('shops').select('id').limit(1);
    if (error) {
      assert.fail(`Database connectivity error to ${SUPABASE_URL}: ${error.message}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    assert.fail(`Database connection failed to ${SUPABASE_URL}: ${message}`);
  }

  // Helper to provision an isolated test customer
  async function provisionTestCustomer(label: string) {
    const email = `test.${label}.${Date.now()}.${Math.floor(Math.random() * 10000)}@quickcut.test`;
    const password = 'TestCustomer123!';
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Test ${label}`, role: 'customer' }
    });
    if (error || !data.user) {
      throw new Error(`Failed to provision test customer: ${error?.message}`);
    }

    // Insert profile
    await adminClient.from('profiles').upsert({
      id: data.user.id,
      email,
      full_name: `Test ${label}`,
      role: 'customer'
    });

    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email, password });

    return { id: data.user.id, email, client };
  }

  // Helper to provision an isolated test shop, owner, staff, and service
  async function provisionTestShop(shopName: string) {
    const owner = await provisionTestCustomer(`owner.${shopName}`);
    await adminClient.from('profiles').update({ role: 'owner' }).eq('id', owner.id);

    const { data: shop, error: shopErr } = await adminClient
      .from('shops')
      .insert({
        name: `Test ${shopName}`,
        address: '123 Test Street',
        phone: '9999999999',
        owner_id: owner.id,
        status: 'approved',
        is_active: true
      })
      .select('id')
      .single();

    if (shopErr || !shop) {
      throw new Error(`Failed to create test shop: ${shopErr?.message}`);
    }

    const { data: service, error: svcErr } = await adminClient
      .from('services')
      .insert({
        shop_id: shop.id,
        name: 'Standard Haircut',
        price: 250,
        avg_minutes: 25,
        is_active: true
      })
      .select('id')
      .single();

    if (svcErr || !service) {
      throw new Error(`Failed to create test service: ${svcErr?.message}`);
    }

    // Provision a staff member
    const staff = await provisionTestCustomer(`staff.${shopName}`);
    await adminClient.from('profiles').update({ role: 'staff' }).eq('id', staff.id);
    await adminClient.from('shop_staff').insert({
      shop_id: shop.id,
      user_id: staff.id,
      role: 'barber',
      is_active: true
    });

    return {
      shopId: shop.id,
      serviceId: service.id,
      ownerId: owner.id,
      staffId: staff.id,
      staffClient: staff.client
    };
  }

  // =========================================================================
  // TEST A: SAME CUSTOMER CONCURRENCY (Engine-Level Row Locking & Partial Index)
  // =========================================================================
  await t.test('Test A: Ten simultaneous join attempts from SAME customer (uq_active_customer_queue)', async () => {
    const fixture = await provisionTestShop('Concurrency-Shop-A');
    const customer = await provisionTestCustomer('SameCustomer-A');

    try {
      // Spawn 10 independent clients authenticated as the same customer
      const clients = await Promise.all(
        Array.from({ length: 10 }, async () => {
          const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
          await c.auth.signInWithPassword({ email: customer.email, password: 'TestCustomer123!' });
          return c;
        })
      );

      // Fire 10 simultaneous join requests
      const results = await Promise.allSettled(
        clients.map(c =>
          c.rpc('join_queue', {
            p_shop_id: fixture.shopId,
            p_service_id: fixture.serviceId
          })
        )
      );

      let successes = 0;
      let rejectedDuplicates = 0;

      for (const res of results) {
        if (res.status === 'fulfilled') {
          const { data, error } = res.value;
          if (!error && data?.queue_number) {
            successes++;
          } else if (error) {
            rejectedDuplicates++;
            const isExpected =
              error.code === '23505' ||
              error.message.includes('already') ||
              error.message.includes('active queue ticket');
            assert.ok(isExpected, `Expected duplicate violation error, received: ${error.message} (${error.code})`);
          }
        } else {
          rejectedDuplicates++;
        }
      }

      assert.strictEqual(successes, 1, 'Exactly ONE join attempt must succeed');
      assert.strictEqual(rejectedDuplicates, 9, 'Exactly 9 duplicate attempts must be rejected by PostgreSQL engine');
    } finally {
      // Robust teardown
      await adminClient.from('queue_entries').delete().eq('shop_id', fixture.shopId);
      await adminClient.from('shop_staff').delete().eq('shop_id', fixture.shopId);
      await adminClient.from('services').delete().eq('shop_id', fixture.shopId);
      await adminClient.from('shops').delete().eq('id', fixture.shopId);
      await adminClient.auth.admin.deleteUser(customer.id);
      await adminClient.auth.admin.deleteUser(fixture.ownerId);
      await adminClient.auth.admin.deleteUser(fixture.staffId);
    }
  });

  // =========================================================================
  // TEST B: DIFFERENT CUSTOMER CONCURRENCY (Atomic Daily Counter Increment)
  // =========================================================================
  await t.test('Test B: Ten distinct customers joining simultaneously (Atomic Sequence & No Gap)', async () => {
    const fixture = await provisionTestShop('Concurrency-Shop-B');
    const customers = await Promise.all(
      Array.from({ length: 10 }, (_, i) => provisionTestCustomer(`Distinct-${i}`))
    );

    try {
      // Fire 10 simultaneous joins
      const joinPromises = customers.map(c =>
        c.client.rpc('join_queue', {
          p_shop_id: fixture.shopId,
          p_service_id: fixture.serviceId
        })
      );

      const responses = await Promise.all(joinPromises);

      const queueNumbers: number[] = [];
      for (const res of responses) {
        assert.strictEqual(res.error, null, `Join failed: ${res.error?.message}`);
        assert.ok(res.data?.queue_number, 'Must return valid queue number');
        queueNumbers.push(res.data.queue_number);
      }

      assert.strictEqual(queueNumbers.length, 10, 'All 10 distinct customers must receive a queue ticket');

      // Verify all queue numbers are unique
      const uniqueNumbers = new Set(queueNumbers);
      assert.strictEqual(uniqueNumbers.size, 10, 'All 10 assigned queue numbers must be strictly unique (no duplicates)');

      // Verify sequence is strictly contiguous starting from 1
      const sorted = [...queueNumbers].sort((a, b) => a - b);
      assert.deepStrictEqual(sorted, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'Queue numbers must be strictly contiguous from 1 to 10');
    } finally {
      await adminClient.from('queue_entries').delete().eq('shop_id', fixture.shopId);
      await adminClient.from('shop_staff').delete().eq('shop_id', fixture.shopId);
      await adminClient.from('services').delete().eq('shop_id', fixture.shopId);
      await adminClient.from('shops').delete().eq('id', fixture.shopId);
      for (const c of customers) {
        await adminClient.auth.admin.deleteUser(c.id);
      }
      await adminClient.auth.admin.deleteUser(fixture.ownerId);
      await adminClient.auth.admin.deleteUser(fixture.staffId);
    }
  });

  // =========================================================================
  // TEST C: REPEATED REQUESTS (Rapid Repeated Join Protection)
  // =========================================================================
  await t.test('Test C: Rapid repeated requests from same user prevent duplicate tickets', async () => {
    const fixture = await provisionTestShop('Concurrency-Shop-C');
    const customer = await provisionTestCustomer('RepeatedCustomer');

    try {
      // 1st request: succeeds
      const res1 = await customer.client.rpc('join_queue', {
        p_shop_id: fixture.shopId,
        p_service_id: fixture.serviceId
      });
      assert.strictEqual(res1.error, null);
      assert.ok(res1.data?.queue_number);

      // 2nd request: immediately fails
      const res2 = await customer.client.rpc('join_queue', {
        p_shop_id: fixture.shopId,
        p_service_id: fixture.serviceId
      });
      assert.ok(res2.error, 'Second sequential join must fail');
      assert.ok(
        res2.error.message.includes('already') || res2.error.message.includes('active queue ticket'),
        'Must report active ticket violation'
      );
    } finally {
      await adminClient.from('queue_entries').delete().eq('shop_id', fixture.shopId);
      await adminClient.from('shop_staff').delete().eq('shop_id', fixture.shopId);
      await adminClient.from('services').delete().eq('shop_id', fixture.shopId);
      await adminClient.from('shops').delete().eq('id', fixture.shopId);
      await adminClient.auth.admin.deleteUser(customer.id);
      await adminClient.auth.admin.deleteUser(fixture.ownerId);
      await adminClient.auth.admin.deleteUser(fixture.staffId);
    }
  });

  // =========================================================================
  // TEST D: CROSS-SHOP CONCURRENCY (Customer Cannot Hold Active Tickets in 2 Shops)
  // =========================================================================
  await t.test('Test D: Concurrent attempts to join multiple shops reject multiple active tickets', async () => {
    const shop1 = await provisionTestShop('Shop-1');
    const shop2 = await provisionTestShop('Shop-2');
    const customer = await provisionTestCustomer('CrossShopCustomer');

    try {
      const clientA = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
      await clientA.auth.signInWithPassword({ email: customer.email, password: 'TestCustomer123!' });

      const clientB = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
      await clientB.auth.signInWithPassword({ email: customer.email, password: 'TestCustomer123!' });

      // Race join attempts to shop1 and shop2 simultaneously
      const results = await Promise.allSettled([
        clientA.rpc('join_queue', { p_shop_id: shop1.shopId, p_service_id: shop1.serviceId }),
        clientB.rpc('join_queue', { p_shop_id: shop2.shopId, p_service_id: shop2.serviceId })
      ]);

      let successCount = 0;
      let failureCount = 0;

      for (const res of results) {
        if (res.status === 'fulfilled') {
          if (!res.value.error && res.value.data?.queue_number) {
            successCount++;
          } else {
            failureCount++;
          }
        } else {
          failureCount++;
        }
      }

      assert.strictEqual(successCount, 1, 'Customer can hold at most ONE active ticket across ALL shops');
      assert.strictEqual(failureCount, 1, 'Second cross-shop join must be rejected');
    } finally {
      await adminClient.from('queue_entries').delete().in('shop_id', [shop1.shopId, shop2.shopId]);
      await adminClient.from('shop_staff').delete().in('shop_id', [shop1.shopId, shop2.shopId]);
      await adminClient.from('services').delete().in('shop_id', [shop1.shopId, shop2.shopId]);
      await adminClient.from('shops').delete().in('id', [shop1.shopId, shop2.shopId]);
      await adminClient.auth.admin.deleteUser(customer.id);
      await adminClient.auth.admin.deleteUser(shop1.ownerId);
      await adminClient.auth.admin.deleteUser(shop2.ownerId);
      await adminClient.auth.admin.deleteUser(shop1.staffId);
      await adminClient.auth.admin.deleteUser(shop2.staffId);
    }
  });

  // =========================================================================
  // TEST E: AUTHENTICATED CUSTOMER SELF-CHECK-IN REJECTION (TASK 1)
  // =========================================================================
  await t.test('Test E: Authenticated customer CANNOT self-check-in, even with valid cryptographic token', async () => {
    const fixture = await provisionTestShop('Shop-SelfCheckinTest');
    const customer = await provisionTestCustomer('CustomerSelfCheckin');

    try {
      // 1. Customer joins queue legitimately
      const joinRes = await customer.client.rpc('join_queue', {
        p_shop_id: fixture.shopId,
        p_service_id: fixture.serviceId
      });
      assert.strictEqual(joinRes.error, null);
      const entryId = joinRes.data?.id;
      assert.ok(entryId, 'Must receive entry ID');

      // Fetch the actual ticket row using adminClient to retrieve qr_code_token
      const { data: ticket } = await adminClient
        .from('queue_entries')
        .select('id, qr_code_token, checked_in_at')
        .eq('id', entryId)
        .single();

      assert.ok(ticket?.qr_code_token, 'Ticket must possess valid cryptographic QR token');
      assert.strictEqual(ticket.checked_in_at, null, 'Newly created ticket must not be checked in');

      // 2. Customer invokes verify_qr_checkin with their OWN valid token
      const selfCheckinRes = await customer.client.rpc('verify_qr_checkin', {
        p_entry_id: ticket.id,
        p_qr_token: ticket.qr_code_token
      });

      // MUST BE REJECTED with Unauthorized error!
      assert.ok(selfCheckinRes.error, 'Customer self-checkin RPC must be rejected by PostgreSQL');
      assert.ok(
        selfCheckinRes.error.message.includes('Unauthorized') ||
        selfCheckinRes.error.message.includes('Only authorized shop staff'),
        `Expected Unauthorized exception, received: ${selfCheckinRes.error.message}`
      );

      // Verify in DB that checked_in_at remains NULL
      const { data: ticketAfter } = await adminClient
        .from('queue_entries')
        .select('checked_in_at')
        .eq('id', entryId)
        .single();
      assert.strictEqual(ticketAfter?.checked_in_at, null, 'Ticket must remain unchecked after customer attempt');

      // 3. Authorized shop staff invokes verify_qr_checkin with the exact same token -> MUST SUCCEED!
      const staffCheckinRes = await fixture.staffClient.rpc('verify_qr_checkin', {
        p_entry_id: ticket.id,
        p_qr_token: ticket.qr_code_token
      });

      assert.strictEqual(staffCheckinRes.error, null, `Authorized staff check-in failed: ${staffCheckinRes.error?.message}`);
      assert.strictEqual(staffCheckinRes.data?.success, true);

      // Verify in DB that checked_in_at is now set!
      const { data: ticketVerified } = await adminClient
        .from('queue_entries')
        .select('checked_in_at')
        .eq('id', entryId)
        .single();
      assert.ok(ticketVerified?.checked_in_at, 'Ticket must be verified after authorized staff scan');
    } finally {
      await adminClient.from('queue_entries').delete().eq('shop_id', fixture.shopId);
      await adminClient.from('shop_staff').delete().eq('shop_id', fixture.shopId);
      await adminClient.from('services').delete().eq('shop_id', fixture.shopId);
      await adminClient.from('shops').delete().eq('id', fixture.shopId);
      await adminClient.auth.admin.deleteUser(customer.id);
      await adminClient.auth.admin.deleteUser(fixture.ownerId);
      await adminClient.auth.admin.deleteUser(fixture.staffId);
    }
  });
});
