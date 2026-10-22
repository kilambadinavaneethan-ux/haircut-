import React, { useState } from 'react';
import type { AuditLog } from '@quickcut/shared';

interface AuditLogViewerProps {
  logs: AuditLog[];
}

export default function AuditLogViewer({ logs }: AuditLogViewerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<string>('all');
  const [inspectLog, setInspectLog] = useState<AuditLog | null>(null);

  const entityTypes = Array.from(new Set(logs.map((l) => l.entity_type))).filter(Boolean);

  const filteredLogs = logs.filter((log) => {
    const matchesEntity = selectedEntity === 'all' || log.entity_type === selectedEntity;
    const matchesSearch =
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entity_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.entity_id && log.entity_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      JSON.stringify(log.payload).toLowerCase().includes(searchTerm.toLowerCase());
    return matchesEntity && matchesSearch;
  });

  return (
    <div>
      {/* Top Controls */}
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
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Platform Security & Audit Trail</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Tamper-evident chronological ledger of all administrative interventions, fee waivers, and shop state changes.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search action, entity or payload..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: 280 }}
          />

          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            style={{ width: 180 }}
          >
            <option value="all">All Entity Types ({logs.length})</option>
            {entityTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Entity Target</th>
                <th>Entity ID</th>
                <th>Client Source</th>
                <th style={{ textAlign: 'right' }}>Payload</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No audit records match the current filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: 800,
                          fontSize: 12,
                          color: log.action.includes('REJECT') || log.action.includes('SUSPEND')
                            ? 'var(--accent-rose)'
                            : log.action.includes('APPROVE') || log.action.includes('RESOLVE') || log.action.includes('WAIVE')
                            ? 'var(--accent-green)'
                            : 'var(--accent-indigo)'
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: 12 }}>
                      {log.entity_type}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>
                      {log.entity_id ? `${log.entity_id.slice(0, 12)}...` : 'GLOBAL'}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      {log.ip_address || 'admin-console'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => setInspectLog(log)}
                        style={{
                          background: 'rgba(99, 102, 241, 0.1)',
                          border: '1px solid rgba(99, 102, 241, 0.25)',
                          color: '#A5B4FC',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700
                        }}
                      >
                        View JSON
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* JSON Inspector Modal */}
      {inspectLog && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 620 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800 }}>Audit Event Inspector</h3>
              <button
                onClick={() => setInspectLog(null)}
                style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: 13, marginBottom: 14 }}>
              <div>
                <strong style={{ color: '#FFFFFF' }}>Action:</strong>{' '}
                <span style={{ color: 'var(--accent-indigo)', fontWeight: 700 }}>{inspectLog.action}</span>
              </div>
              <div style={{ marginTop: 4 }}>
                <strong style={{ color: '#FFFFFF' }}>Target:</strong> {inspectLog.entity_type} (ID: {inspectLog.entity_id || 'N/A'})
              </div>
              <div style={{ marginTop: 4 }}>
                <strong style={{ color: '#FFFFFF' }}>Logged At:</strong> {new Date(inspectLog.created_at).toISOString()}
              </div>
              <div style={{ marginTop: 4 }}>
                <strong style={{ color: '#FFFFFF' }}>Admin User ID:</strong> {inspectLog.user_id || 'System'}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                PAYLOAD DATA (RAW JSON)
              </label>
              <pre
                style={{
                  background: '#070B16',
                  padding: '16px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  color: '#38BDF8',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  overflowX: 'auto',
                  maxHeight: 280
                }}
              >
                {JSON.stringify(inspectLog.payload, null, 2)}
              </pre>
            </div>

            <div style={{ textAlign: 'right' }}>
              <button
                onClick={() => setInspectLog(null)}
                style={{
                  background: 'var(--accent-indigo)',
                  color: '#FFFFFF',
                  padding: '8px 18px',
                  borderRadius: 8,
                  fontWeight: 700
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
