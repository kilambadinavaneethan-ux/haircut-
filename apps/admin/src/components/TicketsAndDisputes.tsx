import React, { useState } from 'react';
import type { SupportTicket, Shop } from '@quickcut/shared';
import { logAdminAction } from '../utils/adminAudit';
import { getSupabaseClient } from '@quickcut/shared';

interface TicketsAndDisputesProps {
  adminId: string;
  shops: Shop[];
  tickets: SupportTicket[];
  onTicketUpdated: (updatedTicket: SupportTicket) => void;
}

export default function TicketsAndDisputes({
  adminId,
  shops,
  tickets,
  onTicketUpdated
}: TicketsAndDisputesProps) {
  const [ticketFilter, setTicketFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved'>('all');
  const [adminReplyNotes, setAdminReplyNotes] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  const getShopName = (shopId: string | null) => {
    if (!shopId) return 'General Platform';
    const s = shops.find((item) => item.id === shopId);
    return s ? s.name : 'Unknown Shop';
  };

  const filteredTickets = tickets.filter(
    (t) => ticketFilter === 'all' || t.status === ticketFilter
  );

  // Ticket Status Actions
  const handleUpdateTicketStatus = async (ticket: SupportTicket, nextStatus: SupportTicket['status']) => {
    setLoadingId(ticket.id);
    const note = adminReplyNotes[ticket.id] || '';

    try {
      const { error } = await (supabase.from('support_tickets') as any)
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', ticket.id);

      if (error) throw error;

      await logAdminAction(adminId, `SUPPORT_TICKET_${nextStatus.toUpperCase()}`, 'support_tickets', ticket.id, {
        ticket_subject: ticket.subject,
        previous_status: ticket.status,
        new_status: nextStatus,
        admin_note: note
      });

      onTicketUpdated({
        ...ticket,
        status: nextStatus,
        updated_at: new Date().toISOString()
      });

      // Clear note
      setAdminReplyNotes((prev) => ({ ...prev, [ticket.id]: '' }));
    } catch (err: any) {
      alert(`Ticket update failed: ${err.message}`);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div>
      {/* Top Header */}
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
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Support Inquiries & Merchant Communications</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Review and resolve partner technical inquiries and customer service tickets.
          </p>
        </div>
      </div>

      {/* Ticket Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'open', 'in_progress', 'resolved'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setTicketFilter(status)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'capitalize',
              background: ticketFilter === status ? 'var(--accent-indigo)' : 'var(--bg-secondary)',
              color: ticketFilter === status ? '#FFFFFF' : 'var(--text-secondary)',
              border: '1px solid var(--border-color)'
            }}
          >
            {status.replace('_', ' ')} (
            {status === 'all' ? tickets.length : tickets.filter((t) => t.status === status).length}
            )
          </button>
        ))}
      </div>

      {filteredTickets.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          No support tickets found for this filter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filteredTickets.map((ticket) => (
            <div key={ticket.id} className="glass-panel">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: 12
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span className={`badge badge-${ticket.status}`}>{ticket.status.replace('_', ' ')}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 4,
                        background:
                          ticket.priority === 'urgent'
                            ? 'rgba(244, 63, 94, 0.2)'
                            : 'rgba(255, 255, 255, 0.08)',
                        color: ticket.priority === 'urgent' ? 'var(--accent-rose)' : 'var(--text-secondary)',
                        textTransform: 'uppercase'
                      }}
                    >
                      {ticket.priority} priority
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Shop: {getShopName(ticket.shop_id)}
                    </span>
                  </div>

                  <h3 style={{ fontSize: 16, fontWeight: 800 }}>{ticket.subject}</h3>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
                    {ticket.message}
                  </p>

                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                    Submitted {new Date(ticket.created_at).toLocaleString()}
                  </p>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {ticket.status === 'open' && (
                    <button
                      disabled={loadingId === ticket.id}
                      onClick={() => handleUpdateTicketStatus(ticket, 'in_progress')}
                      style={{
                        background: 'var(--accent-indigo)',
                        color: '#FFFFFF',
                        padding: '6px 14px',
                        borderRadius: 6,
                        fontWeight: 700,
                        fontSize: 12
                      }}
                    >
                      Mark In Progress
                    </button>
                  )}

                  {ticket.status !== 'resolved' && (
                    <button
                      disabled={loadingId === ticket.id}
                      onClick={() => handleUpdateTicketStatus(ticket, 'resolved')}
                      style={{
                        background: 'var(--accent-green)',
                        color: '#070A13',
                        padding: '6px 14px',
                        borderRadius: 6,
                        fontWeight: 800,
                        fontSize: 12
                      }}
                    >
                      ✓ Resolve Ticket
                    </button>
                  )}

                  {ticket.status !== 'closed' && (
                    <button
                      disabled={loadingId === ticket.id}
                      onClick={() => handleUpdateTicketStatus(ticket, 'closed')}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-secondary)',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontWeight: 600,
                        fontSize: 12
                      }}
                    >
                      Close
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
