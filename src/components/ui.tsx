import type { Outcome } from '../engine';

/** Outcome colours for dots, icons and fills. Never the primary coral. */
export const OUTCOME_COLOR: Record<Outcome, string> = {
  Approved: '#1F8A5B',
  Hold: '#D99A00',
  Waitlist: '#7A5AF8',
  Redirect: '#1B9AAA',
  Decline: '#8A8F98',
};
/** Darker tones for text so labels pass WCAG AA on white. */
export const OUTCOME_TEXT: Record<Outcome, string> = {
  Approved: '#17704A',
  Hold: '#8A5F00',
  Waitlist: '#6244D6',
  Redirect: '#12717D',
  Decline: '#5E636C',
};
export const OUTCOME_ICON_PATH: Record<Outcome, string> = {
  Approved: 'M2.6 6.4l2.3 2.3 4.6-5', // check
  Hold: 'M4.2 3v6M7.8 3v6', // pause
  Waitlist: 'M6 2.8V6l2.2 1.4', // clock hands (circle drawn separately)
  Redirect: 'M2.5 6h6.6M6.6 3.2L9.4 6 6.6 8.8', // arrow
  Decline: 'M3.2 3.2l5.6 5.6M8.8 3.2L3.2 8.8', // cross
};
export const PRIORITY_TONE = { High: 0.2, Medium: 0.12, Low: 0.06 } as const;

/** Filled colour disc with a white icon: colour AND shape, never colour alone. Hold uses an ink glyph for contrast. */
export function OutcomeIcon({ o, size = 16 }: { o: Outcome; size?: number }) {
  const c = OUTCOME_COLOR[o];
  const glyph = o === 'Hold' ? '#222B45' : '#FFFFFF';
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
      <circle cx="6" cy="6" r="6" fill={c} />
      {o === 'Waitlist' && <circle cx="6" cy="6" r="3.7" fill="none" stroke={glyph} strokeWidth="1.1" />}
      <path d={OUTCOME_ICON_PATH[o]} fill="none" stroke={glyph} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Calendar date for "N weeks from today" (display only; the engine itself never reads the clock). */
export function weekDate(w: number | undefined): string {
  if (w === undefined) return '';
  const d = new Date();
  d.setDate(d.getDate() + Math.round(w * 7));
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function Badge({ o, small }: { o: Outcome; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${small ? 'py-0.5 pl-1 pr-2 text-xs' : 'py-1 pl-1.5 pr-3 text-sm'}`}
      style={{ color: OUTCOME_TEXT[o], background: OUTCOME_COLOR[o] + '1F' }}
    >
      <OutcomeIcon o={o} size={small ? 14 : 18} />
      {o}
    </span>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-hair bg-surface ${className}`}>{children}</div>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-base font-semibold text-ink">{children}</h3>
      {right}
    </div>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      {(Object.keys(OUTCOME_COLOR) as Outcome[]).map((o) => (
        <span key={o} className="inline-flex items-center gap-1.5">
          <OutcomeIcon o={o} size={14} />
          {o}
        </span>
      ))}
    </div>
  );
}
