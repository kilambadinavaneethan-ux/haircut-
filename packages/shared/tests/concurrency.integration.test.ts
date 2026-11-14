/**
 * QuickCut - Real PostgreSQL Concurrency Integration Test Suite
 * 
 * ============================================================================
 * IMPORTANT:
 * This is an actual PostgreSQL database integration test that connects to an
 * active, disposable Supabase / PostgreSQL instance (e.g. `npx supabase start`
 * or an isolated disposable staging database).
 * 
 * Unlike in-memory unit simulations (Test Suite 14 in quickcut.test.ts), this suite
 * verifies PostgreSQL engine-level row locking on `shop_daily_counters` and
 * unique partial index `uq_active_customer_queue`.
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

test('QuickCut Real PostgreSQL Concurrency & Isolation Integration Suite', async (t) => {
  // Fail with helpful error if required environment variables are missing
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

  // Helper to provision an isolated test shop & service
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

    return { shopId: shop.id, serviceId: service.id, ownerId: owner.id };
  }

  // =========================================================================
  // TEST A: SAME CUSTOMER CONCURRENCY (Engine-Level Row Locking & Partial Index)
  // =========================================================================
  await t.test('Test A: Ten simultaneous join attempts from SAME customer (uq_active_customer_queue)', async () => {
    const fixture = await provisionTestShop('Concurrency-Shop-A');
    const customer = await provisionTestCustomer('SameCustomer-A');

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
    const errors: string[] = [];

    for (const res of results) {
      if (res.status === 'fulfilled') {
        const { data, error } = res.value;
        if (!error && data?.queue_number) {
          successes++;
        } else if (error) {
          rejectedDuplicates++;
          errors.push(error.message);
          const isExpected =
            error.code === '23505' ||
            error.message.includes('already') ||
            error.message.includes('active queue ticket');
          assert.ok(isExpected, `Unexpected error on duplicate join: ${error.message} (${error.code})`);
        }
      } else {
        rejectedDuplicates++;
      }
    }

    // Cleanup
    await adminClient.from('queue_entries').delete().eq('shop_id', fixture.shopId);
    await adminClient.from('services').delete().eq('shop_id', fixture.shopId);
    await adminClient.from('shops').delete().eq('id', fixture.shopId);
    await adminClient.auth.admin.deleteUser(customer.id);
    await adminClient.auth.admin.deleteUser(fixture.ownerId);

    assert.strictEqual(successes, 1, 'Exactly ONE join attempt must succeed');
    assert.strictEqual(rejectedDuplicates, 9, 'Exactly 9 duplicate attempts must be rejected by PostgreSQL engine');
  });

  // =========================================================================
  // TEST B: DIFFERENT CUSTOMER CONCURRENCY (Atomic Daily Counter Increment)
  // =========================================================================
  await t.test('Test B: Ten distinct customers joining simultaneously (Atomic Sequence & No Gap)', async () => {
    const fixture = await provisionTestShop('Concurrency-Shop-B');

    // Provision 10 distinct customers
    const customers = await Promise.all(
      Array.from({ length: 10 }, (_, i) => provisionTestCustomer(`Distinct-${i}`))
    );

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

    // Cleanup
    await adminClient.from('queue_entries').delete().eq('shop_id', fixture.shopId);
    await adminClient.from('services').delete().eq('shop_id', fixture.shopId);
    await adminClient.from('shops').delete().eq('id', fixture.shopId);
    for (const c of customers) {
      await adminClient.auth.admin.deleteUser(c.id);
    }
    await adminClient.auth.admin.deleteUser(fixture.ownerId);

    assert.strictEqual(queueNumbers.length, 10, 'All 10 distinct customers must receive a queue ticket');

    // Verify all queue numbers are unique
    const uniqueNumbers = new Set(queueNumbers);
    assert.strictEqual(uniqueNumbers.size, 10, 'All 10 assigned queue numbers must be strictly unique (no duplicates)');

    // Verify sequence is strictly contiguous starting from 1
    const sorted = [...queueNumbers].sort((a, b) => a - b);
    assert.deepStrictEqual(sorted, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'Queue numbers must be strictly contiguous from 1 to 10');
  });

  // =========================================================================
  // TEST C: REPEATED REQUESTS (Rapid Repeated Join Protection)
  // =========================================================================
  await t.test('Test C: Rapid repeated requests from same user prevent duplicate tickets', async () => {
    const fixture = await provisionTestShop('Concurrency-Shop-C');
    const customer = await provisionTestCustomer('RepeatedCustomer');

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

    // Cleanup
    await adminClient.from('queue_entries').delete().eq('shop_id', fixture.shopId);
    await adminClient.from('services').delete().eq('shop_id', fixture.shopId);
    await adminClient.from('shops').delete().eq('id', fixture.shopId);
    await adminClient.auth.admin.deleteUser(customer.id);
    await adminClient.auth.admin.deleteUser(fixture.ownerId);
  });

  // =========================================================================
  // TEST D: CROSS-SHOP CONCURRENCY (Customer Cannot Hold Active Tickets in 2 Shops)
  // =========================================================================
  await t.test('Test D: Concurrent attempts to join multiple shops reject multiple active tickets', async () => {
    const shop1 = await provisionTestShop('Shop-1');
    const shop2 = await provisionTestShop('Shop-2');
    const customer = await provisionTestCustomer('CrossShopCustomer');

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

    // Cleanup
    await adminClient.from('queue_entries').delete().in('shop_id', [shop1.shopId, shop2.shopId]);
    await adminClient.from('services').delete().in('shop_id', [shop1.shopId, shop2.shopId]);
    await adminClient.from('shops').delete().in('id', [shop1.shopId, shop2.shopId]);
    await adminClient.auth.admin.deleteUser(customer.id);
    await adminClient.auth.admin.deleteUser(shop1.ownerId);
    await adminClient.auth.admin.deleteUser(shop2.ownerId);

    assert.strictEqual(successCount, 1, 'Customer can hold at most ONE active ticket across ALL shops');
    assert.strictEqual(failureCount, 1, 'Second cross-shop join must be rejected');
  });
});
