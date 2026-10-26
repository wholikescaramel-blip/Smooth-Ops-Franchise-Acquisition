import type { Application, Decision } from '../engine';

/** Convex hull (monotone chain) of projected points. Returns 1 or 2 points for degenerate input. */
export function hull(points: [number, number][]): [number, number][] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]).filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1]);
  if (pts.length < 3) return pts;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Is there a trustworthy place for this applicant on the map? Applicants whose location the engine could not
 * settle (bad pin, pin and city disagree, guessed city) are not drawn: putting them somewhere would be a guess.
 */
export function hasLocation(a: Application, d: Decision | undefined): boolean {
  if (!a.pin) return false;
  if (!d) return true;
  if (d.missing.some((m) => m.field === 'pin' || m.field === 'city')) return false;
  if (d.outcome === 'Hold' && d.decidedBy === 'Territory match') return false;
  return true;
}
