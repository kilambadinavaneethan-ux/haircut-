import React, { useState } from 'react';
import { logAdminAction } from '../utils/adminAudit';

interface PlatformSettingsProps {
  adminId: string;
}

export default function PlatformSettings({ adminId }: PlatformSettingsProps) {
  const [feePerService, setFeePerService] = useState<number>(5.0);
  const [disputeWindowDays, setDisputeWindowDays] = useState<number>(7);
  const [anomalyThresholdSeconds, setAnomalyThresholdSeconds] = useState<number>(60);
  const [maintenanceMode, setMaintenanceMode] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    try {
      const payload = {
        rate_per_billable_cut: feePerService,
        dispute_window_days: disputeWindowDays,
        anomaly_threshold_seconds: anomalyThresholdSeconds,
        maintenance_mode: maintenanceMode,
        updated_at: new Date().toISOString()
      };

      // Save to localStorage for client persistence
      localStorage.setItem('quickcut_platform_settings', JSON.stringify(payload));

      // Record administrative configuration update to audit trail
      await logAdminAction(adminId, 'PLATFORM_SETTINGS_UPDATED', 'platform_settings', 'global', payload);

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err: any) {
      alert(`Failed to save settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Platform Configuration & Economic Policy</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Manage global unit economics, dispute windows, and fraud sensitivity parameters.
        </p>
      </div>

      {savedSuccess && (
        <div className="alert-box alert-success" style={{ fontSize: 14 }}>
          <span>✓</span>
          <div>Global platform settings saved and recorded to audit logs successfully!</div>
        </div>
      )}

      <div className="glass-panel" style={{ maxWidth: 680 }}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Unit Pricing */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Platform Fee Per Verified Billable Cut (₹ INR)
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="50"
              required
              value={feePerService}
              onChange={(e) => setFeePerService(parseFloat(e.target.value) || 0)}
              style={{ width: '100%', maxWidth: 280 }}
            />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Fixed charge invoiced to shop owners per completed customer cut verified by QR check-in.
            </p>
          </div>

          {/* Dispute Window */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Merchant Dispute Window (Days)
            </label>
            <input
              type="number"
              min="1"
              max="30"
              required
              value={disputeWindowDays}
              onChange={(e) => setDisputeWindowDays(parseInt(e.target.value, 10) || 7)}
              style={{ width: '100%', maxWidth: 280 }}
            />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Number of days barbershop owners have to submit dispute contestations on monthly fee invoices.
            </p>
          </div>

          {/* Fraud Threshold */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Minimum Haircut Duration Anomaly Threshold (Seconds)
            </label>
            <input
              type="number"
              min="10"
              max="600"
              required
              value={anomalyThresholdSeconds}
              onChange={(e) => setAnomalyThresholdSeconds(parseInt(e.target.value, 10) || 60)}
              style={{ width: '100%', maxWidth: 280 }}
            />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Cuts completed faster than this threshold trigger automated fraud alerts on the Watchdog dashboard.
            </p>
          </div>

          {/* Maintenance Mode Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Maintenance & Deployment Banner</div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Display platform update notification to customer and staff apps.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMaintenanceMode(!maintenanceMode)}
              style={{
                background: maintenanceMode ? 'var(--accent-amber)' : 'rgba(255,255,255,0.08)',
                color: maintenanceMode ? '#070A13' : 'var(--text-secondary)',
                padding: '8px 18px',
                borderRadius: 20,
                fontWeight: 800,
                fontSize: 12
              }}
            >
              {maintenanceMode ? 'ACTIVE' : 'OFF'}
            </button>
          </div>

          <div style={{ textAlign: 'right', marginTop: 10 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                color: '#FFFFFF',
                padding: '12px 24px',
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 14,
                boxShadow: '0 4px 14px var(--accent-indigo-glow)'
              }}
            >
              {saving ? 'Saving...' : 'Save & Publish Platform Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
