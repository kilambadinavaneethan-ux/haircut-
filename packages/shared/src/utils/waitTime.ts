import { QueueEntry, Service, EstimatedWaitCalculation } from '../types/models';

export interface WaitTimeInput {
  targetEntryId: string;
  queueEntries: QueueEntry[];
  servicesMap: Record<string, Pick<Service, 'id' | 'avg_minutes'>>;
}

/**
 * Calculates estimated wait time for a given queue entry:
 * Sum of avg_minutes of services ahead in the queue.
 * Clearly demarcated as an estimate.
 */
export function calculateEstimatedWaitTime(input: WaitTimeInput): EstimatedWaitCalculation {
  const { targetEntryId, queueEntries, servicesMap } = input;
  const target = queueEntries.find(e => e.id === targetEntryId);

  const defaultResult: EstimatedWaitCalculation = {
    estimatedMinutes: 0,
    peopleAhead: 0,
    isEstimate: true,
    disclaimer: 'Estimated wait is approximate and dynamically calculated based on queue progress.'
  };

  if (!target || target.status !== 'waiting') {
    return defaultResult;
  }

  const targetCreatedTime = new Date(target.created_at).getTime();

  // Find all active queue entries for the same shop ahead of this one
  const entriesAhead = queueEntries.filter(entry => {
    if (entry.shop_id !== target.shop_id) return false;

    // Entry currently in service counts as time ahead
    if (entry.status === 'in_service') return true;

    // Waiting entries created before this entry
    if (entry.status === 'waiting') {
      const entryCreatedTime = new Date(entry.created_at).getTime();
      return entryCreatedTime < targetCreatedTime;
    }

    return false;
  });

  const totalMinutes = entriesAhead.reduce((sum, entry) => {
    const service = servicesMap[entry.service_id];
    const duration = service ? service.avg_minutes : 20; // fallback standard 20 mins
    return sum + duration;
  }, 0);

  return {
    estimatedMinutes: totalMinutes,
    peopleAhead: entriesAhead.length,
    isEstimate: true,
    disclaimer: 'Estimated wait is approximate and dynamically calculated based on queue progress.'
  };
}

/**
 * Calculates estimated wait time for a newcomer joining a specific shop queue.
 */
export function calculateShopCurrentWait(
  queueEntries: QueueEntry[],
  servicesMap: Record<string, Pick<Service, 'id' | 'avg_minutes'>>
): { estimatedMinutes: number; waitingCount: number; isEstimate: true } {
  const activeEntries = queueEntries.filter(
    e => e.status === 'waiting' || e.status === 'in_service'
  );

  const estimatedMinutes = activeEntries.reduce((sum, entry) => {
    const service = servicesMap[entry.service_id];
    return sum + (service ? service.avg_minutes : 20);
  }, 0);

  return {
    estimatedMinutes,
    waitingCount: activeEntries.length,
    isEstimate: true
  };
}

/**
 * User-friendly display string clearly marked as an estimate.
 */
export function formatEstimatedWaitDisplay(minutes: number): string {
  if (minutes <= 0) {
    return 'Ready next (Est. < 5 mins)';
  }
  if (minutes < 60) {
    return `~${minutes} mins (Est.)`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return remainingMins > 0 ? `~${hours}h ${remainingMins}m (Est.)` : `~${hours}h (Est.)`;
}
