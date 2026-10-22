import React, { useState } from 'react';
import type { FeeRecord, Payment, Shop } from '@quickcut/shared';
import { formatFeeAmount } from '@quickcut/shared';

interface RevenueLedgersProps {
  shops: Shop[];
  feeRecords: FeeRecord[];
  payments: Payment[];
}

export default function RevenueLedgers({ shops, feeRecords, payments }: RevenueLedgersProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [viewTab, setViewTab] = useState<'fees' | 'payments'>('fees');

  const getShopName = (shopId: string) => {
    const s = shops.find((item) => item.id === shopId);
    return s ? s.name : 'Unknown Shop';
  };

  const filteredFeeRecords = feeRecords.filter(
    (r) => selectedMonth === 'all' || r.month === selectedMonth
  );

  const months = Array.from(new Set(feeRecords.map((r) => r.month))).sort().reverse();

  const totalInvoiced = feeRecords.reduce((sum, r) => sum + r.amount, 0);
  const totalCollected = payments
    .filter((p) => p.status === 'success' || p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);
  const totalPendingDues = feeRecords
    .filter((r) => r.status === 'pending' || r.status === 'disputed')
    .reduce((sum, r) => sum + r.amount, 0);
  const totalBillableServices = feeRecords.reduce((sum, r) => sum + r.billable_count, 0);

  return (
    <div>
      {/* Header & Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Platform Revenue & Fee Ledgers</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Financial accounting of platform fees (₹5.00 INR per verified cut) and partner settlements.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ width: 170 }}
          >
            <option value="all">All Invoiced Months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                Month: {m}
              </option>
            ))}
          </select>

          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setViewTab('fees')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                background: viewTab === 'fees' ? 'var(--accent-indigo)' : 'transparent',
                color: viewTab === 'fees' ? '#FFFFFF' : 'var(--text-secondary)'
              }}
            >
              Fee Invoices ({filteredFeeRecords.length})
            </button>
            <button
              onClick={() => setViewTab('payments')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                background: viewTab === 'payments' ? 'var(--accent-indigo)' : 'transparent',
                color: viewTab === 'payments' ? '#FFFFFF' : 'var(--text-secondary)'
              }}
            >
              Payments Received ({payments.length})
            </button>
          </div>
        </div>
      </div>

      {/* Financial KPI Cards */}
      <div className="stats-grid">
        <div className="glass-panel" style={{ padding: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL FEES INVOICED</p>
          <p style={{ fontSize: 26, fontWeight: 900, color: '#FFFFFF', marginTop: 4 }}>
            {formatFeeAmount(totalInvoiced)}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            From {totalBillableServices} billable cuts
          </p>
        </div>

        <div className="glass-panel" style={{ padding: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL COLLECTED</p>
          <p style={{ fontSize: 26, fontWeight: 900, color: 'var(--accent-green)', marginTop: 4 }}>
            {formatFeeAmount(totalCollected)}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Cleared settlements
          </p>
        </div>

        <div className="glass-panel" style={{ padding: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>PENDING & DISPUTED DUES</p>
          <p style={{ fontSize: 26, fontWeight: 900, color: 'var(--accent-amber)', marginTop: 4 }}>
            {formatFeeAmount(totalPendingDues)}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Awaiting owner payout
          </p>
        </div>

        <div className="glass-panel" style={{ padding: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>UNIT FEE PRICING</p>
          <p style={{ fontSize: 26, fontWeight: 900, color: 'var(--accent-indigo)', marginTop: 4 }}>
            ₹5.00
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Per verified customer check-in
          </p>
        </div>
      </div>

      {/* Fee Invoices View */}
      {viewTab === 'fees' && (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Shop Name</th>
                  <th>Billing Month</th>
                  <th>Billable Services</th>
                  <th>Rate Per Cut</th>
                  <th>Total Fee Amount</th>
                  <th>Invoice Status</th>
                  <th>Dispute Window</th>
                </tr>
              </thead>
              <tbody>
                {filteredFeeRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No fee statements generated for the selected period.
                    </td>
                  </tr>
                ) : (
                  filteredFeeRecords.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 800, color: '#FFFFFF' }}>{getShopName(r.shop_id)}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.month}</td>
                      <td style={{ fontWeight: 700, color: 'var(--accent-indigo)' }}>
                        {r.billable_count} cuts
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>₹{r.rate_per_service.toFixed(2)}</td>
                      <td style={{ fontWeight: 900, color: 'var(--accent-green)', fontSize: 15 }}>
                        {formatFeeAmount(r.amount)}
                      </td>
                      <td>
                        <span className={`badge badge-${r.status}`}>{r.status}</span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {r.disputed_until ? new Date(r.disputed_until).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payments Received View */}
      {viewTab === 'payments' && (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Shop Name</th>
                  <th>Amount Paid</th>
                  <th>Payment Method</th>
                  <th>Transaction Reference</th>
                  <th>Payment Status</th>
                  <th>Settled Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No payment settlements recorded yet.
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 800, color: '#FFFFFF' }}>{getShopName(p.shop_id)}</td>
                      <td style={{ fontWeight: 900, color: 'var(--accent-green)' }}>
                        {formatFeeAmount(p.amount)}
                      </td>
                      <td style={{ textTransform: 'uppercase', color: 'var(--text-secondary)', fontSize: 13 }}>
                        {p.payment_method}
                      </td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 12 }}>
                        {p.transaction_ref || 'TRX-DEFAULT'}
                      </td>
                      <td>
                        <span className="badge badge-approved">{p.status}</span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {new Date(p.paid_at || p.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
