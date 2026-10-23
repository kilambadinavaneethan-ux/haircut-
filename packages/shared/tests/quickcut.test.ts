import test from 'node:test';
import assert from 'node:assert';

import {
  isEntryBillable,
  calculatePlatformFee,
  isFeeDisputable,
  formatFeeAmount,
  calculateEstimatedWaitTime,
  calculateShopCurrentWait,
  formatEstimatedWaitDisplay,
  generateQueueQRPayload,
  parseQueueQRPayload,
  PLATFORM_CONFIG
} from '../src/index';

test('QuickCut Test Suite - Core Business Rules, Security & Invariants', async (t) => {
  
  // =========================================================================
  // 1. ₹5 Platform Billing Rule Invariants
  // =========================================================================
  await t.test('1. Platform Billing Rules - Invariant Verification', () => {
    // 1a. Eligible online customer with verified arrival QR check-in & completion
    const validBillableEntry = {
      id: 'entry-1',
      shop_id: 'shop-1',
      customer_id: 'cust-1',
      is_walkin: false,
      checked_in_at: '2026-10-23T10:00:00Z',
      completed_at: '2026-10-23T10:30:00Z',
      status: 'completed' as const
    };
    assert.strictEqual(
      isEntryBillable(validBillableEntry),
      true,
      'Online completed service with customer QR check-in must be billable'
    );

    // 1b. Walk-ins are strictly exempt (₹0 fee)
    const walkInEntry = {
      ...validBillableEntry,
      is_walkin: true,
      customer_id: null,
      guest_name: 'Walk-in Guest'
    };
    assert.strictEqual(
      isEntryBillable(walkInEntry),
      false,
      'Walk-in services must remain exempt from platform fees'
    );

    // 1c. Online customer who never checked in via QR
    const noCheckInEntry = {
      ...validBillableEntry,
      checked_in_at: null
    };
    assert.strictEqual(
      isEntryBillable(noCheckInEntry),
      false,
      'Service completed without customer QR arrival verification must not be billable'
    );

    // 1d. Cancelled service
    const cancelledEntry = {
      ...validBillableEntry,
      status: 'cancelled' as const,
      completed_at: null
    };
    assert.strictEqual(
      isEntryBillable(cancelledEntry),
      false,
      'Cancelled queue entries must not be billable'
    );

    // 1e. No-show service
    const noShowEntry = {
      ...validBillableEntry,
      status: 'no_show' as const,
      completed_at: null
    };
    assert.strictEqual(
      isEntryBillable(noShowEntry),
      false,
      'No-show queue entries must not be billable'
    );
  });

  // =========================================================================
  // 2. Platform Fee Calculation & Invoicing Consistency
  // =========================================================================
  await t.test('2. Fee Calculations & Dispute Windows', () => {
    // 10 billable cuts @ ₹5
    const fee10 = calculatePlatformFee(10);
    assert.strictEqual(fee10.count, 10);
    assert.strictEqual(fee10.rate, 5.0);
    assert.strictEqual(fee10.totalAmount, 50.0);
    assert.strictEqual(fee10.currency, 'INR');

    // 0 billable cuts
    const fee0 = calculatePlatformFee(0);
    assert.strictEqual(fee0.totalAmount, 0.0);

    // Formatted currency display
    assert.strictEqual(formatFeeAmount(50), 'Rs 50.00');

    // Dispute window logic
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

    assert.strictEqual(
      isFeeDisputable({ status: 'pending', disputed_until: futureDate }),
      true,
      'Pending fee within active 7-day window must be disputable'
    );

    assert.strictEqual(
      isFeeDisputable({ status: 'pending', disputed_until: pastDate }),
      false,
      'Pending fee past the dispute window must no longer be disputable'
    );

    assert.strictEqual(
      isFeeDisputable({ status: 'paid', disputed_until: futureDate }),
      false,
      'Already settled/paid fee record cannot be disputed'
    );
  });

  // =========================================================================
  // 3. Waiting Time Calculations (No Double-Counting)
  // =========================================================================
  await t.test('3. Waiting Time Estimation - Accuracy & Deduplication', () => {
    const servicesMap = {
      'svc-haircut': { id: 'svc-haircut', avg_minutes: 25 },
      'svc-beard': { id: 'svc-beard', avg_minutes: 15 }
    };

    const targetEntry = {
      id: 'target-ticket',
      shop_id: 'shop-crown',
      service_id: 'svc-haircut',
      status: 'waiting' as const,
      created_at: '2026-10-23T10:15:00Z',
      queue_number: 3,
      is_walkin: false,
      is_billable: false,
      queue_date: '2026-10-23',
      customer_id: 'cust-target',
      barber_id: null,
      guest_name: null,
      guest_phone: null,
      qr_code_token: 'TOKEN-3',
      checked_in_at: null,
      called_at: null,
      completed_at: null,
      updated_at: '2026-10-23T10:15:00Z'
    };

    const queueEntries = [
      // 1. In service (25 mins)
      {
        id: 'in-service-ticket',
        shop_id: 'shop-crown',
        service_id: 'svc-haircut',
        status: 'in_service' as const,
        created_at: '2026-10-23T09:45:00Z',
        queue_number: 1,
        is_walkin: false,
        is_billable: false,
        queue_date: '2026-10-23',
        customer_id: 'cust-1',
        barber_id: null,
        guest_name: null,
        guest_phone: null,
        qr_code_token: 'TOKEN-1',
        checked_in_at: '2026-10-23T09:45:00Z',
        called_at: '2026-10-23T10:00:00Z',
        completed_at: null,
        updated_at: '2026-10-23T10:00:00Z'
      },
      // 2. Waiting ahead (15 mins)
      {
        id: 'waiting-ahead-ticket',
        shop_id: 'shop-crown',
        service_id: 'svc-beard',
        status: 'waiting' as const,
        created_at: '2026-10-23T10:00:00Z',
        queue_number: 2,
        is_walkin: false,
        is_billable: false,
        queue_date: '2026-10-23',
        customer_id: 'cust-2',
        barber_id: null,
        guest_name: null,
        guest_phone: null,
        qr_code_token: 'TOKEN-2',
        checked_in_at: null,
        called_at: null,
        completed_at: null,
        updated_at: '2026-10-23T10:00:00Z'
      },
      // 3. The target ticket
      targetEntry,
      // 4. Ticket behind (must NOT be counted in wait time)
      {
        id: 'behind-ticket',
        shop_id: 'shop-crown',
        service_id: 'svc-haircut',
        status: 'waiting' as const,
        created_at: '2026-10-23T10:30:00Z',
        queue_number: 4,
        is_walkin: false,
        is_billable: false,
        queue_date: '2026-10-23',
        customer_id: 'cust-4',
        barber_id: null,
        guest_name: null,
        guest_phone: null,
        qr_code_token: 'TOKEN-4',
        checked_in_at: null,
        called_at: null,
        completed_at: null,
        updated_at: '2026-10-23T10:30:00Z'
      }
    ];

    const calculation = calculateEstimatedWaitTime({
      targetEntryId: 'target-ticket',
      queueEntries,
      servicesMap
    });

    // 25 mins (in chair) + 15 mins (waiting ahead) = 40 mins
    assert.strictEqual(calculation.estimatedMinutes, 40, 'Should accurately sum services ahead (25 + 15 = 40)');
    assert.strictEqual(calculation.peopleAhead, 2, 'Should count exactly 2 customers ahead');
    assert.strictEqual(calculation.isEstimate, true, 'Result must be designated as an estimate');

    // Display format tests
    assert.strictEqual(formatEstimatedWaitDisplay(0), 'Ready next (Est. < 5 mins)');
    assert.strictEqual(formatEstimatedWaitDisplay(40), '~40 mins (Est.)');
    assert.strictEqual(formatEstimatedWaitDisplay(75), '~1h 15m (Est.)');
    assert.strictEqual(formatEstimatedWaitDisplay(120), '~2h (Est.)');
  });

  // =========================================================================
  // 4. QR Token Generation & Tampering Prevention
  // =========================================================================
  await t.test('4. QR Encoding & Payload Verification', () => {
    const entryId = '50000000-0000-0000-0000-000000000001';
    const shopId = '10000000-0000-0000-0000-000000000001';
    const token = 'TOKEN-SECURE-ABC-123';

    const encodedQR = generateQueueQRPayload(entryId, shopId, token);
    assert.ok(typeof encodedQR === 'string');

    // Parse valid payload
    const parsed = parseQueueQRPayload(encodedQR);
    assert.ok(parsed !== null);
    assert.strictEqual(parsed.platform, 'QuickCut');
    assert.strictEqual(parsed.entryId, entryId);
    assert.strictEqual(parsed.shopId, shopId);
    assert.strictEqual(parsed.token, token);

    // Reject invalid / corrupted QR strings
    assert.strictEqual(parseQueueQRPayload('random string'), null);
    assert.strictEqual(parseQueueQRPayload('{"platform":"OtherApp"}'), null);
    assert.strictEqual(parseQueueQRPayload(''), null);
  });

  // =========================================================================
  // 5. Concurrency & Duplicate Queue Prevention Invariant Simulation
  // =========================================================================
  await t.test('5. Duplicate Active Queue Invariant', () => {
    const activeCustomerQueues = new Set<string>();

    function tryJoinQueue(customerId: string, shopId: string) {
      if (activeCustomerQueues.has(customerId)) {
        throw new Error('Customer already holds an active queue ticket across the platform.');
      }
      activeCustomerQueues.add(customerId);
      return { success: true, customerId, shopId };
    }

    // Customer joins shop 1 -> success
    const join1 = tryJoinQueue('customer-42', 'shop-1');
    assert.strictEqual(join1.success, true);

    // Customer tries to join shop 2 while ticket 1 is active -> rejected
    assert.throws(() => {
      tryJoinQueue('customer-42', 'shop-2');
    }, /already holds an active queue ticket/);

    // After completing service -> allowed to join again
    activeCustomerQueues.delete('customer-42');
    const join2 = tryJoinQueue('customer-42', 'shop-2');
    assert.strictEqual(join2.success, true);
  });

  // =========================================================================
  // 6. Repeatable Invoice Invariant Simulation
  // =========================================================================
  await t.test('6. Repeatable Invoice Generation (Paid Balance Protection)', () => {
    interface Invoice {
      id: string;
      shop_id: string;
      month: string;
      billable_count: number;
      amount: number;
      status: 'pending' | 'paid';
    }

    const invoices = new Map<string, Invoice>();

    function generateInvoice(shopId: string, month: string, billableCount: number): Invoice {
      const key = `${shopId}-${month}`;
      const existing = invoices.get(key);

      // Invariant: If invoice was already settled/paid, NEVER overwrite or corrupt
      if (existing && existing.status === 'paid') {
        return existing;
      }

      const invoice: Invoice = {
        id: existing?.id || 'inv-' + Math.random().toString(36).slice(2, 9),
        shop_id: shopId,
        month,
        billable_count: billableCount,
        amount: billableCount * PLATFORM_CONFIG.BILLABLE_FEE_PER_SERVICE,
        status: existing?.status || 'pending'
      };

      invoices.set(key, invoice);
      return invoice;
    }

    // Month 1: 20 billable services -> ₹100 pending
    const inv1 = generateInvoice('shop-1', '2026-10', 20);
    assert.strictEqual(inv1.amount, 100);
    assert.strictEqual(inv1.status, 'pending');

    // Owner settles invoice
    inv1.status = 'paid';

    // Repeatable trigger executes again for the same month
    const invRepeat = generateInvoice('shop-1', '2026-10', 25);
    assert.strictEqual(invRepeat.status, 'paid', 'Paid status must be preserved');
    assert.strictEqual(invRepeat.amount, 100, 'Paid amount must not be altered');
  });
});
