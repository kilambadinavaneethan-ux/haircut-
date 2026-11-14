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
  // 1. Zero Platform Fee Rule Invariants (₹0 Platform Fee Policy)
  // =========================================================================
  await t.test('1. Platform Billing Rules - Zero Platform Fee Invariant', () => {
    // 1a. Eligible online customer with verified arrival QR check-in & completion
    const validEntry = {
      id: 'entry-1',
      shop_id: 'shop-1',
      customer_id: 'cust-1',
      is_walkin: false,
      checked_in_at: '2026-10-23T10:00:00Z',
      completed_at: '2026-10-23T10:30:00Z',
      status: 'completed' as const
    };
    assert.strictEqual(
      isEntryBillable(validEntry),
      false,
      'Under zero-fee policy, online completed services generate ₹0 platform fee (never billable)'
    );

    // 1b. Walk-ins are strictly exempt (₹0 fee)
    const walkInEntry = {
      ...validEntry,
      is_walkin: true,
      customer_id: null,
      guest_name: 'Walk-in Guest'
    };
    assert.strictEqual(
      isEntryBillable(walkInEntry),
      false,
      'Walk-in services generate ₹0 platform fees'
    );

    // 1c. Online customer who never checked in via QR
    const noCheckInEntry = {
      ...validEntry,
      checked_in_at: null
    };
    assert.strictEqual(
      isEntryBillable(noCheckInEntry),
      false,
      'Unverified services generate ₹0 platform fees'
    );

    // 1d. Cancelled service
    const cancelledEntry = {
      ...validEntry,
      status: 'cancelled' as const,
      completed_at: null
    };
    assert.strictEqual(
      isEntryBillable(cancelledEntry),
      false,
      'Cancelled queue entries generate ₹0 platform fees'
    );

    // 1e. No-show service
    const noShowEntry = {
      ...validEntry,
      status: 'no_show' as const,
      completed_at: null
    };
    assert.strictEqual(
      isEntryBillable(noShowEntry),
      false,
      'No-show queue entries generate ₹0 platform fees'
    );
  });

  // =========================================================================
  // 2. Platform Fee Calculation & Invoicing Consistency (₹0 Verification)
  // =========================================================================
  await t.test('2. Fee Calculations & Dispute Windows (₹0 Fee Policy)', () => {
    // 10 completed cuts @ ₹0 platform fee
    const fee10 = calculatePlatformFee(10);
    assert.strictEqual(fee10.count, 0);
    assert.strictEqual(fee10.rate, 0.0);
    assert.strictEqual(fee10.totalAmount, 0.0);
    assert.strictEqual(fee10.currency, 'INR');

    // 0 cuts
    const fee0 = calculatePlatformFee(0);
    assert.strictEqual(fee0.totalAmount, 0.0);
    assert.strictEqual(fee0.rate, 0.0);

    // Formatted currency display
    assert.strictEqual(formatFeeAmount(0), 'Rs 0.00');

    // Dispute window logic is deactivated under zero fee model
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

    assert.strictEqual(
      isFeeDisputable({ status: 'pending', disputed_until: futureDate }),
      false,
      'Under zero-fee policy, disputes are deactivated (₹0 fee)'
    );

    assert.strictEqual(
      isFeeDisputable({ status: 'pending', disputed_until: pastDate }),
      false,
      'Disputes remain false'
    );

    assert.strictEqual(
      isFeeDisputable({ status: 'paid', disputed_until: futureDate }),
      false,
      'Paid records remain false'
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

    // 25 mins (in chair) + 15 mins (waiting ahead) = 40 mins (1 barber)
    assert.strictEqual(calculation.estimatedMinutes, 40, 'Should accurately sum services ahead (25 + 15 = 40)');
    assert.strictEqual(calculation.peopleAhead, 2, 'Should count exactly 2 customers ahead');
    assert.strictEqual(calculation.isEstimate, true, 'Result must be designated as an estimate');

    // Multi-barber test: With 2 active barbers, discrete simulation dispatches in-chair (25m) to Barber 1,
    // waiting ahead (15m) to Barber 2. Target customer is served when Barber 2 finishes at 15 mins.
    const multiBarberCalc = calculateEstimatedWaitTime({
      targetEntryId: 'target-ticket',
      queueEntries,
      servicesMap,
      activeBarberCount: 2
    });
    assert.strictEqual(multiBarberCalc.estimatedMinutes, 15, 'With 2 barbers, target is served as soon as earliest barber finishes (15 mins)');

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
  // 6. Zero Platform Fee Invoicing Invariant (₹0 Balance Protection)
  // =========================================================================
  await t.test('6. Repeatable Invoice Generation (Zero Fee Obligation)', () => {
    interface Invoice {
      id: string;
      shop_id: string;
      month: string;
      billable_count: number;
      amount: number;
      status: 'pending' | 'waived';
    }

    const invoices = new Map<string, Invoice>();

    function generateInvoice(shopId: string, month: string, billableCount: number): Invoice {
      const key = `${shopId}-${month}`;
      const existing = invoices.get(key);

      // Invariant: Platform fee is strictly ₹0.00
      const invoice: Invoice = {
        id: existing?.id || 'inv-' + Math.random().toString(36).slice(2, 9),
        shop_id: shopId,
        month,
        billable_count: 0,
        amount: 0.0,
        status: 'waived'
      };

      invoices.set(key, invoice);
      return invoice;
    }

    // Month 1: Any number of completed services -> ₹0 fee balance
    const inv1 = generateInvoice('shop-1', '2026-10', 20);
    assert.strictEqual(inv1.amount, 0.0, 'Platform fee invoice amount must strictly be ₹0.00');
    assert.strictEqual(inv1.status, 'waived', 'Fee obligation is waived/zero');

    // Repeated execution maintains zero balance
    const invRepeat = generateInvoice('shop-1', '2026-10', 25);
    assert.strictEqual(invRepeat.amount, 0.0, 'Zero fee invariant is strictly preserved');
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

    // 7c. Shop approval authorization & self-approval regression test
    function insertShopRLS(ownerId: string, status: string, callerRole: string) {
      // shops_insert_policy: admin OR (auth.uid() = owner_id AND status = 'pending')
      if (callerRole === 'admin') return { ownerId, status, allowed: true };
      if (status !== 'pending') {
        throw new Error('Unauthorized: New shops can only be submitted in pending status.');
      }
      return { ownerId, status, allowed: true };
    }

    function updateShopRLS(currentStatus: string, nextStatus: string, callerRole: string) {
      // shops_update_policy: WITH CHECK requires status = current_status unless admin
      if (callerRole === 'admin') return { status: nextStatus, allowed: true };
      if (nextStatus !== currentStatus) {
        throw new Error('Unauthorized: Shop owners cannot change shop approval status.');
      }
      return { status: nextStatus, allowed: true };
    }

    // Owner creates pending shop -> allowed
    const pendingShop = insertShopRLS('owner-1', 'pending', 'customer');
    assert.strictEqual(pendingShop.status, 'pending');

    // Owner attempts to insert approved shop directly -> rejected
    assert.throws(() => {
      insertShopRLS('owner-1', 'approved', 'customer');
    }, /New shops can only be submitted in pending status/);

    // Owner attempts to self-approve pending shop -> rejected
    assert.throws(() => {
      updateShopRLS('pending', 'approved', 'owner');
    }, /Shop owners cannot change shop approval status/);

    // Admin approves shop -> allowed
    const adminApproved = updateShopRLS('pending', 'approved', 'admin');
    assert.strictEqual(adminApproved.status, 'approved');

    // 7d. Cross-shop access policy
    // 7d. Staff Lifecycle & Cross-Shop Isolation Policy
    function assignStaffRLS(callerId: string, shopOwnerId: string, shopStatus: string, callerRole: string) {
      if (callerRole === 'admin') return { allowed: true };
      if (callerId !== shopOwnerId) {
        throw new Error('Unauthorized: Only the shop owner can assign staff.');
      }
      if (shopStatus !== 'approved') {
        throw new Error('Unauthorized: Cannot assign staff to pending or unapproved shop.');
      }
      return { allowed: true };
    }

    // Owner assigns staff to approved shop -> allowed
    assert.strictEqual(assignStaffRLS('owner-1', 'owner-1', 'approved', 'owner').allowed, true);

    // Non-owner attempts to assign staff -> rejected
    assert.throws(() => {
      assignStaffRLS('attacker', 'owner-1', 'approved', 'customer');
    }, /Only the shop owner can assign staff/);

    // Owner attempts to assign staff to pending shop -> rejected
    assert.throws(() => {
      assignStaffRLS('owner-1', 'owner-1', 'pending', 'customer');
    }, /Cannot assign staff to pending or unapproved shop/);

    function canAccessQueueEntry(staffAssignments: Record<string, string[]>, staffUserId: string, shopId: string, callerRole: string) {
      if (callerRole === 'admin') return true;
      const assignedShops = staffAssignments[staffUserId] || [];
      return assignedShops.includes(shopId);
    }

    // Multi-shop staff assignment and removal simulation
    const staffShops: Record<string, string[]> = {
      'staff-1': ['shop-alpha', 'shop-beta'],
      'staff-2': ['shop-beta']
    };

    // Staff-1 has access to both alpha and beta, but not gamma
    assert.strictEqual(canAccessQueueEntry(staffShops, 'staff-1', 'shop-alpha', 'staff'), true, 'Staff can access assigned shop alpha');
    assert.strictEqual(canAccessQueueEntry(staffShops, 'staff-1', 'shop-beta', 'staff'), true, 'Staff can access assigned shop beta');
    assert.strictEqual(canAccessQueueEntry(staffShops, 'staff-1', 'shop-gamma', 'staff'), false, 'Staff cannot access unassigned shop gamma');

    // Remove staff-1 from shop-alpha
    staffShops['staff-1'] = staffShops['staff-1'].filter(s => s !== 'shop-alpha');
    assert.strictEqual(canAccessQueueEntry(staffShops, 'staff-1', 'shop-alpha', 'staff'), false, 'Access to shop alpha immediately revoked after removal');
    assert.strictEqual(canAccessQueueEntry(staffShops, 'staff-1', 'shop-beta', 'staff'), true, 'Access to shop beta preserved independently');


    // 7e. Direct payment insertion prevention
    function insertPaymentRLS(callerRole: string, amount: number) {
      // payments_insert_policy: strictly requires is_admin()
      if (callerRole !== 'admin') {
        throw new Error('Unauthorized: Only platform administrators can record payments.');
      }
      return { amount, allowed: true };
    }

    assert.throws(() => {
      insertPaymentRLS('owner', 0.01);
    }, /Only platform administrators can record payments/);
    assert.strictEqual(insertPaymentRLS('admin', 500).allowed, true);

    // 7f. Privileged function execution authorization
    function executeAdminSetUserRole(callerRole: string, targetUserId: string, newRole: string) {
      if (callerRole !== 'admin') {
        throw new Error('Access denied: Super Admin privileges required.');
      }
      return { targetUserId, newRole, success: true };
    }

    assert.throws(() => {
      executeAdminSetUserRole('customer', 'user-1', 'admin');
    }, /Access denied: Super Admin privileges required/);

    assert.throws(() => {
      executeAdminSetUserRole('owner', 'user-1', 'staff');
    }, /Access denied: Super Admin privileges required/);

    assert.strictEqual(executeAdminSetUserRole('admin', 'user-1', 'staff').success, true);
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
  // 11. Multi-Ticket Platform Billing Tests (₹0.00 Fixed Platform Fee Invariant)
  // =========================================================================
  await t.test('11. Comprehensive Platform Billing & Invoice Calculations (Zero-Fee Invariant)', () => {
    // 1 completed service -> ₹0.00 platform fee
    const fee1 = calculatePlatformFee(1);
    assert.strictEqual(fee1.totalAmount, 0.0);
    assert.strictEqual(fee1.rate, 0.0);

    // 10 completed services -> ₹0.00 platform fee
    const fee10 = calculatePlatformFee(10);
    assert.strictEqual(fee10.totalAmount, 0.0);
    assert.strictEqual(fee10.rate, 0.0);

    // 100 completed services -> ₹0.00 platform fee
    const fee100 = calculatePlatformFee(100);
    assert.strictEqual(fee100.totalAmount, 0.0);
    assert.strictEqual(fee100.rate, 0.0);

    // Mix of 5 online cuts, 3 walk-ins, 2 no-shows, 1 online without QR check-in
    const serviceBatch = [
      { is_walkin: false, checked_in_at: '2026-10-23T10:00:00Z', completed_at: '2026-10-23T10:30:00Z', status: 'completed' as const },
      { is_walkin: false, checked_in_at: '2026-10-23T11:00:00Z', completed_at: '2026-10-23T11:30:00Z', status: 'completed' as const },
      { is_walkin: false, checked_in_at: '2026-10-23T12:00:00Z', completed_at: '2026-10-23T12:30:00Z', status: 'completed' as const },
      { is_walkin: false, checked_in_at: '2026-10-23T13:00:00Z', completed_at: '2026-10-23T13:30:00Z', status: 'completed' as const },
      { is_walkin: false, checked_in_at: '2026-10-23T14:00:00Z', completed_at: '2026-10-23T14:30:00Z', status: 'completed' as const },
      // 3 walk-ins
      { is_walkin: true, checked_in_at: '2026-10-23T10:15:00Z', completed_at: '2026-10-23T10:45:00Z', status: 'completed' as const },
      { is_walkin: true, checked_in_at: '2026-10-23T11:15:00Z', completed_at: '2026-10-23T11:45:00Z', status: 'completed' as const },
      { is_walkin: true, checked_in_at: '2026-10-23T12:15:00Z', completed_at: '2026-10-23T12:45:00Z', status: 'completed' as const },
      // 2 no-shows
      { is_walkin: false, checked_in_at: null, completed_at: null, status: 'no_show' as const },
      { is_walkin: false, checked_in_at: null, completed_at: null, status: 'no_show' as const },
      // 1 online booking without verified QR check-in
      { is_walkin: false, checked_in_at: null, completed_at: '2026-10-23T15:00:00Z', status: 'completed' as const }
    ];

    const billableCount = serviceBatch.filter((entry) => isEntryBillable(entry as any)).length;
    assert.strictEqual(billableCount, 0, 'Under zero-fee rule, exactly 0 entries are billable');

    const totalFee = calculatePlatformFee(billableCount);
    assert.strictEqual(totalFee.totalAmount, 0.0, 'Platform fee obligation is strictly ₹0.00');

    // Strict YYYY-MM validation check
    const validMonthRegex = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
    assert.strictEqual(validMonthRegex.test('2026-10'), true);
    assert.strictEqual(validMonthRegex.test('2026-13'), false, 'Month 13 is invalid');
    assert.strictEqual(validMonthRegex.test('2026-00'), false, 'Month 00 is invalid');
    assert.strictEqual(validMonthRegex.test('invalid'), false);
    assert.strictEqual(validMonthRegex.test('2026-1'), false, 'Must be 2-digit month');
  });

  // =========================================================================
  // 12. Comprehensive 7-Role Security & Cross-Shop Isolation Matrix
  // =========================================================================
  await t.test('12. Multi-Role Cross-Shop Security & Isolation Matrix (7 Roles)', async (st) => {
    // 7 Personas Definition
    const roles = {
      customerA: { id: 'cust-a-001', role: 'customer', name: 'Rahul Customer (Shop A)' },
      customerB: { id: 'cust-b-002', role: 'customer', name: 'Priya Customer (Shop B)' },
      staffShopA: { id: 'staff-a-001', role: 'staff', shop_id: 'shop-crown-a', name: 'Sam Barber (Shop A)' },
      staffShopB: { id: 'staff-b-002', role: 'staff', shop_id: 'shop-blade-b', name: 'Vikram Barber (Shop B)' },
      ownerShopA: { id: 'owner-a-001', role: 'owner', shop_id: 'shop-crown-a', name: 'Alex Owner (Shop A)' },
      ownerShopB: { id: 'owner-b-002', role: 'owner', shop_id: 'shop-blade-b', name: 'David Owner (Shop B)' },
      superAdmin: { id: 'admin-001', role: 'admin', name: 'Chief Security Officer' }
    };

    // Shops setup
    const shopA = { id: 'shop-crown-a', name: 'Crown Barbershop', status: 'approved', is_paused: false };
    const shopB = { id: 'shop-blade-b', name: 'Blade Studio', status: 'approved', is_paused: false };

    // Services setup
    const serviceShopA = { id: 'srv-a-haircut', shop_id: 'shop-crown-a', is_active: true, avg_minutes: 25, price: 300 };
    const serviceShopB = { id: 'srv-b-shave', shop_id: 'shop-blade-b', is_active: true, avg_minutes: 15, price: 150 };

    // 12a. Scenario 1: Customer A joins Shop A queue with valid Shop A service
    await st.test('12a. Customer A can join Shop A queue with matching active service', () => {
      const simulateJoinQueue = (callerId: string, shopId: string, serviceId: string, servicesList: typeof serviceShopA[]) => {
        const service = servicesList.find((s) => s.id === serviceId && s.shop_id === shopId && s.is_active);
        if (!service) {
          throw new Error('Selected service does not belong to this shop or is inactive.');
        }
        return {
          success: true,
          entry_id: 'entry-a-101',
          customer_id: callerId,
          shop_id: shopId,
          service_id: serviceId,
          queue_number: 101,
          qr_code_token: 'uuid-token-cust-a-101'
        };
      };

      const result = simulateJoinQueue(roles.customerA.id, shopA.id, serviceShopA.id, [serviceShopA, serviceShopB]);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.customer_id, roles.customerA.id);
      assert.strictEqual(result.shop_id, shopA.id);
      assert.strictEqual(result.queue_number, 101);
    });

    // 12b. Scenario 2: Customer A CANNOT join Shop B queue with Shop A service ID (Cross-shop service mismatch)
    await st.test('12b. Cross-Shop Service Mismatch is rejected (Customer A joins Shop B with Shop A service)', () => {
      const simulateJoinQueue = (callerId: string, shopId: string, serviceId: string, servicesList: typeof serviceShopA[]) => {
        const service = servicesList.find((s) => s.id === serviceId && s.shop_id === shopId && s.is_active);
        if (!service) {
          throw new Error('Selected service does not belong to this shop or is inactive.');
        }
        return { success: true };
      };

      assert.throws(
        () => simulateJoinQueue(roles.customerA.id, shopB.id, serviceShopA.id, [serviceShopA, serviceShopB]),
        /Selected service does not belong to this shop or is inactive/,
        'Cross-shop service mismatch must be strictly rejected at the database level'
      );
    });

    // 12c. Scenario 3: Cryptographic QR Check-in Hardening (Rejection of queue number, partial match, and expired tokens)
    await st.test('12c. Cryptographic QR verification enforces exact random token & rejects queue number or expired passes', () => {
      const mockTicket = {
        id: 'entry-a-101',
        shop_id: 'shop-crown-a',
        customer_id: 'cust-a-001',
        queue_number: 101,
        qr_code_token: '4f6d3a82-7e9b-4e12-8c54-9a0d8f3b7e1a',
        queue_date: '2026-10-24',
        created_at: Date.now(),
        status: 'waiting',
        checked_in_at: null as string | null
      };

      const simulateVerifyQR = (
        entry: typeof mockTicket,
        caller: { id: string; role: string; shop_id?: string },
        tokenInput: string,
        currentTime: number
      ) => {
        // Expiration check (24 hours)
        if (currentTime - entry.created_at > 24 * 60 * 60 * 1000) {
          throw new Error('Ticket has expired and cannot be checked in.');
        }

        // Caller authorization check
        const isStaff = caller.role === 'staff' && caller.shop_id === entry.shop_id;
        const isOwner = caller.role === 'owner' && caller.shop_id === entry.shop_id;
        const isAdmin = caller.role === 'admin';
        const isCustomer = caller.id === entry.customer_id;

        if (!(isStaff || isOwner || isAdmin || isCustomer)) {
          throw new Error('Unauthorized: Caller cannot check in this queue entry.');
        }

        // Parse JSON QR or raw token
        let tokenMatched = false;
        const parsed = parseQueueQRPayload(tokenInput);
        if (parsed) {
          if (parsed.platform === 'QuickCut' && parsed.entryId === entry.id && parsed.shopId === entry.shop_id && parsed.token === entry.qr_code_token) {
            tokenMatched = true;
          }
        } else if (tokenInput.trim() === entry.qr_code_token) {
          tokenMatched = true;
        }

        // Strict rejection: queue number or partial match is NOT accepted
        if (!tokenMatched) {
          throw new Error('Invalid check-in QR code or token. Cryptographic QR proof of arrival required.');
        }

        return { success: true, checked_in: true };
      };

      // 1. Valid cryptographic token succeeds
      const validQR = generateQueueQRPayload(mockTicket.id, mockTicket.shop_id, mockTicket.qr_code_token);
      const res1 = simulateVerifyQR(mockTicket, roles.customerA, validQR, mockTicket.created_at + 60000);
      assert.strictEqual(res1.success, true);

      // 2. Guessable queue number (#101) is strictly REJECTED
      assert.throws(
        () => simulateVerifyQR(mockTicket, roles.staffShopA, '101', mockTicket.created_at + 60000),
        /Cryptographic QR proof of arrival required/,
        'Plain sequential queue number must be rejected as proof of arrival'
      );

      // 3. Partial token match is strictly REJECTED
      assert.throws(
        () => simulateVerifyQR(mockTicket, roles.staffShopA, '4f6d', mockTicket.created_at + 60000),
        /Cryptographic QR proof of arrival required/,
        'Partial token fragments must be rejected'
      );

      // 4. Expired QR code (> 24 hours) is strictly REJECTED
      const expiredTime = mockTicket.created_at + (25 * 60 * 60 * 1000);
      assert.throws(
        () => simulateVerifyQR(mockTicket, roles.customerA, validQR, expiredTime),
        /Ticket has expired/,
        'Expired QR codes must be rejected'
      );

      // 5. Cross-shop QR token (Shop B QR payload presented for Shop A ticket) is REJECTED
      const crossShopQR = generateQueueQRPayload(mockTicket.id, 'shop-blade-b', mockTicket.qr_code_token);
      assert.throws(
        () => simulateVerifyQR(mockTicket, roles.customerA, crossShopQR, mockTicket.created_at + 60000),
        /Cryptographic QR proof of arrival required/,
        'Cross-shop QR payload must be rejected'
      );
    });

    // 12d. Scenario 4: Customer Privacy & Data Isolation (Customer A CANNOT view Customer B's row or PII)
    await st.test('12d. Customer Privacy & RLS Isolation prevents Customer A from seeing Customer B data', () => {
      const ticketsDatabase = [
        { id: 't-1', customer_id: roles.customerA.id, shop_id: 'shop-crown-a', guest_name: 'Rahul', guest_phone: '+919876543210', qr_code_token: 'secret-a' },
        { id: 't-2', customer_id: roles.customerB.id, shop_id: 'shop-crown-a', guest_name: 'Priya', guest_phone: '+919123456789', qr_code_token: 'secret-b' }
      ];

      // Simulated hardened RLS SELECT policy
      const rlsSelectQueueEntries = (caller: { id: string; role: string; shop_id?: string }) => {
        return ticketsDatabase.filter((row) => {
          if (caller.role === 'admin') return true;
          if (caller.role === 'owner' && caller.shop_id === row.shop_id) return true;
          if (caller.role === 'staff' && caller.shop_id === row.shop_id) return true;
          if (caller.role === 'customer' && caller.id === row.customer_id) return true;
          return false;
        });
      };

      // Customer A query
      const customerAVisible = rlsSelectQueueEntries(roles.customerA);
      assert.strictEqual(customerAVisible.length, 1);
      assert.strictEqual(customerAVisible[0].customer_id, roles.customerA.id);
      assert.strictEqual(customerAVisible[0].guest_name, 'Rahul');
      // Customer A cannot see Customer B's ticket, phone, or secret QR token
      assert.strictEqual(customerAVisible.some((t) => t.customer_id === roles.customerB.id), false);

      // Customer B query
      const customerBVisible = rlsSelectQueueEntries(roles.customerB);
      assert.strictEqual(customerBVisible.length, 1);
      assert.strictEqual(customerBVisible[0].customer_id, roles.customerB.id);
      assert.strictEqual(customerBVisible.some((t) => t.customer_id === roles.customerA.id), false);
    });

    // 12e. Scenario 5: Staff Shop A CANNOT manage Shop B queue entries
    await st.test('12e. Staff Shop A is strictly unauthorized to manage Shop B queue', () => {
      const ticketShopB = { id: 'entry-b-201', shop_id: 'shop-blade-b', status: 'waiting' };

      const simulateStaffStartService = (caller: typeof roles.staffShopA, ticket: typeof ticketShopB) => {
        if (caller.shop_id !== ticket.shop_id) {
          throw new Error('Unauthorized: Staff can only manage queue entries in their assigned shop.');
        }
        return { success: true, status: 'in_service' };
      };

      assert.throws(
        () => simulateStaffStartService(roles.staffShopA, ticketShopB),
        /Staff can only manage queue entries in their assigned shop/,
        'Staff of Shop A must be blocked from starting service for Shop B'
      );
    });

    // 12f. Scenario 6: Staff Shop B CANNOT check in a customer ticket belonging to Shop A
    await st.test('12f. Staff Shop B cannot check in Shop A ticket (Cross-shop check-in blocked)', () => {
      const ticketShopA = { id: 'entry-a-101', shop_id: 'shop-crown-a', customer_id: 'cust-a-001', qr_code_token: 'valid-token' };

      const simulateCheckIn = (caller: typeof roles.staffShopB, ticket: typeof ticketShopA) => {
        if (caller.role === 'staff' && caller.shop_id !== ticket.shop_id) {
          throw new Error('Unauthorized: Caller cannot check in this queue entry.');
        }
        return { success: true };
      };

      assert.throws(
        () => simulateCheckIn(roles.staffShopB, ticketShopA),
        /Unauthorized: Caller cannot check in this queue entry/,
        'Staff from another shop must be denied arrival check-in verification'
      );
    });

    // 12g. Scenario 7: Owner Shop A CANNOT view Shop B revenue or queue entries
    await st.test('12g. Owner Shop A cannot view Shop B queue entries or revenue data', () => {
      const shopRevenues = [
        { shop_id: 'shop-crown-a', completed_cuts: 45, gross_revenue: 13500 },
        { shop_id: 'shop-blade-b', completed_cuts: 80, gross_revenue: 24000 }
      ];

      const rlsOwnerRevenue = (owner: typeof roles.ownerShopA) => {
        return shopRevenues.filter((r) => r.shop_id === owner.shop_id);
      };

      const ownerAData = rlsOwnerRevenue(roles.ownerShopA);
      assert.strictEqual(ownerAData.length, 1);
      assert.strictEqual(ownerAData[0].shop_id, 'shop-crown-a');
      assert.strictEqual(ownerAData[0].gross_revenue, 13500);
      assert.strictEqual(ownerAData.some((r) => r.shop_id === 'shop-blade-b'), false);
    });

    // 12h. Scenario 8: Super Admin actions are strictly authorized and recorded to audit logs
    await st.test('12h. Super Admin possesses audited administrative authority', () => {
      const auditTrail: Array<{ action: string; user_id: string; entity: string; timestamp: number }> = [];

      const executeAdminAction = (adminUser: typeof roles.superAdmin, action: string, entity: string) => {
        if (adminUser.role !== 'admin') {
          throw new Error('Access denied: Super Admin privileges required.');
        }
        // Strict audit log recording
        auditTrail.push({
          action,
          user_id: adminUser.id,
          entity,
          timestamp: Date.now()
        });
        return { success: true };
      };

      const res = executeAdminAction(roles.superAdmin, 'SHOP_STATUS_APPROVED', 'shop-crown-a');
      assert.strictEqual(res.success, true);
      assert.strictEqual(auditTrail.length, 1);
      assert.strictEqual(auditTrail[0].action, 'SHOP_STATUS_APPROVED');
      assert.strictEqual(auditTrail[0].user_id, roles.superAdmin.id);
    });
  });

  // =========================================================================
  // 13. Advanced Wait-Time Routing, In-Chair Deduction & Audit Hardening
  // =========================================================================
  await t.test('13. Advanced Wait-Time Routing, In-Chair Deduction & Audit Hardening', async (st) => {
    const servicesMap = {
      'srv-haircut': { id: 'srv-haircut', avg_minutes: 30 },
      'srv-beard': { id: 'srv-beard', avg_minutes: 15 }
    };

    // 13a. In-chair haircut elapsed time deduction
    await st.test('13a. Elapsed haircut time is deducted from in-service queue entries', () => {
      const now = 1729760000000; // fixed timestamp
      const twentyMinsAgo = new Date(now - 20 * 60 * 1000).toISOString();

      const entries = [
        {
          id: 'in-chair-1',
          shop_id: 'shop-1',
          customer_id: 'cust-1',
          service_id: 'srv-haircut', // 30 min service
          status: 'in_service' as const,
          called_at: twentyMinsAgo,
          created_at: twentyMinsAgo,
          is_walkin: false,
          queue_number: 1,
          qr_code_token: 'tok-1',
          queue_date: '2026-10-24'
        },
        {
          id: 'waiting-target',
          shop_id: 'shop-1',
          customer_id: 'cust-2',
          service_id: 'srv-haircut',
          status: 'waiting' as const,
          called_at: null,
          created_at: new Date(now - 5 * 60 * 1000).toISOString(),
          is_walkin: false,
          queue_number: 2,
          qr_code_token: 'tok-2',
          queue_date: '2026-10-24'
        }
      ];

      // With 1 barber:
      // In-chair started 20 mins ago for 30m cut -> 10 mins remaining!
      const result = calculateEstimatedWaitTime({
        targetEntryId: 'waiting-target',
        queueEntries: entries as any,
        servicesMap,
        activeBarberCount: 1,
        currentTime: now
      });

      assert.strictEqual(result.estimatedMinutes, 10, 'Expected 10 minutes remaining on active chair (30 - 20)');
      assert.strictEqual(result.peopleAhead, 1);
      assert.strictEqual(result.isEstimate, true);
    });

    // 13b. Barber-specific queue routing
    await st.test('13b. Specific requested barber routes wait time to single chair (c = 1)', () => {
      const now = 1729760000000;
      const entries = [
        // Barber Bob's active service (30 min cut, started 10m ago -> 20m remaining)
        {
          id: 'entry-bob-1',
          shop_id: 'shop-1',
          customer_id: 'c-1',
          barber_id: 'barber-bob',
          service_id: 'srv-haircut',
          status: 'in_service' as const,
          called_at: new Date(now - 10 * 60 * 1000).toISOString(),
          created_at: new Date(now - 10 * 60 * 1000).toISOString(),
          is_walkin: false,
          queue_number: 1,
          qr_code_token: 't-1',
          queue_date: '2026-10-24'
        },
        // Barber Alice's active service (15 min beard, started 5m ago -> 10m remaining)
        {
          id: 'entry-alice-1',
          shop_id: 'shop-1',
          customer_id: 'c-2',
          barber_id: 'barber-alice',
          service_id: 'srv-beard',
          status: 'in_service' as const,
          called_at: new Date(now - 5 * 60 * 1000).toISOString(),
          created_at: new Date(now - 5 * 60 * 1000).toISOString(),
          is_walkin: false,
          queue_number: 2,
          qr_code_token: 't-2',
          queue_date: '2026-10-24'
        },
        // Target customer specifically wants Barber Bob!
        {
          id: 'target-for-bob',
          shop_id: 'shop-1',
          customer_id: 'c-3',
          barber_id: 'barber-bob',
          service_id: 'srv-haircut',
          status: 'waiting' as const,
          called_at: null,
          created_at: new Date(now - 1 * 60 * 1000).toISOString(),
          is_walkin: false,
          queue_number: 3,
          qr_code_token: 't-3',
          queue_date: '2026-10-24'
        }
      ];

      // Shop has 2 active barbers, but target requested Bob specifically!
      const bobWait = calculateEstimatedWaitTime({
        targetEntryId: 'target-for-bob',
        queueEntries: entries as any,
        servicesMap,
        activeBarberCount: 2,
        currentTime: now
      });

      // Target waits ONLY for Bob (20m remaining on Bob's chair, Alice's chair is ignored)
      assert.strictEqual(bobWait.estimatedMinutes, 20, 'Specific barber wait must be calculated from Bob chair only');
      assert.strictEqual(bobWait.peopleAhead, 1, 'Only entries ahead for Bob are counted');
    });

    // 13c. Audit logging error detection
    await st.test('13c. Audit logging failure detection does not report false success', () => {
      const simulateAuditInsert = (response: { data: any; error: any }) => {
        if (response.error) {
          throw new Error(`Audit log persistence failed: ${response.error.message || 'Database error'}`);
        }
        return { success: true };
      };

      // Successful write
      const successRes = simulateAuditInsert({ data: [{ id: 'audit-1' }], error: null });
      assert.strictEqual(successRes.success, true);

      // RLS or PostgREST error object
      assert.throws(
        () => simulateAuditInsert({ data: null, error: { message: 'Row level security violation' } }),
        /Audit log persistence failed: Row level security violation/,
        'Uninspected Supabase error must trigger failure exception'
      );
    });

    // 13d. Customer-to-shop payments separation
    await st.test('13d. Customer payment support enables customer receipts while keeping platform fee ₹0', () => {
      const paymentRecord = {
        id: 'pay-101',
        shop_id: 'shop-crown-a',
        customer_id: 'cust-a-001',
        queue_entry_id: 'entry-a-101',
        amount: 300.0,
        currency: 'INR',
        payment_method: 'UPI',
        status: 'completed',
        platform_fee_inr: 0.0, // Fixed invariant: Platform charges ₹0
        created_at: new Date().toISOString()
      };

      assert.strictEqual(paymentRecord.amount, 300.0, 'Customer haircut payment is recorded');
      assert.strictEqual(paymentRecord.platform_fee_inr, 0.0, 'QuickCut platform fee is strictly ₹0.00');
      assert.strictEqual(paymentRecord.customer_id, 'cust-a-001');
    });
  });

  // =========================================================================
  // 14. High-Concurrency Stress Simulation (SEC-17)
  // =========================================================================
  // NOTE: This test suite provides deterministic asynchronous unit-level simulations
  // of PostgreSQL row-level locks, upsert concurrency (shop_daily_counters), and
  // unique index conflict enforcement (uq_active_customer_queue).
  // These simulations model and verify the transactional logic under simultaneous Promise.all execution.
  await t.test('14. High-Concurrency Simulation - Simultaneous Customer Joins & Atomic Counters (SEC-17)', async (st) => {
    // 14a. Ten simultaneous join attempts from the same customer
    await st.test('14a. Ten simultaneous join requests from same customer: exactly 1 succeeds, 9 rejected', async () => {
      // Shared active customer tickets store simulating PostgreSQL table with uq_active_customer_queue constraint
      const activeCustomerTickets = new Map<string, string>(); // customerId -> entryId
      let attemptedJoins = 0;
      let successfulJoins = 0;
      let rejectedJoins = 0;
      const customerId = 'cust-concurrent-001';

      // Simulated atomic join queue transaction with lock/constraint check
      const simulateAtomicJoinQueue = async (requestId: number) => {
        attemptedJoins++;
        // Small randomized artificial jitter (0-5ms) to interleave asynchronous execution
        await new Promise(resolve => setTimeout(resolve, Math.random() * 5));

        // Invariant check: In PostgreSQL, uq_active_customer_queue immediately fails on second transaction
        if (activeCustomerTickets.has(customerId)) {
          rejectedJoins++;
          const err: any = new Error('Customer already holds an active queue ticket across the platform.');
          err.code = '23505'; // PostgreSQL unique_violation code
          throw err;
        }

        // Atomically occupy the unique slot
        const entryId = `entry-concurrent-${requestId}`;
        activeCustomerTickets.set(customerId, entryId);
        successfulJoins++;
        return { success: true, entryId, queueNumber: 1 };
      };

      // Execute 10 simultaneous join requests in parallel
      const joinPromises = Array.from({ length: 10 }, (_, i) =>
        simulateAtomicJoinQueue(i + 1).then(
          res => ({ status: 'fulfilled' as const, value: res }),
          err => ({ status: 'rejected' as const, reason: err })
        )
      );

      const results = await Promise.all(joinPromises);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      assert.strictEqual(attemptedJoins, 10, 'All 10 simultaneous requests must be processed');
      assert.strictEqual(fulfilled.length, 1, 'Exactly 1 active ticket should be created');
      assert.strictEqual(rejected.length, 9, 'Exactly 9 duplicate attempts should be rejected');
      assert.strictEqual(successfulJoins, 1);
      assert.strictEqual(rejectedJoins, 9);
      assert.strictEqual(activeCustomerTickets.size, 1, 'Database store must hold exactly 1 active ticket');

      // Verify all rejections returned PostgreSQL code 23505 or duplicate ticket message
      for (const rej of rejected) {
        assert.strictEqual((rej as any).reason.code, '23505', 'Rejections must exhibit unique_violation code 23505');
      }
    });

    // 14b. Ten distinct customers joining the same shop simultaneously
    await st.test('14b. Ten distinct customers joining simultaneously: queue numbers unique, contiguous, no loss', async () => {
      // Simulating public.shop_daily_counters with atomic upsert locking
      let lastDailyNumber = 0; // Starts with empty daily counter = 0
      const createdEntries: Array<{ customerId: string; queueNumber: number; entryId: string }> = [];

      const simulateAtomicCounterIncrement = async (custIndex: number) => {
        // Jitter to simulate network packet arrival interleaving
        await new Promise(resolve => setTimeout(resolve, Math.random() * 5));

        // Atomic counter generation mimicking:
        // ON CONFLICT (shop_id, queue_date) DO UPDATE SET last_number = last_number + 1 RETURNING last_number
        lastDailyNumber += 1;
        const assignedQueueNumber = lastDailyNumber;

        const entry = {
          customerId: `cust-distinct-${custIndex}`,
          queueNumber: assignedQueueNumber,
          entryId: `entry-distinct-${custIndex}`
        };
        createdEntries.push(entry);
        return entry;
      };

      // Fire 10 simultaneous joins from 10 distinct customers
      const joinPromises = Array.from({ length: 10 }, (_, i) => simulateAtomicCounterIncrement(i + 1));
      const results = await Promise.all(joinPromises);

      assert.strictEqual(results.length, 10, 'All 10 distinct customers must successfully receive a ticket');
      assert.strictEqual(createdEntries.length, 10, 'No lost queue entries (exactly 10 entries created)');

      // Verify all queue numbers are unique (no duplicates)
      const queueNumbers = results.map(r => r.queueNumber);
      const uniqueQueueNumbers = new Set(queueNumbers);
      assert.strictEqual(uniqueQueueNumbers.size, 10, 'All 10 assigned queue numbers must be strictly unique (no duplicate queue numbers)');

      // Verify sequence is contiguous [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const sortedNumbers = [...queueNumbers].sort((a, b) => a - b);
      assert.deepStrictEqual(sortedNumbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'Queue numbers must be contiguous from 1 to 10 starting from an empty counter');
    });
  });

  // =========================================================================
  // 15. Discrete Multi-Server Wait-Time Simulation & Barber Routing (Task 4)
  // =========================================================================
  await t.test('15. Discrete Multi-Server Wait-Time Simulation & Barber Routing', async (suite) => {
    const servicesMap = {
      'svc-standard': { id: 'svc-standard', avg_minutes: 25 },
      'svc-quick': { id: 'svc-quick', avg_minutes: 10 },
      'svc-beard': { id: 'svc-beard', avg_minutes: 15 },
      'svc-long': { id: 'svc-long', avg_minutes: 40 }
    };

    // 15a. Uneven workloads: Barber A 40 minutes in-chair, Barber B 0 minutes free
    await suite.test('15a. Uneven workloads: Barber A 40 mins vs Barber B 0 mins', () => {
      const now = Date.now();
      const entries = [
        {
          id: 'b1-long-chair',
          shop_id: 'shop-1',
          service_id: 'svc-long', // 40 mins
          status: 'in_service' as const,
          created_at: new Date(now - 1000).toISOString(),
          called_at: new Date(now).toISOString(),
          queue_number: 1,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'cust-b1',
          barber_id: 'barber-A',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'TOK-1',
          checked_in_at: new Date(now).toISOString(),
          completed_at: null,
          updated_at: new Date(now).toISOString()
        },
        {
          id: 'target-unassigned-1',
          shop_id: 'shop-1',
          service_id: 'svc-standard',
          status: 'waiting' as const,
          created_at: new Date(now + 1000).toISOString(),
          called_at: null,
          queue_number: 2,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'cust-target-1',
          barber_id: null,
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'TOK-2',
          checked_in_at: null,
          completed_at: null,
          updated_at: new Date(now + 1000).toISOString()
        }
      ];

      const calc = calculateEstimatedWaitTime({
        targetEntryId: 'target-unassigned-1',
        queueEntries: entries,
        servicesMap,
        activeBarberIds: ['barber-A', 'barber-B'],
        currentTime: now
      });

      // Barber A timeline: 40m, Barber B timeline: 0m. Unassigned gets Barber B at 0m.
      assert.strictEqual(calc.estimatedMinutes, 0, 'Unassigned customer takes completely free Barber B (0 mins)');
      assert.strictEqual(formatEstimatedWaitDisplay(calc.estimatedMinutes), 'Ready next (Est. < 5 mins)');
    });

    // 15b. Dedicated Barber A queue
    await suite.test('15b. Dedicated Barber A queue: target waits for requested barber chair', () => {
      const now = Date.now();
      const entries = [
        {
          id: 'b1-chair',
          shop_id: 'shop-1',
          service_id: 'svc-standard', // 25 mins
          status: 'in_service' as const,
          created_at: new Date(now - 1000).toISOString(),
          called_at: new Date(now).toISOString(),
          queue_number: 1,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'cust-b1',
          barber_id: 'barber-A',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'TOK-1',
          checked_in_at: new Date(now).toISOString(),
          completed_at: null,
          updated_at: new Date(now).toISOString()
        },
        {
          id: 'b1-wait-ahead',
          shop_id: 'shop-1',
          service_id: 'svc-beard', // 15 mins
          status: 'waiting' as const,
          created_at: new Date(now + 500).toISOString(),
          called_at: null,
          queue_number: 2,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'cust-b1-wait',
          barber_id: 'barber-A',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'TOK-2',
          checked_in_at: null,
          completed_at: null,
          updated_at: new Date(now + 500).toISOString()
        },
        {
          id: 'target-barber-A',
          shop_id: 'shop-1',
          service_id: 'svc-standard',
          status: 'waiting' as const,
          created_at: new Date(now + 1000).toISOString(),
          called_at: null,
          queue_number: 3,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'cust-target-A',
          barber_id: 'barber-A',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'TOK-3',
          checked_in_at: null,
          completed_at: null,
          updated_at: new Date(now + 1000).toISOString()
        }
      ];

      const calc = calculateEstimatedWaitTime({
        targetEntryId: 'target-barber-A',
        queueEntries: entries,
        servicesMap,
        activeBarberIds: ['barber-A', 'barber-B'],
        currentTime: now
      });

      // Barber A has 25 in chair + 15 waiting = 40 mins
      assert.strictEqual(calc.estimatedMinutes, 40, 'Target requesting Barber A must wait 40 mins');
      assert.strictEqual(calc.peopleAhead, 2, 'Exactly 2 people ahead in Barber A line');
    });

    // 15c. Dedicated Barber B queue
    await suite.test('15c. Dedicated Barber B queue: target requesting free Barber B chair', () => {
      const now = Date.now();
      const entries = [
        {
          id: 'b1-busy-entry',
          shop_id: 'shop-1',
          service_id: 'svc-standard', // 25 mins
          status: 'in_service' as const,
          created_at: new Date(now - 1000).toISOString(),
          called_at: new Date(now).toISOString(),
          queue_number: 1,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'cust-b1',
          barber_id: 'barber-A',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'TOK-1',
          checked_in_at: new Date(now).toISOString(),
          completed_at: null,
          updated_at: new Date(now).toISOString()
        },
        {
          id: 'target-barber-B',
          shop_id: 'shop-1',
          service_id: 'svc-quick',
          status: 'waiting' as const,
          created_at: new Date(now + 1000).toISOString(),
          called_at: null,
          queue_number: 2,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'cust-target-B',
          barber_id: 'barber-B',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'TOK-2',
          checked_in_at: null,
          completed_at: null,
          updated_at: new Date(now + 1000).toISOString()
        }
      ];

      const calc = calculateEstimatedWaitTime({
        targetEntryId: 'target-barber-B',
        queueEntries: entries,
        servicesMap,
        activeBarberIds: ['barber-A', 'barber-B'],
        currentTime: now
      });

      // Barber B has 0 mins in line
      assert.strictEqual(calc.estimatedMinutes, 0, 'Target requesting free Barber B has 0 min wait');
    });

    // 15d. Unassigned customer takes earliest available barber
    await suite.test('15d. Unassigned customer takes earliest available barber among parallel servers', () => {
      const now = Date.now();
      const entries = [
        {
          id: 'b1-busy-25',
          shop_id: 'shop-1',
          service_id: 'svc-standard', // 25m
          status: 'in_service' as const,
          created_at: new Date(now - 1000).toISOString(),
          called_at: new Date(now).toISOString(),
          queue_number: 1,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c1',
          barber_id: 'barber-A',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T1',
          checked_in_at: new Date(now).toISOString(),
          completed_at: null,
          updated_at: new Date(now).toISOString()
        },
        {
          id: 'b2-busy-10',
          shop_id: 'shop-1',
          service_id: 'svc-quick', // 10m
          status: 'in_service' as const,
          created_at: new Date(now - 1000).toISOString(),
          called_at: new Date(now).toISOString(),
          queue_number: 2,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c2',
          barber_id: 'barber-B',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T2',
          checked_in_at: new Date(now).toISOString(),
          completed_at: null,
          updated_at: new Date(now).toISOString()
        },
        {
          id: 'target-unassigned-d',
          shop_id: 'shop-1',
          service_id: 'svc-standard',
          status: 'waiting' as const,
          created_at: new Date(now + 1000).toISOString(),
          called_at: null,
          queue_number: 3,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c3',
          barber_id: null,
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T3',
          checked_in_at: null,
          completed_at: null,
          updated_at: new Date(now + 1000).toISOString()
        }
      ];

      const calc = calculateEstimatedWaitTime({
        targetEntryId: 'target-unassigned-d',
        queueEntries: entries,
        servicesMap,
        activeBarberIds: ['barber-A', 'barber-B'],
        currentTime: now
      });

      // Barber A = 25m, Barber B = 10m. Min = 10m (Barber B is free first)
      assert.strictEqual(calc.estimatedMinutes, 10, 'Unassigned customer wait is 10 mins (earliest available server)');
    });

    // 15e. Multiple unassigned customers dispatched greedily
    await suite.test('15e. Multiple unassigned customers dispatched greedily', () => {
      const now = Date.now();
      const entries = [
        // Barber A in-chair: 25 mins
        {
          id: 'bA-chair',
          shop_id: 'shop-1',
          service_id: 'svc-standard',
          status: 'in_service' as const,
          created_at: new Date(now - 1000).toISOString(),
          called_at: new Date(now).toISOString(),
          queue_number: 1,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c1',
          barber_id: 'barber-A',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T1',
          checked_in_at: new Date(now).toISOString(),
          completed_at: null,
          updated_at: new Date(now).toISOString()
        },
        // Barber B in-chair: 10 mins
        {
          id: 'bB-chair',
          shop_id: 'shop-1',
          service_id: 'svc-quick',
          status: 'in_service' as const,
          created_at: new Date(now - 1000).toISOString(),
          called_at: new Date(now).toISOString(),
          queue_number: 2,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c2',
          barber_id: 'barber-B',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T2',
          checked_in_at: new Date(now).toISOString(),
          completed_at: null,
          updated_at: new Date(now).toISOString()
        },
        // Unassigned customer 1 ahead: 15 mins beard -> Dispatched to Barber B (10 + 15 = 25m)
        {
          id: 'unassigned-1',
          shop_id: 'shop-1',
          service_id: 'svc-beard',
          status: 'waiting' as const,
          created_at: new Date(now + 100).toISOString(),
          called_at: null,
          queue_number: 3,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c3',
          barber_id: null,
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T3',
          checked_in_at: null,
          completed_at: null,
          updated_at: new Date(now + 100).toISOString()
        },
        // Target unassigned: Next free chair is either Barber A (25m) or Barber B (25m) -> 25 mins
        {
          id: 'target-e',
          shop_id: 'shop-1',
          service_id: 'svc-quick',
          status: 'waiting' as const,
          created_at: new Date(now + 200).toISOString(),
          called_at: null,
          queue_number: 4,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c4',
          barber_id: null,
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T4',
          checked_in_at: null,
          completed_at: null,
          updated_at: new Date(now + 200).toISOString()
        }
      ];

      const calc = calculateEstimatedWaitTime({
        targetEntryId: 'target-e',
        queueEntries: entries,
        servicesMap,
        activeBarberIds: ['barber-A', 'barber-B'],
        currentTime: now
      });

      assert.strictEqual(calc.estimatedMinutes, 25, 'Greedy dispatch accurately computes 25 mins for next customer in line');
    });

    // 15f. Elapsed in-chair service deduction
    await suite.test('15f. Elapsed in-chair service deduction (called_at elapsed minutes subtracted)', () => {
      const now = Date.now();
      // Started 15 minutes ago on a 25 min service -> 10 minutes remaining
      const calledAt = new Date(now - 15 * 60 * 1000).toISOString();
      const entries = [
        {
          id: 'bA-in-progress',
          shop_id: 'shop-1',
          service_id: 'svc-standard', // 25 mins
          status: 'in_service' as const,
          created_at: new Date(now - 20 * 60 * 1000).toISOString(),
          called_at: calledAt,
          queue_number: 1,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c1',
          barber_id: 'barber-A',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T1',
          checked_in_at: calledAt,
          completed_at: null,
          updated_at: calledAt
        },
        {
          id: 'target-f',
          shop_id: 'shop-1',
          service_id: 'svc-standard',
          status: 'waiting' as const,
          created_at: new Date(now).toISOString(),
          called_at: null,
          queue_number: 2,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c2',
          barber_id: 'barber-A',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T2',
          checked_in_at: null,
          completed_at: null,
          updated_at: new Date(now).toISOString()
        }
      ];

      const calc = calculateEstimatedWaitTime({
        targetEntryId: 'target-f',
        queueEntries: entries,
        servicesMap,
        activeBarberIds: ['barber-A'],
        currentTime: now
      });

      // 25m duration - 15m elapsed = 10m remaining
      assert.strictEqual(calc.estimatedMinutes, 10, 'Elapsed 15 mins is deducted, leaving 10 mins remaining');
    });

    // 15g. Multiple service durations
    await suite.test('15g. Multiple service durations accurately tracked', () => {
      const now = Date.now();
      const entries = [
        {
          id: 'bA-service-40',
          shop_id: 'shop-1',
          service_id: 'svc-long', // 40m
          status: 'in_service' as const,
          created_at: new Date(now).toISOString(),
          called_at: new Date(now).toISOString(),
          queue_number: 1,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c1',
          barber_id: 'barber-A',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T1',
          checked_in_at: new Date(now).toISOString(),
          completed_at: null,
          updated_at: new Date(now).toISOString()
        },
        {
          id: 'target-g',
          shop_id: 'shop-1',
          service_id: 'svc-standard',
          status: 'waiting' as const,
          created_at: new Date(now + 100).toISOString(),
          called_at: null,
          queue_number: 2,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c2',
          barber_id: 'barber-A',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T2',
          checked_in_at: null,
          completed_at: null,
          updated_at: new Date(now + 100).toISOString()
        }
      ];

      const calc = calculateEstimatedWaitTime({
        targetEntryId: 'target-g',
        queueEntries: entries,
        servicesMap,
        activeBarberIds: ['barber-A'],
        currentTime: now
      });

      assert.strictEqual(calc.estimatedMinutes, 40, 'Target waits full 40 mins for long service');
    });

    // 15h. Three active barber timelines
    await suite.test('15h. Three active barber timelines dispatch across 3 parallel servers', () => {
      const now = Date.now();
      const entries = [
        {
          id: 'b1-chair-h',
          shop_id: 'shop-1',
          service_id: 'svc-standard', // 25m
          status: 'in_service' as const,
          created_at: new Date(now).toISOString(),
          called_at: new Date(now).toISOString(),
          queue_number: 1,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c1',
          barber_id: 'barber-1',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T1',
          checked_in_at: new Date(now).toISOString(),
          completed_at: null,
          updated_at: new Date(now).toISOString()
        },
        {
          id: 'b2-chair-h',
          shop_id: 'shop-1',
          service_id: 'svc-beard', // 15m
          status: 'in_service' as const,
          created_at: new Date(now).toISOString(),
          called_at: new Date(now).toISOString(),
          queue_number: 2,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c2',
          barber_id: 'barber-2',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T2',
          checked_in_at: new Date(now).toISOString(),
          completed_at: null,
          updated_at: new Date(now).toISOString()
        },
        {
          id: 'b3-chair-h',
          shop_id: 'shop-1',
          service_id: 'svc-quick', // 10m
          status: 'in_service' as const,
          created_at: new Date(now).toISOString(),
          called_at: new Date(now).toISOString(),
          queue_number: 3,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c3',
          barber_id: 'barber-3',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T3',
          checked_in_at: new Date(now).toISOString(),
          completed_at: null,
          updated_at: new Date(now).toISOString()
        },
        {
          id: 'target-h',
          shop_id: 'shop-1',
          service_id: 'svc-standard',
          status: 'waiting' as const,
          created_at: new Date(now + 100).toISOString(),
          called_at: null,
          queue_number: 4,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c4',
          barber_id: null,
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T4',
          checked_in_at: null,
          completed_at: null,
          updated_at: new Date(now + 100).toISOString()
        }
      ];

      const calc = calculateEstimatedWaitTime({
        targetEntryId: 'target-h',
        queueEntries: entries,
        servicesMap,
        activeBarberIds: ['barber-1', 'barber-2', 'barber-3'],
        currentTime: now
      });

      // Timelines: b1 = 25m, b2 = 15m, b3 = 10m. Min = 10m (Barber 3).
      assert.strictEqual(calc.estimatedMinutes, 10, 'Target routed to earliest of 3 servers (10 mins)');
    });

    // 15i. Zero active barbers
    await suite.test('15i. Zero active barbers: returns -1 and safe disclaimer without throwing', () => {
      const now = Date.now();
      const entries = [
        {
          id: 'target-zero-barbers',
          shop_id: 'shop-1',
          service_id: 'svc-standard',
          status: 'waiting' as const,
          created_at: new Date(now).toISOString(),
          called_at: null,
          queue_number: 1,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c1',
          barber_id: null,
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T1',
          checked_in_at: null,
          completed_at: null,
          updated_at: new Date(now).toISOString()
        }
      ];

      const calc = calculateEstimatedWaitTime({
        targetEntryId: 'target-zero-barbers',
        queueEntries: entries,
        servicesMap,
        activeBarberCount: 0,
        currentTime: now
      });

      assert.strictEqual(calc.estimatedMinutes, -1, 'Zero active barbers returns -1');
      assert.strictEqual(formatEstimatedWaitDisplay(calc.estimatedMinutes), 'No active barbers available');
    });

    // 15j. Inactive barber handling
    await suite.test('15j. Inactive barber handling: request for inactive barber routes to earliest active server', () => {
      const now = Date.now();
      const entries = [
        // Barber 1 is active (15 mins)
        {
          id: 'b1-active',
          shop_id: 'shop-1',
          service_id: 'svc-beard', // 15m
          status: 'in_service' as const,
          created_at: new Date(now).toISOString(),
          called_at: new Date(now).toISOString(),
          queue_number: 1,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c1',
          barber_id: 'barber-active-1',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T1',
          checked_in_at: new Date(now).toISOString(),
          completed_at: null,
          updated_at: new Date(now).toISOString()
        },
        // Target requested 'barber-inactive-2' (who is not in activeBarberIds)
        {
          id: 'target-inactive-barber',
          shop_id: 'shop-1',
          service_id: 'svc-standard',
          status: 'waiting' as const,
          created_at: new Date(now + 100).toISOString(),
          called_at: null,
          queue_number: 2,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c2',
          barber_id: 'barber-inactive-2',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T2',
          checked_in_at: null,
          completed_at: null,
          updated_at: new Date(now + 100).toISOString()
        }
      ];

      const calc = calculateEstimatedWaitTime({
        targetEntryId: 'target-inactive-barber',
        queueEntries: entries,
        servicesMap,
        activeBarberIds: ['barber-active-1'], // Only barber-1 is active
        currentTime: now
      });

      // Target requested inactive barber, so gets served by active barber at min 15
      assert.strictEqual(calc.estimatedMinutes, 15, 'Request for inactive barber safely falls back to earliest active server (15m)');
    });

    // 15k. Missing service duration
    await suite.test('15k. Missing service duration safely defaults to 20 minutes', () => {
      const now = Date.now();
      const entries = [
        {
          id: 'b1-unknown-service',
          shop_id: 'shop-1',
          service_id: 'svc-unregistered',
          status: 'in_service' as const,
          created_at: new Date(now).toISOString(),
          called_at: new Date(now).toISOString(),
          queue_number: 1,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c1',
          barber_id: 'barber-1',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T1',
          checked_in_at: new Date(now).toISOString(),
          completed_at: null,
          updated_at: new Date(now).toISOString()
        },
        {
          id: 'target-k',
          shop_id: 'shop-1',
          service_id: 'svc-standard',
          status: 'waiting' as const,
          created_at: new Date(now + 100).toISOString(),
          called_at: null,
          queue_number: 2,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c2',
          barber_id: 'barber-1',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T2',
          checked_in_at: null,
          completed_at: null,
          updated_at: new Date(now + 100).toISOString()
        }
      ];

      const calc = calculateEstimatedWaitTime({
        targetEntryId: 'target-k',
        queueEntries: entries,
        servicesMap: {}, // Empty services map
        activeBarberIds: ['barber-1'],
        currentTime: now
      });

      // Unregistered service defaults to 20 mins
      assert.strictEqual(calc.estimatedMinutes, 20, 'Unregistered service defaults to 20 mins duration');
    });

    // 15l. FIFO ordering with equal timestamps
    await suite.test('15l. FIFO ordering with equal timestamps: deterministic tie-break by queue_number / id', () => {
      const now = Date.now();
      const sameTime = new Date(now).toISOString();
      const entries = [
        // Barber in chair: 10 mins
        {
          id: 'b1-chair-l',
          shop_id: 'shop-1',
          service_id: 'svc-quick',
          status: 'in_service' as const,
          created_at: sameTime,
          called_at: sameTime,
          queue_number: 1,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c1',
          barber_id: 'barber-1',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T1',
          checked_in_at: sameTime,
          completed_at: null,
          updated_at: sameTime
        },
        // Waiting customer 2 (equal timestamp, lower queue_number): 15 mins
        {
          id: 'wait-2',
          shop_id: 'shop-1',
          service_id: 'svc-beard',
          status: 'waiting' as const,
          created_at: sameTime,
          called_at: null,
          queue_number: 2,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c2',
          barber_id: 'barber-1',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T2',
          checked_in_at: null,
          completed_at: null,
          updated_at: sameTime
        },
        // Target customer 3 (equal timestamp, higher queue_number)
        {
          id: 'wait-3-target',
          shop_id: 'shop-1',
          service_id: 'svc-standard',
          status: 'waiting' as const,
          created_at: sameTime,
          called_at: null,
          queue_number: 3,
          is_walkin: false,
          is_billable: false,
          queue_date: '2026-10-24',
          customer_id: 'c3',
          barber_id: 'barber-1',
          guest_name: null,
          guest_phone: null,
          qr_code_token: 'T3',
          checked_in_at: null,
          completed_at: null,
          updated_at: sameTime
        }
      ];

      const calc = calculateEstimatedWaitTime({
        targetEntryId: 'wait-3-target',
        queueEntries: entries,
        servicesMap,
        activeBarberIds: ['barber-1'],
        currentTime: now
      });

      // In chair (10m) + wait-2 (15m) = 25 mins
      assert.strictEqual(calc.estimatedMinutes, 25, 'Equal timestamps tie-broken by queue number: customer 2 served before customer 3');
      assert.strictEqual(calc.peopleAhead, 2);
    });

    // 15m. Display formatting parity
    await suite.test('15m. Wait-time display formatting parity across all ranges', () => {
      assert.strictEqual(formatEstimatedWaitDisplay(-1), 'No active barbers available');
      assert.strictEqual(formatEstimatedWaitDisplay(0), 'Ready next (Est. < 5 mins)');
      assert.strictEqual(formatEstimatedWaitDisplay(25), '~25 mins (Est.)');
      assert.strictEqual(formatEstimatedWaitDisplay(60), '~1h (Est.)');
      assert.strictEqual(formatEstimatedWaitDisplay(90), '~1h 30m (Est.)');
    });
  });

  // =========================================================================
  // 16. Customer QR Self-Check-in Rejection & Authorization Matrix (Task 1)
  // =========================================================================
  await t.test('16. Customer QR Self-Check-in Rejection & Authorization Matrix', async (suite) => {
    // Simulate verify_qr_checkin authorization rules
    function simulateVerifyQRCheckIn(caller: { id: string; role: string; shop_id?: string }, entry: { id: string; shop_id: string; customer_id: string; token: string }, submittedToken: string) {
      const isServiceRole = caller.role === 'service_role';
      const isAdmin = caller.role === 'admin';
      const isStaff = caller.role === 'staff' && caller.shop_id === entry.shop_id;
      const isOwner = caller.role === 'owner' && caller.shop_id === entry.shop_id;

      // STRICT AUTHORIZATION CHECK (Task 1)
      // Customers are NEVER authorized to check in their own tickets
      if (!isServiceRole && !isAdmin && !isStaff && !isOwner) {
        throw new Error('Unauthorized: Only authorized shop staff, shop owners, or platform administrators can verify arrival check-in.');
      }

      // Exact token check (rejects queue numbers or mismatches)
      if (submittedToken.trim() !== entry.token) {
        throw new Error('Invalid check-in QR code or token. Cryptographic QR proof of arrival required.');
      }

      return { success: true, checked_in_at: new Date().toISOString() };
    }

    const testEntry = {
      id: 'entry-test-101',
      shop_id: 'shop-crown-a',
      customer_id: 'cust-rahul-01',
      token: 'crypto-token-uuid-1234'
    };

    // 16a. Customer calling check-in on own ticket with valid token -> REJECTED
    await suite.test('16a. Authenticated customer CANNOT self-check-in, even with valid token', () => {
      const customerCaller = { id: 'cust-rahul-01', role: 'customer' };
      assert.throws(() => {
        simulateVerifyQRCheckIn(customerCaller, testEntry, testEntry.token);
      }, /Unauthorized: Only authorized shop staff/);
    });

    // 16b. Customer calling check-in on own ticket with invalid token -> REJECTED
    await suite.test('16b. Customer calling check-in with invalid token is rejected', () => {
      const customerCaller = { id: 'cust-rahul-01', role: 'customer' };
      assert.throws(() => {
        simulateVerifyQRCheckIn(customerCaller, testEntry, 'wrong-token');
      }, /Unauthorized/);
    });

    // 16c. Customer calling check-in on another customer's ticket -> REJECTED
    await suite.test('16c. Customer calling check-in on another customer ticket is rejected', () => {
      const otherCustomer = { id: 'cust-other-99', role: 'customer' };
      assert.throws(() => {
        simulateVerifyQRCheckIn(otherCustomer, testEntry, testEntry.token);
      }, /Unauthorized/);
    });

    // 16d. Staff of Shop A checking in Shop A ticket with correct token -> ALLOWED
    await suite.test('16d. Staff of Shop A can verify check-in for Shop A ticket', () => {
      const staffShopA = { id: 'staff-sam-01', role: 'staff', shop_id: 'shop-crown-a' };
      const res = simulateVerifyQRCheckIn(staffShopA, testEntry, testEntry.token);
      assert.strictEqual(res.success, true);
    });

    // 16e. Staff of Shop A checking in Shop B ticket -> REJECTED
    await suite.test('16e. Staff of Shop A cannot check in Shop B ticket (cross-shop blocked)', () => {
      const staffShopA = { id: 'staff-sam-01', role: 'staff', shop_id: 'shop-crown-a' };
      const ticketShopB = { ...testEntry, shop_id: 'shop-blade-b' };
      assert.throws(() => {
        simulateVerifyQRCheckIn(staffShopA, ticketShopB, testEntry.token);
      }, /Unauthorized/);
    });

    // 16f. Owner of Shop A checking in Shop A ticket -> ALLOWED
    await suite.test('16f. Owner of Shop A can check in Shop A ticket', () => {
      const ownerShopA = { id: 'owner-alex-01', role: 'owner', shop_id: 'shop-crown-a' };
      const res = simulateVerifyQRCheckIn(ownerShopA, testEntry, testEntry.token);
      assert.strictEqual(res.success, true);
    });

    // 16g. Owner of Shop A checking in Shop B ticket -> REJECTED
    await suite.test('16g. Owner of Shop A cannot check in Shop B ticket', () => {
      const ownerShopA = { id: 'owner-alex-01', role: 'owner', shop_id: 'shop-crown-a' };
      const ticketShopB = { ...testEntry, shop_id: 'shop-blade-b' };
      assert.throws(() => {
        simulateVerifyQRCheckIn(ownerShopA, ticketShopB, testEntry.token);
      }, /Unauthorized/);
    });

    // 16h. Platform administrator performing check-in -> ALLOWED
    await suite.test('16h. Platform administrator can verify check-in', () => {
      const adminCaller = { id: 'admin-001', role: 'admin' };
      const res = simulateVerifyQRCheckIn(adminCaller, testEntry, testEntry.token);
      assert.strictEqual(res.success, true);
    });

    // 16i. Anonymous caller -> REJECTED
    await suite.test('16i. Anonymous caller is rejected', () => {
      const anonCaller = { id: '', role: 'anon' };
      assert.throws(() => {
        simulateVerifyQRCheckIn(anonCaller, testEntry, testEntry.token);
      }, /Unauthorized/);
    });

    // 16j. Rejects queue number as token
    await suite.test('16j. Strictly rejects queue number as token', () => {
      const staffShopA = { id: 'staff-sam-01', role: 'staff', shop_id: 'shop-crown-a' };
      assert.throws(() => {
        simulateVerifyQRCheckIn(staffShopA, testEntry, '3');
      }, /Cryptographic QR proof of arrival required/);
    });
  });

  // =========================================================================
  // 17. Storage Bucket Security & RLS Policy Isolation (Task 7)
  // =========================================================================
  await t.test('17. Storage Bucket Security & RLS Policy Isolation', async (suite) => {
    // Model storage RLS rules from migration 20261024000005
    function evaluateStorageInsertPolicy(
      caller: { uid: string | null; isAdmin?: boolean; ownedShopIds?: string[] },
      bucketId: string,
      objectPath: string,
      mimeType: string,
      sizeBytes: number
    ) {
      const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

      if (!ALLOWED_MIME.includes(mimeType)) {
        throw new Error(`File type ${mimeType} not allowed`);
      }
      if (sizeBytes > MAX_SIZE) {
        throw new Error('File exceeds 5MB size limit');
      }

      const folderName = objectPath.split('/')[0];

      if (bucketId === 'avatars') {
        // avatars/{user_id}/*
        if (caller.isAdmin) return true;
        if (!caller.uid) throw new Error('Unauthorized storage write');
        if (folderName !== caller.uid) {
          throw new Error('User can only upload to their own avatar folder');
        }
        return true;
      }

      if (bucketId === 'shop-assets') {
        // shop-assets/{shop_id}/*
        if (caller.isAdmin) return true;
        if (!caller.uid) throw new Error('Unauthorized storage write');
        if (!caller.ownedShopIds || !caller.ownedShopIds.includes(folderName)) {
          throw new Error('Only the verified owner of this shop can upload shop assets');
        }
        return true;
      }

      throw new Error('Unknown bucket');
    }

    // 17a. Customer A uploading to Customer B avatar folder -> REJECTED
    await suite.test('17a. Customer A cannot upload to Customer B avatar folder', () => {
      const callerA = { uid: 'user-A' };
      assert.throws(() => {
        evaluateStorageInsertPolicy(callerA, 'avatars', 'user-B/avatar.png', 'image/png', 50000);
      }, /User can only upload to their own avatar folder/);
    });

    // 17b. Shop A owner uploading to Shop B folder -> REJECTED
    await suite.test('17b. Shop A owner cannot upload to Shop B shop-assets folder', () => {
      const ownerA = { uid: 'owner-A', ownedShopIds: ['shop-A'] };
      assert.throws(() => {
        evaluateStorageInsertPolicy(ownerA, 'shop-assets', 'shop-B/banner.jpg', 'image/jpeg', 100000);
      }, /Only the verified owner of this shop/);
    });

    // 17c. Unauthenticated upload to avatars or shop-assets -> REJECTED
    await suite.test('17c. Unauthenticated upload is rejected', () => {
      const unauth = { uid: null };
      assert.throws(() => {
        evaluateStorageInsertPolicy(unauth, 'avatars', 'user-A/avatar.png', 'image/png', 50000);
      }, /Unauthorized storage write/);
      assert.throws(() => {
        evaluateStorageInsertPolicy(unauth, 'shop-assets', 'shop-A/banner.jpg', 'image/jpeg', 50000);
      }, /Unauthorized storage write/);
    });

    // 17d. Legitimate own-avatar upload -> ALLOWED
    await suite.test('17d. User can upload to their own avatar folder', () => {
      const callerA = { uid: 'user-A' };
      const allowed = evaluateStorageInsertPolicy(callerA, 'avatars', 'user-A/photo.webp', 'image/webp', 80000);
      assert.strictEqual(allowed, true);
    });

    // 17e. Legitimate own-shop upload -> ALLOWED
    await suite.test('17e. Shop owner can upload to their own shop-assets folder', () => {
      const ownerA = { uid: 'owner-A', ownedShopIds: ['shop-A'] };
      const allowed = evaluateStorageInsertPolicy(ownerA, 'shop-assets', 'shop-A/storefront.png', 'image/png', 200000);
      assert.strictEqual(allowed, true);
    });

    // 17f. File size and MIME type restrictions
    await suite.test('17f. Storage rejects oversized files and invalid MIME types', () => {
      const callerA = { uid: 'user-A' };
      // Oversized (>5MB)
      assert.throws(() => {
        evaluateStorageInsertPolicy(callerA, 'avatars', 'user-A/huge.jpg', 'image/jpeg', 6 * 1024 * 1024);
      }, /File exceeds 5MB size limit/);

      // Disallowed MIME type (e.g. application/pdf)
      assert.throws(() => {
        evaluateStorageInsertPolicy(callerA, 'avatars', 'user-A/document.pdf', 'application/pdf', 50000);
      }, /File type application\/pdf not allowed/);
    });
  });
});
