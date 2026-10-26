import { useEffect, useRef, useState } from 'react';
import { toggleLayer, type Layers } from '../state/store';
import { Icon } from './ui';

const LAYER_LABELS: [keyof Layers, string][] = [
  ['territories', 'Territories'],
  ['stores', 'Existing stores'],
  ['applicants', 'Applicants'],
  ['rings', 'Spacing rings'],
  ['arcs', 'Arrows to the pin chosen'],
];

export const floatBtn = 'flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold shadow-float hover:bg-wash';

/** Layers menu: what to draw, and whether to show a map or a grid of pins. */
export function LayersMenu({ layers, view, setView }: { layers: Layers; view: 'map' | 'tiles'; setView: (v: 'map' | 'tiles') => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" className={floatBtn}><Icon name="layers" size={18} />Layers</button>
      {open && (
        <div className="pop-in absolute right-0 top-12 z-30 w-64 rounded-xl bg-white p-4 shadow-pop">
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Show on the map</legend>
            {LAYER_LABELS.map(([k, label]) => (
              <label key={k} className="flex cursor-pointer items-center gap-3 py-1.5 text-sm">
                <input type="checkbox" checked={layers[k]} onChange={() => toggleLayer(k)} className="h-4 w-4 accent-brand" />
                {label}
              </label>
            ))}
          </fieldset>
          <fieldset className="mt-3 border-t border-line pt-3">
            <legend className="mb-2 text-sm font-bold">View</legend>
            {([['map', 'Map'], ['tiles', 'Grid of pins']] as const).map(([v, label]) => (
              <label key={v} className="flex cursor-pointer items-center gap-3 py-1.5 text-sm">
                <input type="radio" name="view" checked={view === v} onChange={() => setView(v)} className="h-4 w-4 accent-brand" />
                {label}
              </label>
            ))}
          </fieldset>
        </div>
      )}
    </div>
  );
}
