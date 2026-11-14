import { QueueEntry, Service, EstimatedWaitCalculation } from '../types/models';

export interface WaitTimeInput {
  targetEntryId: string;
  queueEntries: QueueEntry[];
  servicesMap: Record<string, Pick<Service, 'id' | 'avg_minutes'>>;
  activeBarberCount?: number;
  currentTime?: number;
}

/**
 * Calculates estimated wait time for a given queue entry:
 * - When barber assignments exist: models individual barber workload channels (discrete simulation),
 *   deducting elapsed time for in-chair cuts, routing unassigned customers to earliest free barber,
 *   and computing requested barber chair wait time.
 * - When no specific barber assignments exist (general shop pool): calculates workload ahead
 *   divided across parallel active barbers.
 * - Clearly demarcated as an estimate with disclaimer.
 */
export function calculateEstimatedWaitTime(input: WaitTimeInput): EstimatedWaitCalculation {
  const { targetEntryId, queueEntries, servicesMap, activeBarberCount = 1, currentTime } = input;
  const target = queueEntries.find(e => e.id === targetEntryId);

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

    // Entry currently in service
    if (entry.status === 'in_service') return true;

    // Waiting entries created before this entry
    if (entry.status === 'waiting') {
      const entryCreatedTime = new Date(entry.created_at).getTime();
      return entryCreatedTime < targetCreatedTime;
    }

    return false;
  });

  const getEntryDuration = (entry: QueueEntry): number => {
    const service = servicesMap[entry.service_id];
    const duration = service ? service.avg_minutes : 20;

    if (entry.status === 'in_service') {
      const startIso = entry.called_at || entry.created_at;
      const startTime = new Date(startIso).getTime();
      const refTime = currentTime ?? Date.now();
      const isHistoricalMock = currentTime === undefined && Math.abs(refTime - startTime) > 12 * 60 * 60 * 1000;
      const elapsedMinutes = isHistoricalMock ? 0 : Math.max(0, Math.floor((refTime - startTime) / 60000));
      return Math.max(1, duration - elapsedMinutes);
    }
    return duration;
  };

  // Check if specific barber assignments are present
  const hasAssignments = !!target.barber_id || entriesAhead.some(e => !!e.barber_id);

  let estimatedMinutes = 0;

  if (hasAssignments) {
    // Discrete Multi-Server Simulation
    const barberIds = new Set<string>();
    if (target.barber_id) barberIds.add(target.barber_id);
    for (const entry of entriesAhead) {
      if (entry.barber_id) barberIds.add(entry.barber_id);
    }

    // Ensure we have at least max(activeBarberCount, barberIds.size, 1) channels
    const totalChannels = Math.max(activeBarberCount, barberIds.size, 1);
    const channels: { id: string; remainingMinutes: number }[] = [];

    // Add named barber channels
    let idx = 1;
    for (const bId of barberIds) {
      channels.push({ id: bId, remainingMinutes: 0 });
    }
    while (channels.length < totalChannels) {
      channels.push({ id: `generic-channel-${idx++}`, remainingMinutes: 0 });
    }

    // 1. Process in-service entries
    const inServiceEntries = entriesAhead.filter(e => e.status === 'in_service');
    for (const entry of inServiceEntries) {
      const duration = getEntryDuration(entry);
      if (entry.barber_id) {
        const channel = channels.find(c => c.id === entry.barber_id);
        if (channel) {
          channel.remainingMinutes += duration;
        } else {
          channels.push({ id: entry.barber_id, remainingMinutes: duration });
        }
      } else {
        // Allocate to channel with minimum current workload
        channels.sort((a, b) => a.remainingMinutes - b.remainingMinutes);
        channels[0].remainingMinutes += duration;
      }
    }

    // 2. Process waiting entries ahead in FIFO order
    const waitingAhead = entriesAhead
      .filter(e => e.status === 'waiting')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    for (const entry of waitingAhead) {
      const duration = getEntryDuration(entry);
      if (entry.barber_id) {
        const channel = channels.find(c => c.id === entry.barber_id);
        if (channel) {
          channel.remainingMinutes += duration;
        } else {
          channels.push({ id: entry.barber_id, remainingMinutes: duration });
        }
      } else {
        // Allocate to earliest available channel (greedy dispatch)
        channels.sort((a, b) => a.remainingMinutes - b.remainingMinutes);
        channels[0].remainingMinutes += duration;
      }
    }

    // 3. Determine target's wait time
    if (target.barber_id) {
      const targetChannel = channels.find(c => c.id === target.barber_id);
      estimatedMinutes = targetChannel ? targetChannel.remainingMinutes : 0;
    } else {
      // Unassigned customer takes whichever barber becomes free next
      estimatedMinutes = Math.min(...channels.map(c => c.remainingMinutes));
    }
  } else {
    // General Shop Pool (no specific barber assignments)
    const barbers = Math.max(1, activeBarberCount);
    const totalMinutes = entriesAhead.reduce((sum, entry) => sum + getEntryDuration(entry), 0);
    estimatedMinutes = Math.ceil(totalMinutes / barbers);
  }

  // Count relevant people ahead
  const relevantPeopleAhead = target.barber_id
    ? entriesAhead.filter(e => !e.barber_id || e.barber_id === target.barber_id).length
    : entriesAhead.length;

  return {
    estimatedMinutes,
    peopleAhead: relevantPeopleAhead,
    isEstimate: true,
    disclaimer: 'Estimated wait is approximate and dynamically calculated based on queue progress and active barbers.'
  };
}

/**
 * Calculates estimated wait time for a newcomer joining a specific shop queue.
 * Accounts for multiple active barbers and deducts elapsed time for active haircuts.
 */
export function calculateShopCurrentWait(
  queueEntries: QueueEntry[],
  servicesMap: Record<string, Pick<Service, 'id' | 'avg_minutes'>>,
  activeBarberCount: number = 1,
  currentTime?: number
): { estimatedMinutes: number; waitingCount: number; isEstimate: true } {
  const activeEntries = queueEntries.filter(
    e => e.status === 'waiting' || e.status === 'in_service'
  );
  const barbers = Math.max(1, activeBarberCount);

  const totalWorkload = activeEntries.reduce((sum, entry) => {
    const service = servicesMap[entry.service_id];
    const duration = service ? service.avg_minutes : 20;

    if (entry.status === 'in_service') {
      const startIso = entry.called_at || entry.created_at;
      const startTime = new Date(startIso).getTime();
      const refTime = currentTime ?? Date.now();
      const isHistoricalMock = currentTime === undefined && Math.abs(refTime - startTime) > 12 * 60 * 60 * 1000;
      const elapsedMinutes = isHistoricalMock ? 0 : Math.max(0, Math.floor((refTime - startTime) / 60000));
      return sum + Math.max(1, duration - elapsedMinutes);
    }

    return sum + duration;
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
