// How a booking's status reads to the person who holds it.
//
// Shared because the confirmation-code page shows two things now — a single
// booking and a whole schedule — and the schedule view was written without a
// status at all, so a schedule an admin had ended came back under a green tick
// reading "Recurring schedule found" with nothing saying it was over.
//
// 'expired' and 'canceled' are phrased as what happened to the person rather
// than as the column value.
export const STATUS_LABELS = {
  pending: 'Awaiting approval',
  approved: 'Confirmed',
  denied: 'Denied',
  expired: 'Not reviewed in time',
  canceled: 'Canceled',
};

// A schedule is ended, not cancelled — cancelling reads as one booking going
// away, and this is the whole arrangement stopping.
export const SCHEDULE_STATUS_LABELS = {
  ...STATUS_LABELS,
  approved: 'Running',
  canceled: 'Ended',
};

export const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  denied: 'bg-red-100 text-red-800',
  expired: 'bg-surface-panel text-ink-body',
  canceled: 'bg-surface-panel text-ink-body',
};

export const isLiveStatus = (status) => ['pending', 'approved'].includes(status);
