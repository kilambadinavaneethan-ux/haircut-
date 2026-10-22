import { getSupabaseClient } from '@quickcut/shared';

export async function logAdminAction(
  adminId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  payload: Record<string, any>
) {
  const supabase = getSupabaseClient();
  try {
    const entry = {
      user_id: adminId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      payload,
      ip_address: 'admin-console',
      created_at: new Date().toISOString()
    };
    await (supabase.from('audit_logs') as any).insert(entry);
    console.info(`[Admin Audit] ${action} on ${entityType}:${entityId}`, payload);
  } catch (err) {
    console.warn('[Admin Audit Warning] Failed to persist audit log:', err);
  }
}
