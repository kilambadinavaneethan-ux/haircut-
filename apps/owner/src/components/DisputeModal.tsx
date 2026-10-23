import React, { useState } from 'react';
import { FeeRecord, formatFeeAmount, getSupabaseClient } from '@quickcut/shared';

interface DisputeModalProps {
  visible: boolean;
  feeRecord: FeeRecord | null;
  onClose: () => void;
  onDisputeSubmitted: () => void;
}

export function DisputeModal({
  visible,
  feeRecord,
  onClose,
  onDisputeSubmitted
}: DisputeModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  if (!visible || !feeRecord) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMsg('Please specify the dispute reason or affected ticket numbers.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Execute secure dispute RPC
      const { data, error: rpcError } = await (supabase.rpc as any)('dispute_fee_record', {
        p_fee_record_id: feeRecord.id,
        p_reason: reason.trim()
      });

      if (rpcError) {
        // Fallback update if RPC not yet deployed
        const { error } = await (supabase.from('fee_records') as any)
          .update({
            status: 'disputed',
            dispute_reason: reason.trim()
          })
          .eq('id', feeRecord.id);

        if (error) throw error;
      }

      alert('Dispute submitted successfully! Our platform admin will review the billable service logs.');
      onDisputeSubmitted();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not submit dispute';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800 }}>Dispute Platform Fee Invoice</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Month: {feeRecord.month} • Total: {formatFeeAmount(feeRecord.amount)}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: 20 }}>
            ✕
          </button>
        </div>

        <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--accent-gold)', lineHeight: 18 }}>
            ⏱ <strong>7-Day Dispute Window:</strong> You can dispute this monthly statement until{' '}
            <strong>{new Date(feeRecord.disputed_until).toLocaleDateString()}</strong>.
            Please explain which queue entries were non-billable, walk-ins, or no-shows.
          </p>
        </div>

        {errorMsg && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Dispute Reason & Affected Ticket Numbers *
            </label>
            <textarea
              rows={4}
              placeholder="e.g. Ticket #104 and #109 were walk-ins erroneously marked as app completions..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '10px 18px', borderRadius: 8 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{ background: 'var(--accent-red)', color: '#FFFFFF', padding: '10px 24px', borderRadius: 8, fontWeight: 800 }}
            >
              {submitting ? 'Submitting...' : 'Submit Official Dispute'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
