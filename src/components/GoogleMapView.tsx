import { useEffect, useRef, useState } from 'react';
import { cityByName, pinPosition } from '../data/cityGeo';
import type { Dataset, EngineResult, Outcome } from '../engine';
import type { Layers } from '../state/store';
import { loadGoogleMaps } from '../lib/googleMaps';
import { hasLocation } from './mapUtil';
import { OUTCOME_COLOR } from './ui';

const INK = '#222222';
const BRAND = '#3F3BB5';
const MUTE = '#6A6A6A';
const BOUNDS = { south: 11.4, west: 73.9, north: 18.6, east: 78.7 };

/** Quiet, light base map in the same family as the rest of the app: no points of interest, muted roads. */
const STYLE: google.maps.MapTypeStyle[] = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#e4e4e4' }] },
  { featureType: 'landscape', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'water', stylers: [{ color: '#d6e4f0' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6a6a6a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ color: '#9a9a9a' }, { weight: 1.2 }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#222222' }] },
];

/** The outcome shapes as SVG text, in a 20-unit box centred on 0,0. Mirrors MarkShape. */
function shapeSvg(o: Outcome): string {
  const c = OUTCOME_COLOR[o];
  const g = o === 'Hold' || o === 'Redirect' ? '#222' : '#fff';
  const st = `stroke="#222" stroke-width="1.1" stroke-linejoin="round"`;
  const body =
    o === 'Approved' ? `<circle r="9" fill="${c}" ${st}/>` :
    o === 'Hold' ? `<rect x="-8.5" y="-8.5" width="17" height="17" rx="3" fill="${c}" ${st}/>` :
    o === 'Waitlist' ? `<polygon points="0,-10 10,8 -10,8" fill="${c}" ${st}/>` :
    o === 'Redirect' ? `<polygon points="0,-10.5 10.5,0 0,10.5 -10.5,0" fill="${c}" ${st}/>` :
    `<polygon points="-3.9,-9.4 3.9,-9.4 9.4,-3.9 9.4,3.9 3.9,9.4 -3.9,9.4 -9.4,3.9 -9.4,-3.9" fill="${c}" ${st}/>`;
  const gl = `stroke="${g}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  const glyph =
    o === 'Approved' ? `<path d="M-4 .5L-1 3.5L4.5 -3" ${gl} stroke-width="2"/>` :
    o === 'Hold' ? `<path d="M-2.5 -4V4M2.5 -4V4" ${gl} stroke-width="2"/>` :
    o === 'Waitlist' ? `<path d="M-3.5 5H3.5M-2.2 1.6H2.2" ${gl} stroke-width="1.6"/>` :
    o === 'Redirect' ? `<path d="M-5 0H4M.8 -3.6L4.4 0L.8 3.6" ${gl} stroke-width="1.8"/>` :
    `<path d="M-3.4 -3.4L3.4 3.4M3.4 -3.4L-3.4 3.4" ${gl} stroke-width="2"/>`;
  return body + glyph;
}

const dataUrl = (svg: string) => 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
const SHADOW = `<filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.3" flood-opacity=".35"/></filter>`;

/** A white badge carrying the outcome shape; a pill with the id when `label` is given; brand-coloured when selected. */
function applicantIcon(o: Outcome, label: string | null, selected: boolean): google.maps.Icon {
  const h = 32;
  const w = label ? 40 + label.length * 8 : h;
  const fill = selected ? BRAND : '#fff';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 6}" height="${h + 6}" viewBox="-3 -3 ${w + 6} ${h + 6}"><defs>${SHADOW}</defs>` +
    `<rect x="0" y="0" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" filter="url(#s)"/>` +
    `<circle cx="16" cy="16" r="12" fill="#fff"/><g transform="translate(16 16) scale(.72)">${shapeSvg(o)}</g>` +
    (label ? `<text x="34" y="21" font-family="Figtree,Arial,sans-serif" font-size="14" font-weight="700" fill="${selected ? '#fff' : INK}">${label}</text>` : '') +
    `</svg>`;
  return { url: dataUrl(svg), scaledSize: new google.maps.Size(w + 6, h + 6), anchor: new google.maps.Point(19, 19) };
}

function storeIcon(): google.maps.Icon {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="-3 -3 32 32"><defs>${SHADOW}</defs>` +
    `<circle cx="13" cy="13" r="13" fill="#fff" filter="url(#s)"/>` +
    `<g transform="translate(6.5 6.5) scale(.54)" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9l1.5-5h13L20 9M4 9v1a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 6 0 2.5 2.5 0 0 0 5 0V9M5 12.5V20h14v-7.5"/></g></svg>`;
  return { url: dataUrl(svg), scaledSize: new google.maps.Size(32, 32), anchor: new google.maps.Point(16, 16) };
}

/** Small "was Hold" tag shown under a pin whose outcome just changed. */
function wasIcon(was: Outcome): google.maps.Icon {
  const label = `was ${was}`;
  const w = 44 + label.length * 6.4;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 6}" height="30" viewBox="-3 -3 ${w + 6} 30"><defs>${SHADOW}</defs>` +
    `<rect x="0" y="0" width="${w}" height="24" rx="12" fill="#fff" filter="url(#s)"/>` +
    `<g transform="translate(14 12) scale(.55)">${shapeSvg(was)}<path d="M-10 10L10 -10" stroke="#222" stroke-width="2.4"/></g>` +
    `<text x="28" y="16.5" font-family="Figtree,Arial,sans-serif" font-size="12" font-weight="600" fill="${INK}">${label}</text></svg>`;
  return { url: dataUrl(svg), scaledSize: new google.maps.Size(w + 6, 30), anchor: new google.maps.Point(w / 2 + 3, -4) };
}

