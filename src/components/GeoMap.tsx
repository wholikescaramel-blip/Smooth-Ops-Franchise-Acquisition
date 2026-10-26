import { geoCentroid, geoMercator, geoPath } from 'd3-geo';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import geo from '../data/karnataka.geo.json';
import { CITIES, cityByName, pinPosition } from '../data/cityGeo';
import type { Dataset, EngineResult } from '../engine';
import type { Layers } from '../state/store';
import { MarkShape, OUTCOME_COLOR } from './ui';

const W = 680;
const H = 800;
const STATE = geo as unknown as GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, { district: string }>;
const INK = '#222222';
const MUTE = '#6A6A6A';
const BRAND = '#3F3BB5';

interface Props {
  ds: Dataset;
  result: EngineResult;
  /** Result before the last change; used to tag changed pins with their old outcome. */
  prev?: EngineResult | null;
  focus: string; // 'state' | city name
  selected: string | null;
  changed: string[];
  visible: Set<string> | null;
  layers: Layers;
  onSelect?: (id: string) => void;
  onFocus?: (city: string) => void;
  inset?: boolean;
}

export function GeoMap({ ds, result, prev, focus, selected, changed, visible, layers, onSelect, onFocus, inset }: Props) {
  const uid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [width, setWidth] = useState(W);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(Math.max(el.clientWidth, 1)));
    ro.observe(el);
    setWidth(Math.max(el.clientWidth, 1));
    return () => ro.disconnect();
  }, []);
  // Keep markers a readable size on screen whatever the map width.
  const u = inset ? 1.6 : Math.max(1, (W / width) * 0.9);

  const hv = (id: string, e: React.MouseEvent) => {
    const r = wrap.current?.getBoundingClientRect();
    if (r) setHover({ id, x: Math.max(0, Math.min(e.clientX - r.left, r.width - 260)), y: e.clientY - r.top });
  };
  const cityFocus = focus !== 'state' ? cityByName(focus) : null;
  const zoom = cityFocus ? 1 : 0;

  const proj = useMemo(() => {
    if (cityFocus) {
      const span = cityFocus.name === 'Bengaluru' ? 0.22 : 0.12;
      return geoMercator().center([cityFocus.lng, cityFocus.lat]).scale(W / ((span * Math.PI) / 180)).translate([W / 2, H / 2]);
    }
    return geoMercator().fitExtent([[40, 40], [W - 40, H - 90]], STATE);
  }, [cityFocus]);
  const path = useMemo(() => geoPath(proj), [proj]);
  const P = (lat: number, lng: number) => proj([lng, lat]) as [number, number];

  const districts = useMemo(
    () => STATE.features.map((f) => ({ name: f.properties.district, d: path(f) ?? '', c: proj(geoCentroid(f)) as [number, number] })),
    [path, proj],
  );

  const appPos = useMemo(() => {
    const m = new Map<string, [number, number]>();
    const groups = new Map<string, string[]>();
    for (const a of ds.applications) if (a.pin) groups.set(a.pin, [...(groups.get(a.pin) ?? []), a.id]);
    for (const a of ds.applications) {
      if (!a.pin) continue;
      const pp = pinPosition(a.pin, a.city);
      if (!pp) continue;
      const [x, y] = P(pp.lat, pp.lng);
      const g = groups.get(a.pin) as string[];
      const i = g.indexOf(a.id);
      const ang = (i / Math.max(g.length, 1)) * Math.PI * 2 + 0.6;
      const r = g.length > 1 ? (zoom ? 24 : 12) * u : 0;
      m.set(a.id, [x + r * Math.cos(ang), y + r * Math.sin(ang)]);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, proj, u]);

  const terrPos = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const t of ds.territories) {
      const pts = t.pins.map((p) => pinPosition(p, t.city)).filter(Boolean) as { lat: number; lng: number }[];
      const c = cityByName(t.city);
      if (!pts.length && !c) continue;
      const lat = pts.length ? pts.reduce((s, p) => s + p.lat, 0) / pts.length : (c as NonNullable<typeof c>).lat;
      const lng = pts.length ? pts.reduce((s, p) => s + p.lng, 0) / pts.length : (c as NonNullable<typeof c>).lng;
      m.set(t.id, P(lat, lng));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, proj]);

  const filled = new Map(result.territories.map((t) => [t.territory.id, t.filled]));
  const bubbles = useMemo(() => {
    const list: { key: string; x: number; y: number; open: number; total: number; label: string; city?: string }[] = [];
    if (cityFocus) {
      for (const t of ds.territories) {
        if (t.city !== cityFocus.name) continue;
        const pos = terrPos.get(t.id);
        if (!pos) continue;
        const f = filled.get(t.id) ?? 0;
        list.push({ key: t.id, x: pos[0], y: pos[1], open: Math.max(0, t.slots - f), total: t.slots, label: t.id });
      }
      return list;
    }
    const byCity = new Map<string, typeof ds.territories>();
    for (const t of ds.territories) byCity.set(t.city, [...(byCity.get(t.city) ?? []), t]);
    for (const [city, ts] of byCity) {
      const c = cityByName(city);
      if (!c) continue;
      const open = ts.reduce((s, t) => s + Math.max(0, t.slots - (filled.get(t.id) ?? 0)), 0);
      const total = ts.reduce((s, t) => s + t.slots, 0);
      const [x, y] = P(c.lat, c.lng);
      list.push({ key: city, x, y, open, total, label: ts.length > 1 ? `${ts.length} territories` : ts[0].id, city });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, result, proj]);
  const openByCity = new Map(bubbles.filter((b) => b.city).map((b) => [b.city as string, b]));

  const showCity = (name: string) => !cityFocus || cityFocus.name === name;
  const catch_ = (zoom ? 46 : 14) * (zoom ? 1 : u);
  const inBox = (x: number, y: number) => x > 20 && y > 20 && x < W - 20 && y < H - 20;
  const id = (s: string) => `${s}-${uid}`;
  const halo = { paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3, strokeLinejoin: 'round' } as const;
  const pillW = (t: string) => 30 + t.length * 7.2;

  const selectKey = (aid: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(aid);
    }
  };
  const nChanged = changed.length;

  return (
    <div ref={wrap} className="relative h-full w-full select-none overflow-hidden bg-[#E6ECF5]">
      <svg viewBox={inset ? `${W / 2 - 180} ${H / 2 - 180} 360 360` : `0 0 ${W} ${H}`} className="h-full w-full" role="group" aria-label={`Map of Karnataka franchise territories${cityFocus ? ', zoomed into ' + cityFocus.name : ''}. Pin positions are approximate.`}>
        <defs>
          <filter id={id('sh')} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#000" floodOpacity="0.28" />
          </filter>
        </defs>

        {/* land: one soft shape for the state, hairline district borders inside */}
        <g>
          {districts.map((d) => <path key={'o' + d.name} d={d.d} fill="#fff" stroke="#fff" strokeWidth={4} strokeLinejoin="round" />)}
          {districts.map((d) => <path key={'b' + d.name} d={d.d} fill="none" stroke="#E4E4E4" strokeWidth={zoom ? 1.2 : 0.8} strokeLinejoin="round" />)}
        </g>

        {!inset && !zoom &&
          districts.map((d) => (d.c && inBox(d.c[0], d.c[1]) ? (
            <text key={'t' + d.name} x={d.c[0]} y={d.c[1]} textAnchor="middle" fontSize={8.5 * u} fill="#B5B5B5" fontFamily="Figtree, sans-serif" fontWeight={500} style={halo}>{d.name}</text>
          ) : null))}

        {/* territories: the bubble is the area the territory covers */}
        {layers.territories &&
          bubbles.map((b) => {
            const r = (b.open > 0 ? 10 + 7 * Math.sqrt(b.open) * (zoom ? 2.1 : 1.4) : 7 * (zoom ? 2 : 1)) * (zoom ? 1.3 : 1) * (zoom ? 1 : Math.sqrt(u));
            const clickable = !!b.city && !!onFocus && ds.territories.filter((t) => t.city === b.city).length > 1;
            return (
              <g key={b.key} onClick={() => clickable && onFocus?.(b.city as string)} style={{ cursor: clickable ? 'zoom-in' : 'default' }}>
                <title>{`${b.label}: ${b.open} of ${b.total} slots open${clickable ? '. Click to zoom in.' : ''}`}</title>
                <circle cx={b.x} cy={b.y} r={r} fill={BRAND} fillOpacity={b.open > 0 ? 0.1 : 0.03} stroke={BRAND} strokeOpacity={0.6} strokeWidth={zoom ? 1.6 : 1.1} strokeDasharray={b.open > 0 ? undefined : '3 3'} />
                {!inset && zoom > 0 && (
                  <g transform={`translate(${b.x} ${b.y - r - 14})`}>
                    <rect x={-58} y={-12} width={116} height={24} rx={12} fill="#fff" filter={`url(#${id('sh')})`} />
                    <text textAnchor="middle" y={4.5} fontSize={12} fontWeight={600} fill={BRAND} fontFamily="Figtree, sans-serif">{b.label}, {b.open} of {b.total} open</text>
                  </g>
                )}
              </g>
            );
          })}

        {/* existing stores: a store badge at the centre of the area it covers */}
        {layers.stores &&
          ds.stores.filter((s) => showCity(s.city)).map((s) => {
            const pp = pinPosition(s.pin, s.city);
            if (!pp) return null;
            const [x, y] = P(pp.lat, pp.lng);
            const k = (zoom ? 1.6 : 1) * u * (inset ? 0.9 : 1);
            return (
              <g key={s.id}>
                <title>{`Existing store ${s.id}, pin ${s.pin}`}</title>
                <circle cx={x} cy={y} r={catch_} fill={INK} fillOpacity={0.04} stroke={INK} strokeOpacity={0.5} strokeWidth={zoom ? 1.4 : 1} strokeDasharray="4 3" />
                <circle cx={x} cy={y} r={10.5 * k} fill="#fff" filter={`url(#${id('sh')})`} />
                <g transform={`translate(${x - 7 * k} ${y - 7 * k}) scale(${(14 / 24) * k})`} fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 9l1.5-5h13L20 9M4 9v1a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 6 0 2.5 2.5 0 0 0 5 0V9M5 12.5V20h14v-7.5" />
                </g>
                {!inset && zoom > 0 && <text x={x + 16 * k} y={y + 4} fontSize={13} fontWeight={600} fill={MUTE} fontFamily="Figtree, sans-serif" style={halo}>{s.id}, pin {s.pin}</text>}
              </g>
            );
          })}

        {layers.rings &&
          ds.applications.filter((a) => result.decisions[a.id].outcome === 'Approved' && showCity(a.city ?? '')).map((a) => {
            const p = appPos.get(a.id);
            return p ? <circle key={'r' + a.id} cx={p[0]} cy={p[1]} r={catch_ * 0.55} fill="none" stroke={OUTCOME_COLOR.Approved} strokeWidth={1.6} strokeDasharray="3 3" /> : null;
          })}

        {layers.arcs &&
          ds.applications.map((a) => {
            const d = result.decisions[a.id];
            const from = appPos.get(a.id);
            if (!from) return null;
            let to: [number, number] | undefined;
            let color = '';
            let dash: string | undefined;
            if (d.outcome === 'Redirect' && d.redirect) {
              const pp = pinPosition(d.redirect.pin, a.city);
              if (pp) to = P(pp.lat, pp.lng);
              color = OUTCOME_COLOR.Redirect;
              dash = '5 4';
            } else if (d.outcome === 'Approved' && d.territoryId) {
              to = terrPos.get(d.territoryId);
              color = OUTCOME_COLOR.Approved;
            }
            if (!to || Math.hypot(to[0] - from[0], to[1] - from[1]) < 3) return null;
            const mx = (from[0] + to[0]) / 2;
            const my = (from[1] + to[1]) / 2 - Math.hypot(to[0] - from[0], to[1] - from[1]) * 0.25;
            return <path key={'a' + a.id} d={`M${from[0]} ${from[1]} Q${mx} ${my} ${to[0]} ${to[1]}`} fill="none" stroke={color} strokeWidth={2} strokeDasharray={dash} strokeLinecap="round" />;
          })}

        {/* city names with their open slots */}
        {!inset &&
          CITIES.filter((c) => showCity(c.name)).map((c) => {
            const [x, y] = P(c.lat, c.lng);
            if (!inBox(x, y)) return null;
            const b = openByCity.get(c.name);
            return (
              <g key={c.name} pointerEvents="none">
                <text x={zoom ? 36 : x} y={zoom ? 60 : y + 30 * u} textAnchor={zoom ? 'start' : 'middle'} fontSize={(zoom ? 28 : 11.5) * (zoom ? 1 : u)} fontWeight={700} fill={INK} fontFamily="Figtree, sans-serif" style={halo}>{c.name}</text>
                {!zoom && b && <text x={x} y={y + 30 * u + 12 * u} textAnchor="middle" fontSize={10 * u} fontWeight={500} fill={MUTE} fontFamily="Figtree, sans-serif" style={halo}>{b.open} of {b.total} open</text>}
              </g>
            );
          })}

        {/* applicants: a white badge carrying the outcome shape; the id shows once zoomed in, selected or changed */}
        {layers.applicants &&
          [...ds.applications].sort((a, b) => (a.id === selected ? 1 : 0) - (b.id === selected ? 1 : 0)).map((a) => {
            const p = appPos.get(a.id);
            if (!p) return null;
            if (cityFocus && a.city !== cityFocus.name) return null;
            const d = result.decisions[a.id];
            const c = OUTCOME_COLOR[d.outcome];
            const dim = visible && !visible.has(a.id);
            const isChanged = changed.includes(a.id);
            const isSel = selected === a.id;
            const was = prev?.decisions[a.id]?.outcome;
            const short = a.id.replace('APP-', '');
            const showId = !inset && (zoom > 0 || isSel || isChanged);
            const r = 12.5 * u;
            const w = showId ? pillW(short) * u * 0.9 : r * 2;
            const h = r * 2;
            return (
              <g key={a.id} opacity={dim ? 0.22 : 1} style={{ cursor: onSelect ? 'pointer' : 'default' }} onClick={() => onSelect?.(a.id)}
                role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} onKeyDown={onSelect ? selectKey(a.id) : undefined}
                aria-label={`${a.id}, ${a.name}: ${d.outcome}${isChanged ? ', changed' : ''}`}
                onMouseEnter={(e) => !inset && hv(a.id, e)} onMouseMove={(e) => !inset && hv(a.id, e)} onMouseLeave={() => setHover(null)}>
                <circle cx={p[0]} cy={p[1]} r={r + 8 * u} fill="transparent" />
                <circle cx={p[0]} cy={p[1]} r={catch_ * (zoom ? 0.9 : 0.8)} fill={c} fillOpacity={0.12} stroke={c} strokeOpacity={0.45} strokeWidth={1} />
                {isChanged && <circle cx={p[0]} cy={p[1]} r={r} fill="none" stroke={c} strokeWidth={3} className="pin-ring" />}
                {isChanged && <circle cx={p[0]} cy={p[1]} r={r} fill="none" stroke={c} strokeWidth={3} className="pin-ring" style={{ animationDelay: '0.5s' }} />}
                <g transform={isSel ? `translate(${p[0]} ${p[1]}) scale(1.12) translate(${-p[0]} ${-p[1]})` : undefined}>
                  <rect x={p[0] - r} y={p[1] - h / 2} width={w} height={h} rx={h / 2} fill={isSel ? BRAND : '#fff'} filter={`url(#${id('sh')})`} stroke={isChanged ? c : 'none'} strokeWidth={isChanged ? 2.5 : 0} />
                  {showId ? (
                    <>
                      <circle cx={p[0]} cy={p[1]} r={r - 3 * u} fill="#fff" />
                      <MarkShape o={d.outcome} x={p[0]} y={p[1]} size={14 * u} />
                      <text x={p[0] + r + 2 * u} y={p[1] + 4.5 * u} fontSize={12.5 * u} fontWeight={700} fill={isSel ? '#fff' : INK} fontFamily="Figtree, sans-serif">{short}</text>
                    </>
                  ) : (
                    <MarkShape o={d.outcome} x={p[0]} y={p[1]} size={15 * u} />
                  )}
                </g>
                {isChanged && was && was !== d.outcome && !inset && nChanged <= 4 && (
                  <g transform={`translate(${p[0]} ${p[1] + r + 18 * u})`} pointerEvents="none">
                    <rect x={-40 * u} y={-10 * u} width={80 * u} height={20 * u} rx={10 * u} fill="#fff" filter={`url(#${id('sh')})`} />
                    <MarkShape o={was} x={-28 * u} y={0} size={11 * u} />
                    <path d={`M${-31 * u} ${5 * u}L${-25 * u} ${-5 * u}`} stroke={INK} strokeWidth={1.5} />
                    <text x={-18 * u} y={4 * u} fontSize={10.5 * u} fontWeight={600} fill={INK} fontFamily="Figtree, sans-serif">was {was}</text>
                  </g>
                )}
              </g>
            );
          })}
      </svg>
      {hover && !inset && (() => {
        const a = ds.applications.find((x) => x.id === hover.id);
        const d = result.decisions[hover.id];
        if (!a || !d) return null;
        return (
          <div className="pointer-events-none absolute z-20 max-w-[250px] rounded-xl bg-white px-3 py-2 text-sm shadow-float" style={{ left: hover.x + 14, top: hover.y + 14 }}>
            <div className="font-semibold">{a.id}, {a.name}</div>
            <div className="font-medium">{d.outcome}, score {d.score}</div>
            <div className="mt-0.5 text-xs text-mute">{d.headline}</div>
            <div className="mt-0.5 text-xs text-mute">{a.city} {a.pinRaw}</div>
          </div>
        );
      })()}
    </div>
  );
}
