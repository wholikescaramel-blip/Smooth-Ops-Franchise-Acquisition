import { useEffect, useRef } from 'react';
import type { Outcome } from '../engine';

/** Okabe-Ito hues. Colour is never the only cue: every outcome also has its own shape and glyph. */
export const OUTCOME_COLOR: Record<Outcome, string> = {
  Approved: '#009E73',
  Hold: '#E69F00',
  Waitlist: '#0072B2',
  Redirect: '#CC79A7',
  Decline: '#D55E00',
};
const GLYPH: Record<Outcome, string> = { Approved: '#fff', Hold: '#222', Waitlist: '#fff', Redirect: '#222', Decline: '#fff' };
export const SHAPE_NAME: Record<Outcome, string> = { Approved: 'circle with a tick', Hold: 'square with two bars', Waitlist: 'triangle', Redirect: 'diamond with an arrow', Decline: 'octagon with a cross' };

/** Marker drawn in a 20-unit box centred on (0,0). Reused inside the map and inline in text. */
export function MarkShape({ o, x = 0, y = 0, size = 20, outline = '#222' }: { o: Outcome; x?: number; y?: number; size?: number; outline?: string }) {
  const c = OUTCOME_COLOR[o];
  const g = GLYPH[o];
  const sw = 1.1;
  const body =
    o === 'Approved' ? <circle r={9} fill={c} stroke={outline} strokeWidth={sw} /> :
    o === 'Hold' ? <rect x={-8.5} y={-8.5} width={17} height={17} rx={3} fill={c} stroke={outline} strokeWidth={sw} /> :
    o === 'Waitlist' ? <polygon points="0,-10 10,8 -10,8" fill={c} stroke={outline} strokeWidth={sw} strokeLinejoin="round" /> :
    o === 'Redirect' ? <polygon points="0,-10.5 10.5,0 0,10.5 -10.5,0" fill={c} stroke={outline} strokeWidth={sw} strokeLinejoin="round" /> :
    <polygon points="-3.9,-9.4 3.9,-9.4 9.4,-3.9 9.4,3.9 3.9,9.4 -3.9,9.4 -9.4,3.9 -9.4,-3.9" fill={c} stroke={outline} strokeWidth={sw} strokeLinejoin="round" />;
  const glyph =
    o === 'Approved' ? <path d="M-4 0.5 L-1 3.5 L4.5 -3" fill="none" stroke={g} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> :
    o === 'Hold' ? <path d="M-2.5 -4 V4 M2.5 -4 V4" stroke={g} strokeWidth={2} strokeLinecap="round" /> :
    o === 'Waitlist' ? <path d="M-3.5 5 H3.5 M-2.2 1.6 H2.2" stroke={g} strokeWidth={1.6} strokeLinecap="round" /> :
    o === 'Redirect' ? <path d="M-5 0 H4 M0.8 -3.6 L4.4 0 L0.8 3.6" fill="none" stroke={g} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /> :
    <path d="M-3.4 -3.4 L3.4 3.4 M3.4 -3.4 L-3.4 3.4" stroke={g} strokeWidth={2} strokeLinecap="round" />;
  return <g transform={`translate(${x} ${y}) scale(${size / 20})`}>{body}{glyph}</g>;
}

export function Mark({ o, size = 16 }: { o: Outcome; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-11 -11 22 22" aria-hidden="true" className="shrink-0">
      <MarkShape o={o} />
    </svg>
  );
}

/** Small line icons, 24px grid. */
export function Icon({ name, size = 20 }: { name: 'search' | 'close' | 'store' | 'layers' | 'plus' | 'minus' | 'download' | 'upload' | 'undo' | 'chevron' | 'list' | 'map'; size?: number }) {
  const d: Record<string, string> = {
    search: 'M11 4a7 7 0 1 0 4.2 12.6l4.6 4.6 1.4-1.4-4.6-4.6A7 7 0 0 0 11 4Z',
    close: 'M6 6l12 12M18 6L6 18',
    store: 'M4 9l1.5-5h13L20 9M4 9v1a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 6 0 2.5 2.5 0 0 0 5 0V9M5 12.5V20h14v-7.5M10 20v-4.5h4V20',
    layers: 'M12 3l9 5-9 5-9-5 9-5ZM3 12.5l9 5 9-5M3 16.5l9 5 9-5',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    download: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
    upload: 'M12 16V5M7 9.5l5-5 5 5M5 20h14',
    undo: 'M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 12',
    chevron: 'M6 9l6 6 6-6',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    map: 'M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4ZM9 4v13.5M15 6.5V20',
  };
  const fill = name === 'search' ? 'currentColor' : 'none';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={fill === 'none' ? 'currentColor' : 'none'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d={d[name]} />
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
    <span style={{ background: OUTCOME_COLOR[o] + '1F' }} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${small ? 'py-0.5 pl-1.5 pr-2.5 text-xs' : 'py-1 pl-2 pr-3 text-sm'}`}>
      <Mark o={o} size={small ? 14 : 18} />
      {o}
    </span>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-white p-5 shadow-card ${className}`}>{children}</div>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-lg font-semibold leading-tight">{children}</h3>
      {right}
    </div>
  );
}

export const btn = 'inline-flex items-center justify-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold hover:border-brand hover:text-brand disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink';
export const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40';
export const field = 'rounded-lg border border-line bg-white px-3 py-2 text-sm hover:border-brand';

/** Centered dialog with a close button at the top left and the title in the middle. */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`pop-in flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-pop sm:rounded-xl ${wide ? 'sm:max-w-4xl' : 'sm:max-w-xl'}`}>
        <div className="relative flex items-center justify-center border-b border-line px-5 py-4">
          <button ref={ref} onClick={onClose} aria-label="Close" className="absolute left-3 flex h-8 w-8 items-center justify-center rounded-full hover:bg-wash"><Icon name="close" size={18} /></button>
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
        <div className="overflow-auto p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
