import React, { useState, useEffect } from 'react';
import { getSupabaseClient, Service } from '@quickcut/shared';

interface ServiceModalProps {
  visible: boolean;
  shopId: string;
  serviceToEdit: Service | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ServiceModal({
  visible,
  shopId,
  serviceToEdit,
  onClose,
  onSaved
}: ServiceModalProps) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('350');
  const [avgMinutes, setAvgMinutes] = useState('25');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  useEffect(() => {
    if (visible) {
      setErrorMsg(null);
      if (serviceToEdit) {
        setName(serviceToEdit.name);
        setPrice(String(serviceToEdit.price));
        setAvgMinutes(String(serviceToEdit.avg_minutes));
        setIsActive(serviceToEdit.is_active);
      } else {
        setName('');
        setPrice('300');
        setAvgMinutes('20');
        setIsActive(true);
      }
    }
  }, [visible, serviceToEdit]);

  if (!visible) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Service name is required.');
      return;
    }

    setSubmitting(true);
    try {
      if (serviceToEdit) {
        // Edit existing service
        const { error } = await (supabase.from('services') as any)
          .update({
            name: name.trim(),
            price: parseFloat(price) || 0,
            avg_minutes: parseInt(avgMinutes, 10) || 20,
            is_active: isActive
          })
          .eq('id', serviceToEdit.id);

        if (error) throw error;
      } else {
        // Add new service
        const { error } = await (supabase.from('services') as any)
          .insert({
            shop_id: shopId,
            name: name.trim(),
            price: parseFloat(price) || 0,
            avg_minutes: parseInt(avgMinutes, 10) || 20,
            is_active: isActive
          });

        if (error) throw error;
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save service';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800 }}>
            {serviceToEdit ? 'Edit Service' : 'Add New Service'}
          </h3>
          <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: 20 }}>
            ✕
          </button>
        </div>

        {errorMsg && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Service Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Skin Fade & Beard Trim"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%' }}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Price (₹ INR) *
              </label>
              <input
                type="number"
                min="0"
                step="10"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{ width: '100%' }}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Average Duration (Minutes) *
              </label>
              <input
                type="number"
                min="5"
                step="5"
                value={avgMinutes}
                onChange={(e) => setAvgMinutes(e.target.value)}
                style={{ width: '100%' }}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <label htmlFor="isActive" style={{ fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>
              Service is active and available in live queue
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
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
              style={{ background: 'var(--accent-gold)', color: '#0A0F1D', padding: '10px 24px', borderRadius: 8, fontWeight: 800 }}
            >
              {submitting ? 'Saving...' : serviceToEdit ? 'Save Changes' : 'Add Service'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
