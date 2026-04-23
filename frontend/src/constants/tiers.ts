export const TIERS = ['Mega', 'S', 'A', 'B', 'C', 'D', 'Free'] as const
export type TierName = typeof TIERS[number]

export const TIER_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  Mega:     { bg: '#ede9fe', border: '#a855f7', label: '#7c3aed' },
  S:        { bg: '#fee2e2', border: '#f87171', label: '#ef4444' },
  A:        { bg: '#ffedd5', border: '#fb923c', label: '#f97316' },
  B:        { bg: '#fef9c3', border: '#facc15', label: '#eab308' },
  C:        { bg: '#dcfce7', border: '#4ade80', label: '#22c55e' },
  D:        { bg: '#dbeafe', border: '#60a5fa', label: '#3b82f6' },
  Free:     { bg: '#f3f4f6', border: '#9ca3af', label: '#6b7280' },
  Untiered: { bg: 'var(--color-surface)', border: 'var(--color-border)', label: '#94a3b8' },
}

/** Per-letter-tier purple shades for individual Mega pokemon banners/badges. */
export const MEGA_BANNER_COLORS: Record<string, string> = {
  S: '#4c1d95', A: '#6d28d9', B: '#7c3aed', C: '#8b5cf6', D: '#a78bfa', Free: '#c4b5fd',
}
