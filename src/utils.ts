// ─── Date formatting ──────────────────────────────────────────────────────────

/**
 * Format a YYYY-MM-DD or ISO date string to MM/DD/YYYY.
 * Returns '—' if null/undefined/empty.
 */
export function formatDate(raw: string | null | undefined): string {
  if (!raw) return '—';
  // Handle both YYYY-MM-DD and full ISO strings
  const date = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

/**
 * Returns number of days from today to a date string.
 * Negative = past due. Null if no date provided.
 */
export function daysUntil(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const target = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  if (isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = target.getTime() - today.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

export function dueDateLabel(raw: string | null | undefined): {
  label: string;
  urgency: 'overdue' | 'critical' | 'soon' | 'ok' | 'none';
} {
  const days = daysUntil(raw);
  if (days === null) return { label: '—', urgency: 'none' };
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, urgency: 'overdue' };
  if (days === 0) return { label: 'Due today', urgency: 'critical' };
  if (days <= 7) return { label: `${days}d`, urgency: 'critical' };
  if (days <= 21) return { label: `${days}d`, urgency: 'soon' };
  return { label: `${days}d`, urgency: 'ok' };
}

// ─── Status helpers ───────────────────────────────────────────────────────────

/**
 * Map Innergy status strings to a simple display category.
 * These are heuristics — adjust based on your actual Innergy status values.
 */
export type StatusCategory = 'active' | 'complete' | 'hold' | 'pending' | 'unknown';

export function categorizeStatus(status: string | null | undefined): StatusCategory {
  if (!status) return 'unknown';
  const s = status.toLowerCase();
  if (s === 'closed') return 'complete';
  if (s === 'on hold') return 'hold';
  if (s === 'open' || s === 'in progress') return 'active';
  return 'pending';
}

export function statusColors(category: StatusCategory): {
  bg: string;
  text: string;
  dot: string;
} {
  switch (category) {
    case 'active':   return { bg: 'bg-emerald-900/40', text: 'text-emerald-300', dot: 'bg-emerald-400' };
    case 'complete': return { bg: 'bg-slate-700/40',   text: 'text-slate-400',   dot: 'bg-slate-500'   };
    case 'hold':     return { bg: 'bg-amber-900/40',   text: 'text-amber-300',   dot: 'bg-amber-400'   };
    case 'pending':  return { bg: 'bg-blue-900/40',    text: 'text-blue-300',    dot: 'bg-blue-400'    };
    default:         return { bg: 'bg-slate-800/40',   text: 'text-slate-400',   dot: 'bg-slate-600'   };
  }
}

export function urgencyColors(urgency: 'overdue' | 'critical' | 'soon' | 'ok' | 'none'): string {
  switch (urgency) {
    case 'overdue':  return 'text-red-400 font-semibold';
    case 'critical': return 'text-orange-400 font-semibold';
    case 'soon':     return 'text-amber-400';
    case 'ok':       return 'text-slate-400';
    default:         return 'text-slate-500';
  }
}