interface Props {
  ds: Dataset;
  result: EngineResult;
  prev?: EngineResult | null;
  focus: string; // 'state' | city name
  selected: string | null;
  changed: string[];
  visible: Set<string> | null;
  layers: Layers;
  onSelect?: (id: string) => void;
  onFocus?: (city: string) => void;
  /** Called when Google rejects the key or the script cannot load, so the app can fall back to its own map. */
  onFail: () => void;
}

export function GoogleMapView({ ds, result, prev, focus, selected, changed, visible, layers, onSelect, onFocus, onFail }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const overlays = useRef<{ setMap: (m: google.maps.Map | null) => void }[]>([]);
  const timers = useRef<number[]>([]);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(7);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
    const fail = () => !cancelled && onFail();
    window.addEventListener('gm-auth-failure', fail);
    loadGoogleMaps(key)
      .then(() => {
        if (cancelled || !box.current) return;
        const m = new google.maps.Map(box.current, {
          center: { lat: 15.0, lng: 76.3 }, zoom: 7, styles: STYLE, disableDefaultUI: true, gestureHandling: 'greedy',
          clickableIcons: false, minZoom: 6, maxZoom: 17,
        });
        m.fitBounds(BOUNDS);
        m.addListener('zoom_changed', () => setZoom(Math.round(m.getZoom() ?? 7)));
        map.current = m;
        // The box may still be settling into its final size; refit whenever it changes while showing the whole state.
        if (typeof ResizeObserver !== 'undefined') {
          ro = new ResizeObserver(() => {
            google.maps.event.trigger(m, 'resize');
            if (focusRef.current === 'state') m.fitBounds(BOUNDS, 8);
          });
          ro.observe(box.current);
        }
        setReady(true);
      })
      .catch(fail);
    return () => {
      cancelled = true;
      ro?.disconnect();
      window.removeEventListener('gm-auth-failure', fail);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move the camera when the zoom target changes.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const c = focus !== 'state' ? cityByName(focus) : null;
    if (c) {
      // centre first, then zoom: panTo + setZoom (or setOptions with both) can leave the camera at the wrong place
      m.setCenter({ lat: c.lat, lng: c.lng });
      m.setZoom(12);
    } else m.fitBounds(BOUNDS, 8);
  }, [ready, focus]);

  // Zoom controls from the page (+ and -) are handled by changing `focus`; the map can also be zoomed by hand.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = [];
    timers.current.forEach((t) => window.clearInterval(t));
    timers.current = [];
    const add = <T extends { setMap: (m: google.maps.Map | null) => void }>(o: T) => (overlays.current.push(o), o);
    // Circles are in metres, so they shrink as you zoom out; scale them up so they stay visible.
    const k = Math.min(14, Math.max(1, 2 ** (11 - zoom)));
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const cityFocus = focus !== 'state' ? focus : null;
    const inCity = (city: string | null | undefined) => !cityFocus || city === cityFocus;

    // territories: a patch around every pin they list (pin codes are not contiguous, so no single outline)
    if (layers.territories) {
      const filled = new Map(result.territories.map((t) => [t.territory.id, t.filled]));
      const pinStatus = new Map(result.pins.map((p) => [p.pin, p]));
      for (const t of ds.territories) {
        if (!inCity(t.city)) continue;
        const pts = t.pins.map((pin) => ({ pin, pp: pinPosition(pin, t.city) })).filter((x) => x.pp) as { pin: string; pp: { lat: number; lng: number } }[];
        if (!pts.length) continue;
        const open = Math.max(0, t.slots - (filled.get(t.id) ?? 0));
        for (const x of pts) {
          const circle = add(new google.maps.Circle({
            map: m, center: x.pp, radius: 1300 * k, strokeColor: BRAND, strokeOpacity: open > 0 ? 0.55 : 0.25, strokeWeight: 1.2,
            fillColor: BRAND, fillOpacity: open > 0 ? 0.08 : 0.025, clickable: !cityFocus, zIndex: 1,
          }));
          if (!cityFocus) circle.addListener('click', () => onFocus?.(t.city));
          const st = pinStatus.get(x.pin);
          if (zoom >= 11 && st && st.status !== 'blocked') {
            add(new google.maps.Marker({
              map: m, position: x.pp, clickable: false, zIndex: 2, title: `Pin ${x.pin}: ${st.status}`,
              icon: { path: google.maps.SymbolPath.CIRCLE, scale: 4.5, fillColor: st.status === 'taken' ? INK : '#fff', fillOpacity: 1, strokeColor: st.status === 'contested' ? BRAND : MUTE, strokeWeight: 1.5, labelOrigin: new google.maps.Point(0, 2.6) },
              label: { text: x.pin, color: MUTE, fontSize: '10px', fontWeight: '500' },
            }));
          }
        }
        const top = pts.reduce((mm, x) => (x.pp.lat > mm.pp.lat ? x : mm), pts[0]);
        add(new google.maps.Marker({
          map: m, position: top.pp, clickable: false, zIndex: 2, opacity: 0, title: `${t.id}: ${open} of ${t.slots} slots open`,
          label: cityFocus ? { text: `${t.id}, ${open} of ${t.slots} open`, color: BRAND, fontWeight: '700', fontSize: '12px', className: 'gm-tlabel' } : undefined,
        }));
      }
    }

    // existing stores
    if (layers.stores) {
      for (const s of ds.stores) {
        if (!inCity(s.city)) continue;
        const pp = pinPosition(s.pin, s.city);
        if (!pp) continue;
        add(new google.maps.Circle({ map: m, center: pp, radius: 1100 * k, strokeColor: INK, strokeOpacity: 0.5, strokeWeight: 1, fillColor: INK, fillOpacity: 0.04, clickable: false, zIndex: 3 }));
        add(new google.maps.Marker({ map: m, position: pp, icon: storeIcon(), zIndex: 4, title: `Existing store ${s.id}, pin ${s.pin}` }));
      }
    }

    // applicants (offset slightly when several share a pin)
    if (layers.applicants) {
      const groups = new Map<string, string[]>();
      const inAny = new Set(ds.territories.flatMap((t) => t.pins));
      const placed = ds.applications.filter((a) => hasLocation(a, result.decisions[a.id]));
      for (const a of placed) if (a.pin) groups.set(a.pin, [...(groups.get(a.pin) ?? []), a.id]);
      for (const a of placed) {
        if (!a.pin || !inCity(a.city)) continue;
        const pp = pinPosition(a.pin, a.city);
        if (!pp) continue;
        const g = groups.get(a.pin) as string[];
        const ang = (g.indexOf(a.id) / Math.max(g.length, 1)) * Math.PI * 2 + 0.6;
        const off = g.length > 1 ? 0.0045 * Math.min(k, 6) : 0;
        const pos = { lat: pp.lat + off * Math.sin(ang), lng: pp.lng + off * Math.cos(ang) };
        const d = result.decisions[a.id];
        const dim = visible && !visible.has(a.id);
        const isSel = selected === a.id;
        const isChanged = changed.includes(a.id);
        const was = prev?.decisions[a.id]?.outcome;
        const label = zoom >= 11 || isSel || isChanged ? a.id.replace('APP-', '') : null;
        const col = OUTCOME_COLOR[d.outcome];
        if (!inAny.has(a.pin)) add(new google.maps.Circle({ map: m, center: pos, radius: 1700 * k, strokeColor: MUTE, strokeOpacity: dim ? 0.15 : 0.8, strokeWeight: 1.5, fillOpacity: 0, clickable: false, zIndex: 4 }));
        add(new google.maps.Circle({ map: m, center: pos, radius: 750 * k, strokeColor: col, strokeOpacity: dim ? 0.1 : 0.45, strokeWeight: 1, fillColor: col, fillOpacity: dim ? 0.03 : 0.12, clickable: false, zIndex: 5 }));
        if (layers.rings && d.outcome === 'Approved') add(new google.maps.Circle({ map: m, center: pos, radius: 1500 * k, strokeColor: OUTCOME_COLOR.Approved, strokeOpacity: 0.7, strokeWeight: 1.5, fillOpacity: 0, clickable: false, zIndex: 5 }));
        const mk = add(new google.maps.Marker({
          map: m, position: pos, icon: applicantIcon(d.outcome, label, isSel), opacity: dim ? 0.25 : 1, zIndex: isSel ? 1000 : isChanged ? 900 : 10,
          title: `${a.id}, ${a.name}: ${d.outcome}, score ${d.score}`,
        }));
        mk.addListener('click', () => onSelect?.(a.id));
        if (isChanged) {
          const ring = add(new google.maps.Circle({ map: m, center: pos, radius: 900 * k, strokeColor: col, strokeOpacity: 0.9, strokeWeight: 3, fillOpacity: 0, clickable: false, zIndex: 800 }));
          if (!reduce) {
            let t = 0;
            const id = window.setInterval(() => {
              t += 1;
              const p = (t % 38) / 38;
              ring.setOptions({ radius: 900 * k * (1 + p * 2.2), strokeOpacity: 0.9 * (1 - p) });
              if (t >= 114) {
                window.clearInterval(id);
                ring.setOptions({ radius: 900 * k, strokeOpacity: 0.9 });
              }
            }, 40);
            timers.current.push(id);
          }
          if (was && was !== d.outcome && changed.length <= 4) add(new google.maps.Marker({ map: m, position: pos, icon: wasIcon(was), clickable: false, zIndex: 950, title: `${a.id} was ${was}` }));
        }
      }
    }

    // arrows to the chosen pin
    if (layers.arcs) {
      for (const a of ds.applications) {
        const d = result.decisions[a.id];
        if (d.outcome !== 'Redirect' || !d.redirect || !a.pin || !inCity(a.city)) continue;
        const from = pinPosition(a.pin, a.city);
        const to = pinPosition(d.redirect.pin, a.city);
        if (!from || !to) continue;
        add(new google.maps.Polyline({ map: m, path: [from, to], strokeColor: OUTCOME_COLOR.Redirect, strokeOpacity: 0, strokeWeight: 2, clickable: false, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '12px' }] }));
      }
    }
    return () => timers.current.forEach((t) => window.clearInterval(t));
  }, [ready, ds, result, prev, selected, changed, visible, layers, focus, zoom, onSelect, onFocus]);

  return <div ref={box} className="h-full w-full bg-[#E6ECF5]" role="application" aria-label="Google map of Karnataka franchise territories. Pin positions are approximate." />;
}
