/** Shared status → color map, used by the grid's status cell renderer and the charts panel donut. */
export const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  'to do': { bg: '#eceff1', fg: '#455a64' },
  'not started': { bg: '#eceff1', fg: '#455a64' },
  'in progress': { bg: '#fff3e0', fg: '#e65100' },
  'in review': { bg: '#ede7f6', fg: '#5e35b1' },
  'blocked': { bg: '#ffebee', fg: '#c62828' },
  'done': { bg: '#e8f5e9', fg: '#2e7d32' },
};
