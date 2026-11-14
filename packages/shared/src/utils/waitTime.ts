import { QueueEntry, Service, EstimatedWaitCalculation } from '../types/models';

export interface WaitTimeInput {
  targetEntryId: string;
  queueEntries: QueueEntry[];
  servicesMap: Record<string, Pick<Service, 'id' | 'avg_minutes'>>;
  activeBarberCount?: number;
}

/**
 * Calculates estimated wait time for a given queue entry:
 * Factors in parallel active barbers (M/G/c queue simulation) and service durations.
 * Clearly demarcated as an estimate.
 */
export function calculateEstimatedWaitTime(input: WaitTimeInput): EstimatedWaitCalculation {
  const { targetEntryId, queueEntries, servicesMap, activeBarberCount = 1 } = input;
  const target = queueEntries.find(e => e.id === targetEntryId);
  const barbers = Math.max(1, activeBarberCount);

  const defaultResult: EstimatedWaitCalculation = {
    estimatedMinutes: 0,
    peopleAhead: 0,
    isEstimate: true,
    disclaimer: 'Estimated wait is approximate and dynamically calculated based on queue progress and active barbers.'
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

  // Divide workload across parallel active barbers
  const estimatedMinutes = Math.ceil(totalMinutes / barbers);

  return {
    estimatedMinutes,
    peopleAhead: entriesAhead.length,
    isEstimate: true,
    disclaimer: 'Estimated wait is approximate and dynamically calculated based on queue progress and active barbers.'
  };
}

/**
 * Calculates estimated wait time for a newcomer joining a specific shop queue.
 * Accounts for multiple active barbers.
 */
export function calculateShopCurrentWait(
  queueEntries: QueueEntry[],
  servicesMap: Record<string, Pick<Service, 'id' | 'avg_minutes'>>,
  activeBarberCount: number = 1
): { estimatedMinutes: number; waitingCount: number; isEstimate: true } {
  const activeEntries = queueEntries.filter(
    e => e.status === 'waiting' || e.status === 'in_service'
  );
  const barbers = Math.max(1, activeBarberCount);

  const totalWorkload = activeEntries.reduce((sum, entry) => {
    const service = servicesMap[entry.service_id];
    return sum + (service ? service.avg_minutes : 20);
  }, 0);

  const estimatedMinutes = Math.ceil(totalWorkload / barbers);

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
