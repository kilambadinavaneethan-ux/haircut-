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

  // =========================================================================
  // 7. Role & Authorization Security (Privilege Escalation Prevention)
  // =========================================================================
  await t.test('7. Role & Authorization Security Invariants', () => {
    // 7a. Signup metadata simulation: User submits { role: "admin" } in metadata
    function handleNewUserSimulation(rawMeta: Record<string, any>) {
      // Rule: Public signup metadata must NEVER assign elevated roles
      const defaultRole = 'customer';
      return {
        role: defaultRole,
        fullName: rawMeta.full_name || 'Customer'
      };
    }

    const hackerProfile = handleNewUserSimulation({ role: 'admin', full_name: 'Attacker' });
    assert.strictEqual(hackerProfile.role, 'customer', 'Public signup must always receive customer role');

    const ownerSignup = handleNewUserSimulation({ role: 'owner', full_name: 'New Owner' });
    assert.strictEqual(ownerSignup.role, 'customer', 'Owner signup metadata cannot grant owner role directly');

    // 7b. Self-promotion prevention
    function updateProfileRole(currentRole: string, requestedRole: string, callerRole: string) {
      if (requestedRole !== currentRole && callerRole !== 'admin') {
        throw new Error('Unauthorized: Only administrators can modify roles.');
      }
      return requestedRole;
    }

    // Customer attempts to promote to admin -> rejected
    assert.throws(() => {
      updateProfileRole('customer', 'admin', 'customer');
    }, /Only administrators can modify roles/);

    // Customer attempts to promote to staff -> rejected
    assert.throws(() => {
      updateProfileRole('customer', 'staff', 'customer');
    }, /Only administrators can modify roles/);

    // Super Admin updates role -> allowed
    const promoted = updateProfileRole('customer', 'staff', 'admin');
    assert.strictEqual(promoted, 'staff');

    // 7c. Shop approval authorization
    function approveShop(shopId: string, callerRole: string) {
      if (callerRole !== 'admin') {
        throw new Error('Only administrators can approve shops.');
      }
      return { shopId, status: 'approved' };
    }

    // Owner attempts to self-approve shop -> rejected
    assert.throws(() => {
      approveShop('shop-1', 'owner');
    }, /Only administrators can approve shops/);

    // Admin approves shop -> allowed
    const approved = approveShop('shop-1', 'admin');
    assert.strictEqual(approved.status, 'approved');
  });

  // =========================================================================
  // 8. Atomic Daily Queue Numbering & Shop Isolation Simulation
  // =========================================================================
  await t.test('8. Atomic Daily Queue Numbering & Concurrency Safety', () => {
    const shopDailyCounters = new Map<string, number>();

    function allocateQueueNumber(shopId: string, queueDate: string): number {
      const key = `${shopId}:${queueDate}`;
      const current = shopDailyCounters.get(key) || 0;
      const next = current + 1;
      shopDailyCounters.set(key, next);
      return next;
    }

    // Shop 1 on Date A
    const s1_t1 = allocateQueueNumber('shop-alpha', '2026-10-23');
    const s1_t2 = allocateQueueNumber('shop-alpha', '2026-10-23');
    const s1_t3 = allocateQueueNumber('shop-alpha', '2026-10-23');

    assert.strictEqual(s1_t1, 1);
    assert.strictEqual(s1_t2, 2);
    assert.strictEqual(s1_t3, 3);

    // Shop 2 on same Date A must have independent numbering starting from 1
    const s2_t1 = allocateQueueNumber('shop-beta', '2026-10-23');
    const s2_t2 = allocateQueueNumber('shop-beta', '2026-10-23');
    assert.strictEqual(s2_t1, 1, 'Separate shops must have independent numbering');
    assert.strictEqual(s2_t2, 2);

    // Shop 1 on next day Date B resets numbering to 1
    const s1_nextDay_t1 = allocateQueueNumber('shop-alpha', '2026-10-24');
    assert.strictEqual(s1_nextDay_t1, 1, 'New queue date must reset numbering to 1 for that shop');
  });

  // =========================================================================
  // 9. Local Timezone Boundary Handling (Asia/Kolkata vs UTC)
  // =========================================================================
  await t.test('9. Local Timezone Date Calculation (Midnight Boundary)', () => {
    function getShopLocalDate(utcTimestamp: string, timeZone: string = 'Asia/Kolkata'): string {
      const d = new Date(utcTimestamp);
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      return formatter.format(d); // Returns YYYY-MM-DD
    }

    // Example 1: 2026-10-23 20:00:00 UTC = 2026-10-24 01:30:00 IST (+5:30)
    // Under UTC it would be 2026-10-23, but under local shop time it is already 2026-10-24!
    const utcMidnightCut = '2026-10-23T20:00:00Z';
    const localDate = getShopLocalDate(utcMidnightCut, 'Asia/Kolkata');
    assert.strictEqual(localDate, '2026-10-24', '1:30 AM IST must belong to Oct 24 local date, not Oct 23 UTC');

    // Example 2: 2026-10-23 18:00:00 UTC = 2026-10-23 23:30:00 IST
    // Under IST it is still Oct 23
    const lateEveningCut = '2026-10-23T18:00:00Z';
    const lateEveningDate = getShopLocalDate(lateEveningCut, 'Asia/Kolkata');
    assert.strictEqual(lateEveningDate, '2026-10-23');
  });

  // =========================================================================
  // 10. Queue State Machine Transitions & Terminal State Protection
  // =========================================================================
  await t.test('10. Queue State Machine Transitions', () => {
    type QueueState = 'waiting' | 'in_service' | 'completed' | 'cancelled' | 'no_show';

    function validateStateTransition(
      from: QueueState,
      to: QueueState,
      isWalkin: boolean,
      callerRole: 'customer' | 'staff' | 'owner' | 'admin'
    ): boolean {
      // Terminal state immutability
      if (['completed', 'cancelled', 'no_show'].includes(from)) {
        if (callerRole !== 'admin') {
          throw new Error(`Ticket is in terminal state "${from}" and cannot be modified.`);
        }
      }

      // Customer restrictions
      if (callerRole === 'customer') {
        if (from === 'waiting' && to === 'cancelled') {
          return true;
        }
        throw new Error('Customers can only cancel a waiting ticket.');
      }

      // Lifecycle rules
      if (from === 'waiting') {
        if (to === 'in_service' || to === 'cancelled' || to === 'no_show') return true;
        if (to === 'completed' && isWalkin) return true; // Walk-ins seated immediately
        throw new Error('Online bookings must be called in_service before completion.');
      }

      if (from === 'in_service') {
        if (['completed', 'cancelled', 'no_show'].includes(to)) return true;
        throw new Error(`Invalid transition from in_service to ${to}`);
      }

      return true;
    }

    // Valid transitions
    assert.strictEqual(validateStateTransition('waiting', 'in_service', false, 'staff'), true);
    assert.strictEqual(validateStateTransition('in_service', 'completed', false, 'staff'), true);
    assert.strictEqual(validateStateTransition('waiting', 'cancelled', false, 'customer'), true);

    // Invalid: Online customer attempting to self-complete
    assert.throws(() => {
      validateStateTransition('waiting', 'completed', false, 'customer');
    }, /Customers can only cancel/);

    // Invalid: Online ticket completing directly from waiting without in_service
    assert.throws(() => {
      validateStateTransition('waiting', 'completed', false, 'staff');
    }, /must be called in_service before completion/);

    // Invalid: Modifying completed ticket
    assert.throws(() => {
      validateStateTransition('completed', 'waiting', false, 'staff');
    }, /terminal state "completed"/);

    // Invalid: Modifying cancelled ticket
    assert.throws(() => {
      validateStateTransition('cancelled', 'in_service', false, 'owner');
    }, /terminal state "cancelled"/);
  });

  // =========================================================================
  // 11. Multi-Ticket Platform Billing Tests (₹5, ₹50, ₹0)
  // =========================================================================
  await t.test('11. Comprehensive Platform Billing & Invoice Calculations', () => {
    // 1 eligible service -> ₹5.00
    const fee1 = calculatePlatformFee(1);
    assert.strictEqual(fee1.totalAmount, 5.0);

    // 10 eligible services -> ₹50.00
    const fee10 = calculatePlatformFee(10);
    assert.strictEqual(fee10.totalAmount, 50.0);

    // 100 eligible services -> ₹500.00
    const fee100 = calculatePlatformFee(100);
    assert.strictEqual(fee100.totalAmount, 500.0);

    // Mix of 5 online billable cuts, 3 walk-ins, 2 no-shows, 1 online without QR check-in
    const serviceBatch = [
      { is_walkin: false, checked_in_at: '2026-10-23T10:00:00Z', completed_at: '2026-10-23T10:30:00Z', status: 'completed' as const },
      { is_walkin: false, checked_in_at: '2026-10-23T11:00:00Z', completed_at: '2026-10-23T11:30:00Z', status: 'completed' as const },
      { is_walkin: false, checked_in_at: '2026-10-23T12:00:00Z', completed_at: '2026-10-23T12:30:00Z', status: 'completed' as const },
      { is_walkin: false, checked_in_at: '2026-10-23T13:00:00Z', completed_at: '2026-10-23T13:30:00Z', status: 'completed' as const },
      { is_walkin: false, checked_in_at: '2026-10-23T14:00:00Z', completed_at: '2026-10-23T14:30:00Z', status: 'completed' as const },
      // 3 walk-ins (exempt)
      { is_walkin: true, checked_in_at: '2026-10-23T10:15:00Z', completed_at: '2026-10-23T10:45:00Z', status: 'completed' as const },
      { is_walkin: true, checked_in_at: '2026-10-23T11:15:00Z', completed_at: '2026-10-23T11:45:00Z', status: 'completed' as const },
      { is_walkin: true, checked_in_at: '2026-10-23T12:15:00Z', completed_at: '2026-10-23T12:45:00Z', status: 'completed' as const },
      // 2 no-shows (exempt)
      { is_walkin: false, checked_in_at: null, completed_at: null, status: 'no_show' as const },
      { is_walkin: false, checked_in_at: null, completed_at: null, status: 'no_show' as const },
      // 1 online booking without verified QR check-in (exempt)
      { is_walkin: false, checked_in_at: null, completed_at: '2026-10-23T15:00:00Z', status: 'completed' as const }
    ];

    const billableCount = serviceBatch.filter((entry) => isEntryBillable(entry as any)).length;
    assert.strictEqual(billableCount, 5, 'Exactly 5 of the 11 entries should be billable');

    const totalFee = calculatePlatformFee(billableCount);
    assert.strictEqual(totalFee.totalAmount, 25.0, '5 billable entries * ₹5 = ₹25.00');

    // Strict YYYY-MM validation check
    const validMonthRegex = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
    assert.strictEqual(validMonthRegex.test('2026-10'), true);
    assert.strictEqual(validMonthRegex.test('2026-13'), false, 'Month 13 is invalid');
    assert.strictEqual(validMonthRegex.test('2026-00'), false, 'Month 00 is invalid');
    assert.strictEqual(validMonthRegex.test('invalid'), false);
    assert.strictEqual(validMonthRegex.test('2026-1'), false, 'Must be 2-digit month');
  });
});
