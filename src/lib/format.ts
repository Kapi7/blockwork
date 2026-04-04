export function formatPace(secondsPerKm: number): string {
  if (!secondsPerKm || secondsPerKm <= 0) return '-';
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.floor(secondsPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}/km`;
}

/** Format bike speed as km/h from seconds-per-km */
export function formatSpeed(secondsPerKm: number): string {
  if (!secondsPerKm || secondsPerKm <= 0) return '-';
  const kmh = 3600 / secondsPerKm;
  return `${kmh.toFixed(1)} km/h`;
}

/** Smart format: pace for runs, speed for bikes */
export function formatEffort(secondsPerKm: number, sport: string): string {
  if (!secondsPerKm || secondsPerKm <= 0) return '-';
  if (sport === 'bike') return formatSpeed(secondsPerKm);
  if (sport === 'run') return formatPace(secondsPerKm);
  return formatTime(secondsPerKm); // fallback for yoga/strength: duration
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDistance(km: number): string {
  return km.toFixed(1);
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function daysSince(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
}

export function paceColor(secondsPerKm: number): string {
  if (secondsPerKm < 230) return '#f53b57';
  if (secondsPerKm < 250) return '#ff6b81';
  if (secondsPerKm < 290) return '#ffb142';
  if (secondsPerKm < 320) return '#0be881';
  return '#34e7e4';
}
