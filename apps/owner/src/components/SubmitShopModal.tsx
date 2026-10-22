import React, { useState } from 'react';
import { getSupabaseClient, Shop } from '@quickcut/shared';

interface SubmitShopModalProps {
  visible: boolean;
  ownerId: string;
  onClose: () => void;
  onShopSubmitted: (shop: Shop) => void;
}

export function SubmitShopModal({
  visible,
  ownerId,
  onClose,
  onShopSubmitted
}: SubmitShopModalProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('+91 ');
  const [openingTime, setOpeningTime] = useState('09:00:00');
  const [closingTime, setClosingTime] = useState('21:00:00');
  const [latitude, setLatitude] = useState('12.9716');
  const [longitude, setLongitude] = useState('77.5946');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  if (!visible) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim() || !address.trim()) {
      setErrorMsg('Shop name and address are required.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await (supabase.from('shops') as any)
        .insert({
          owner_id: ownerId,
          name: name.trim(),
          address: address.trim(),
          phone: phone.trim() || null,
          opening_time: openingTime,
          closing_time: closingTime,
          latitude: parseFloat(latitude) || 12.9716,
          longitude: parseFloat(longitude) || 77.5946,
          status: 'pending' // Submitted for admin approval
        })
        .select('*')
        .single();

      if (error) throw error;

      alert(`Shop "${name}" submitted successfully! It is now pending approval by platform administrators.`);
      onShopSubmitted(data as unknown as Shop);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not submit shop';
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
            <h3 style={{ fontSize: 18, fontWeight: 800 }}>Submit New Shop for Approval</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              New barber shops are reviewed by platform admins before going live.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: 20, padding: 4 }}
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--accent-red)',
              color: 'var(--accent-red)',
              padding: 10,
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 16
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Barbershop Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Royal Fades Studio"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%' }}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Full Address & Location *
            </label>
            <input
              type="text"
              placeholder="e.g. 74 MG Road, Indiranagar, Bengaluru"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={{ width: '100%' }}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Phone Number
              </label>
              <input
                type="text"
                placeholder="+91 80 1234 5678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Initial Status
              </label>
              <div
                style={{
                  background: '#0D1424',
                  border: '1px solid var(--border-color)',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  color: 'var(--accent-gold)',
                  fontWeight: 700
                }}
              >
                ● Pending Review
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Opening Time
              </label>
              <input
                type="time"
                value={openingTime}
                onChange={(e) => setOpeningTime(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Closing Time
              </label>
              <input
                type="time"
                value={closingTime}
                onChange={(e) => setClosingTime(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Latitude (GPS)
              </label>
              <input
                type="text"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Longitude (GPS)
              </label>
              <input
                type="text"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                padding: '10px 18px',
                borderRadius: 8,
                fontWeight: 600
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: 'var(--accent-gold)',
                color: '#0A0F1D',
                padding: '10px 24px',
                borderRadius: 8,
                fontWeight: 800
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Shop for Approval'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
