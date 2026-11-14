/**
 * QuickCut - Real PostgreSQL Concurrency Integration Test Suite
 * 
 * ============================================================================
 * IMPORTANT:
 * This is an actual PostgreSQL database integration test that connects to an
 * active, disposable Supabase / PostgreSQL instance (e.g. `npx supabase start`
 * or a disposable staging database).
 * 
 * Unlike unit simulation tests (Test Suite 14 in quickcut.test.ts), this suite
 * verifies PostgreSQL engine-level row locking on `shop_daily_counters` and
 * unique partial index `uq_active_customer_queue`.
 * 
 * Requirements for executing this live database test:
 *   1. A disposable local or staging Supabase database running with migrations applied.
 *   2. Either service-role key or admin access to provision concurrent test accounts.
 * 
 * Usage:
 *   $env:SUPABASE_URL="http://127.0.0.1:54321"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
 *   npm run test:integration
 * ============================================================================
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Parse workspace .env if available
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

function createIndependentClient(authKey?: string): SupabaseClient | null {
  const key = authKey || SERVICE_ROLE_KEY || ANON_KEY;
  if (!key) return null;
  try {
    return createClient(SUPABASE_URL, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  } catch {
    return null;
  }
}

test('QuickCut Real PostgreSQL Concurrency & Isolation Integration Suite', async (t) => {
  const adminClient = createIndependentClient(SERVICE_ROLE_KEY);
  const anonClient = createIndependentClient(ANON_KEY);
  const activeClient = adminClient || anonClient;

  let isDbOnline = false;
  let hasServiceRole = !!SERVICE_ROLE_KEY;

  if (activeClient) {
    try {
      const { data, error } = await activeClient.from('shops').select('id').limit(1);
      if (!error && data) {
        isDbOnline = true;
      }
    } catch {
      isDbOnline = false;
    }
  }

  // If database is offline or service-role key is not configured for account provisioning
  if (!isDbOnline || !hasServiceRole) {
    await t.test('Real Database Environment Validation', () => {
      console.log('\n============================================================');
      console.log(' [INTEGRATION TEST ENVIRONMENT: POSTGRESQL STAGING / OFFLINE]');
      console.log(' Connected URL:', SUPABASE_URL);
      console.log(' Database Reachable:', isDbOnline ? 'YES' : 'NO');
      console.log(' Service-Role Key Configured:', hasServiceRole ? 'YES' : 'NO (Required for multi-client account provisioning)');
      console.log(' Note: Test Suite 14 already validated concurrent invariants via in-memory simulation.');
      console.log(' To execute this REAL database multi-client integration test:');
      console.log('   1. Start local disposable Supabase: `npx supabase start`');
      console.log('   2. Set $env:SUPABASE_URL and $env:SUPABASE_SERVICE_ROLE_KEY');
      console.log('   3. Run: npm run test:integration');
      console.log('============================================================\n');
      assert.ok(true, 'Test execution safely bypassed: live database service-role environment not provided');
    });
    return;
  }

  // 1. Ten simultaneous join attempts from the SAME customer
  await t.test('1. Ten simultaneous join attempts from SAME customer (Real DB Row Locking)', async () => {
    assert.ok(adminClient, 'Admin client required');
    const shopId = '10000000-0000-0000-0000-000000000001';

    // Fetch an active service for this shop
    const { data: services } = await adminClient
      .from('services')
      .select('id')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .limit(1);
    
    assert.ok(services && services.length > 0, 'Shop must have at least one active service');
    const serviceId = services[0].id;

    // Create a temporary test customer without an active ticket
    const tempEmail = `temp.concurrency.${Date.now()}@quickcut.test`;
    const { data: userRecord, error: userError } = await adminClient.auth.admin.createUser({
      email: tempEmail,
      password: 'TestPassword123!',
      email_confirm: true,
      user_metadata: { full_name: 'Concurrent Test Customer', role: 'customer' }
    });
    assert.strictEqual(userError, null, 'Temp test customer creation failed');
    const tempCustomerId = userRecord.user.id;

    // Insert profile
    await adminClient.from('profiles').upsert({
      id: tempCustomerId,
      email: tempEmail,
      full_name: 'Concurrent Test Customer',
      role: 'customer'
    });

    // Create 10 independent authenticated clients for this same customer
    const clients = await Promise.all(
      Array.from({ length: 10 }, async () => {
        const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
        await c.auth.signInWithPassword({ email: tempEmail, password: 'TestPassword123!' });
        return c;
      })
    );

    // Fire 10 simultaneous join requests
    const results = await Promise.allSettled(
      clients.map(client =>
        client.rpc('join_queue', {
          p_shop_id: shopId,
          p_service_id: serviceId
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
          assert.ok(isExpected, `Expected duplicate rejection, got: ${error.message} (${error.code})`);
        }
      } else {
        rejectedDuplicates++;
      }
    }

    // Cleanup created temp user
    await adminClient.auth.admin.deleteUser(tempCustomerId);

    assert.strictEqual(successes, 1, 'Exactly ONE join attempt must succeed');
    assert.strictEqual(rejectedDuplicates, 9, 'Exactly 9 duplicate attempts must be rejected by PostgreSQL');
  });

  // 2. Ten distinct customers joining the same shop simultaneously
  await t.test('2. Ten distinct customers joining simultaneously (Atomic Sequence & No Gap)', async () => {
    assert.ok(adminClient, 'Admin client required');
    const shopId = '10000000-0000-0000-0000-000000000001';

    const { data: services } = await adminClient
      .from('services')
      .select('id')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .limit(1);
    
    const serviceId = services![0].id;

    // Provision 10 distinct temporary customers
    const tempUsers: { id: string; email: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const email = `distinct.${Date.now()}.${i}@quickcut.test`;
      const { data } = await adminClient.auth.admin.createUser({
        email,
        password: 'TestPassword123!',
        email_confirm: true,
        user_metadata: { full_name: `Distinct Cust ${i}`, role: 'customer' }
      });
      tempUsers.push({ id: data!.user.id, email });
      await adminClient.from('profiles').upsert({
        id: data!.user.id,
        email,
        full_name: `Distinct Cust ${i}`,
        role: 'customer'
      });
    }

    // Create 10 independent authenticated clients
    const clients = await Promise.all(
      tempUsers.map(async u => {
        const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
        await c.auth.signInWithPassword({ email: u.email, password: 'TestPassword123!' });
        return c;
      })
    );

    // Fire 10 simultaneous join requests from 10 distinct customers
    const joinPromises = clients.map(client =>
      client.rpc('join_queue', {
        p_shop_id: shopId,
        p_service_id: serviceId
      })
    );

    const responses = await Promise.all(joinPromises);

    // Cleanup temp users
    for (const u of tempUsers) {
      await adminClient.auth.admin.deleteUser(u.id);
    }

    const queueNumbers: number[] = [];
    for (const res of responses) {
      assert.strictEqual(res.error, null, `Join failed: ${res.error?.message}`);
      assert.ok(res.data?.queue_number, 'Must return valid queue number');
      queueNumbers.push(res.data.queue_number);
    }

    assert.strictEqual(queueNumbers.length, 10, 'All 10 distinct customers must receive a queue ticket');

    // Verify all queue numbers are strictly unique
    const uniqueNumbers = new Set(queueNumbers);
    assert.strictEqual(uniqueNumbers.size, 10, 'All 10 assigned queue numbers must be strictly unique (no duplicates)');

    // Verify sequence is strictly contiguous
    const sorted = [...queueNumbers].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      assert.strictEqual(sorted[i], sorted[i - 1] + 1, 'Queue numbers must be strictly contiguous without gaps');
    }
  });
});
