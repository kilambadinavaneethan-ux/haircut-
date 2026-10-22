export interface QueueQRPayload {
  platform: 'QuickCut';
  entryId: string;
  shopId: string;
  token: string;
  timestamp: number;
}

/**
 * Encodes a queue ticket into a standardized JSON QR string
 */
export function generateQueueQRPayload(entryId: string, shopId: string, token: string): string {
  const payload: QueueQRPayload = {
    platform: 'QuickCut',
    entryId,
    shopId,
    token,
    timestamp: Date.now()
  };
  return JSON.stringify(payload);
}

/**
 * Parses and verifies QR scan content
 */
export function parseQueueQRPayload(rawContent: string): QueueQRPayload | null {
  try {
    const parsed = JSON.parse(rawContent) as Partial<QueueQRPayload>;
    if (parsed.platform === 'QuickCut' && parsed.entryId && parsed.shopId && parsed.token) {
      return parsed as QueueQRPayload;
    }
    return null;
  } catch {
    return null;
  }
}
