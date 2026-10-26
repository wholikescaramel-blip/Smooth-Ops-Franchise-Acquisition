import { geoCentroid, geoMercator, geoPath } from 'd3-geo';
import { useId, useMemo, useRef, useState } from 'react';
import geo from '../data/karnataka.geo.json';
import { CITIES, cityByName, pinPosition } from '../data/cityGeo';
import type { Dataset, EngineResult, Outcome } from '../engine';
import type { Layers } from '../state/store';
import { OUTCOME_COLOR, OUTCOME_ICON_PATH, OUTCOME_TEXT, PRIORITY_TONE } from './ui';

const W = 800;
const H = 800;
const INK = '#222B45';
const STATE = geo as unknown as GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, { district: string }>;

interface Props {
  ds: Dataset;
  result: EngineResult;
  focus: string; // 'state' | city name
  selected: string | null;
  changed: string[];
  visible: Set<string> | null;
  layers: Layers;
  onSelect?: (id: string) => void;
  onFocus?: (city: string) => void;
  compact?: boolean;
  inset?: boolean;
}

/** Small icon glyph (12-unit box) drawn inside a pin, at the given centre. */
function Glyph({ o, cx, cy, r, active }: { o: Outcome; cx: number; cy: number; r: number; active: boolean }) {
  const s = (r * 2) / 12;
  const c = OUTCOME_COLOR[o];
  const g = o === 'Hold' ? INK : '#FFFFFF';
  return (
    <g transform={`translate(${cx - r} ${cy - r}) scale(${s})`}>
      <circle cx="6" cy="6" r="6" fill={c} stroke={active ? '#FFFFFF' : 'none'} strokeWidth="1" />
      {o === 'Waitlist' && <circle cx="6" cy="6" r="3.7" fill="none" stroke={g} strokeWidth="1.1" />}
      <path d={OUTCOME_ICON_PATH[o]} fill="none" stroke={g} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

export function GeoMap({ ds, result, focus, selected, changed, visible, layers, onSelect, onFocus, compact, inset }: Props) {
  const uid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const hv = (id: string, e: React.MouseEvent) => {
    const r = wrap.current?.getBoundingClientRect();
    if (r) setHover({ id, x: Math.max(0, Math.min(e.clientX - r.left, r.width - 250)), y: e.clientY - r.top });
  };
  const cityFocus = focus !== 'state' ? cityByName(focus) : null;
  const zoom = cityFocus ? 1 : 0;

  const proj = useMemo(() => {
    if (cityFocus) {
      const span = cityFocus.name === 'Bengaluru' ? 0.22 : 0.12;
      return geoMercator().center([cityFocus.lng, cityFocus.lat]).scale(W / ((span * Math.PI) / 180)).translate([W / 2, H / 2 + (compact || inset ? 0 : 110)]);
    }
    return geoMercator().fitExtent([[56, compact || inset ? 56 : 215], [W - 56, H - 56]], STATE);
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
      const ang = (i / Math.max(g.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const r = g.length > 1 ? (zoom ? 20 : 9) : 0;
      m.set(a.id, [x + r * Math.cos(ang), y + r * Math.sin(ang)]);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, proj]);

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
    const list: { key: string; x: number; y: number; open: number; total: number; priority: 'High' | 'Medium' | 'Low'; label: string; city?: string }[] = [];
    if (cityFocus) {
      for (const t of ds.territories) {
        if (t.city !== cityFocus.name) continue;
        const pos = terrPos.get(t.id);
        if (!pos) continue;
        list.push({ key: t.id, x: pos[0], y: pos[1], open: Math.max(0, t.slots - (filled.get(t.id) ?? 0)), total: t.slots, priority: t.priority, label: t.id });
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
      const pr = (['High', 'Medium', 'Low'] as const).find((p) => ts.some((t) => t.priority === p)) ?? 'Medium';
      const [x, y] = P(c.lat, c.lng);
      list.push({ key: city, x, y, open, total, priority: pr, label: ts.length > 1 ? `${ts.length} territories` : ts[0].id, city });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, result, proj]);

  const showCity = (name: string) => !cityFocus || cityFocus.name === name;
  const catch_ = zoom ? 46 : 12;
  const inBox = (x: number, y: number) => x > -30 && y > -30 && x < W + 30 && y < H + 30;
  const id = (s: string) => `${s}-${uid}`;

  // pin geometry
  const small = !zoom || inset;
  const ph = compact ? 12 : inset ? 38 : zoom ? 28 : 19; // pill height
  const fs = inset ? 18 : zoom ? 12.5 : 9.5;
  const labelOf = (appId: string) => (zoom && !inset ? appId : appId.replace('APP-', ''));
  const pinsOrder = ds.applications.filter((a) => appPos.has(a.id) && (!cityFocus || a.city === cityFocus.name)).sort((a, b) => Number(a.id === selected || a.id === hover?.id) - Number(b.id === selected || b.id === hover?.id));

  return (
    <div ref={wrap} className="relative h-full w-full select-none">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label={`Map of Karnataka franchise territories${cityFocus ? ', zoomed into ' + cityFocus.name : ''}. Positions are approximate.`}>
        <defs>
          <radialGradient id={id('heat')}>
            <stop offset="0%" stopColor={INK} stopOpacity="0.35" />
            <stop offset="100%" stopColor={INK} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="#EDEFF4" />

        {/* land: ink outline underneath, white fill above, hairline district borders on top */}
        {districts.map((d) => <path key={'o' + d.name} d={d.d} fill={INK} stroke={INK} strokeWidth={zoom ? 5 : 3.2} strokeLinejoin="round" />)}
        {districts.map((d) => <path key={'f' + d.name} d={d.d} fill="#FFFFFF" />)}
        {districts.map((d) => <path key={'b' + d.name} d={d.d} fill="none" stroke={INK} strokeOpacity={0.14} strokeWidth={zoom ? 1.2 : 0.7} strokeLinejoin="round" />)}

        {!compact && !inset && !zoom &&
          districts.map((d) => (d.c && inBox(d.c[0], d.c[1]) ? (
            <text key={'t' + d.name} x={d.c[0]} y={d.c[1]} textAnchor="middle" fontSize={9} fill={INK} opacity={0.38} fontWeight={500}>{d.name}</text>
          ) : null))}

        {!compact && !inset &&
          CITIES.filter((c) => showCity(c.name)).map((c) => {
            const [x, y] = P(c.lat, c.lng);
            if (!inBox(x, y)) return null;
            return (
              <text key={c.name} x={zoom ? 24 : x + 12} y={zoom ? 46 : y + 20} fontSize={zoom ? 26 : 12} fill={INK} fontWeight={700} stroke="#fff" strokeWidth={3} paintOrder="stroke">{c.name}</text>
            );
          })}

        {layers.heat && (
          <g>
            {ds.applications.map((a) => {
              const p = appPos.get(a.id);
              return p ? <circle key={a.id} cx={p[0]} cy={p[1]} r={zoom ? 70 : 34} fill={`url(#${id('heat')})`} /> : null;
            })}
          </g>
        )}

        {/* territories: ink-tinted discs, stronger tone = higher priority */}
        {layers.territories &&
          bubbles.map((b) => {
            const base = b.open > 0 ? 10 + 7 * Math.sqrt(b.open) * (zoom ? 2.1 : 1.4) : 7 * (zoom ? 2 : 1);
            const r = base * (zoom ? 1.3 : 1);
            const clickable = !!b.city && !!onFocus && ds.territories.filter((t) => t.city === b.city).length > 1;
            return (
              <g key={b.key} onClick={() => clickable && onFocus?.(b.city as string)} style={{ cursor: clickable ? 'zoom-in' : 'default' }}>
                <circle cx={b.x} cy={b.y} r={r} fill={INK} fillOpacity={b.open > 0 ? PRIORITY_TONE[b.priority] : 0.03} stroke={INK} strokeOpacity={0.55} strokeWidth={zoom ? 2 : 1.2} strokeDasharray={b.open > 0 ? undefined : '3 3'} style={{ transition: 'r 600ms ease' }} />
                {!compact && !inset && (
                  <text x={b.x} y={b.y - r - (zoom ? 8 : 4)} textAnchor="middle" fontSize={zoom ? 17 : 10} fill={INK} fontWeight={600} stroke="#fff" strokeWidth={3} paintOrder="stroke">
                    {b.label} · {b.open} open
                  </text>
                )}
              </g>
            );
          })}

        {/* existing stores */}
        {layers.stores &&
          ds.stores.filter((s) => showCity(s.city)).map((s) => {
            const pp = pinPosition(s.pin, s.city);
            if (!pp) return null;
            const [x, y] = P(pp.lat, pp.lng);
            const k = zoom ? 1.7 : 1;
            return (
              <g key={s.id}>
                <circle cx={x} cy={y} r={catch_} fill="none" stroke={INK} strokeOpacity={0.45} strokeWidth={zoom ? 2 : 1.2} />
                {layers.rings && <circle cx={x} cy={y} r={catch_ * 0.45} fill={INK} fillOpacity={0.06} stroke={INK} strokeOpacity={0.5} strokeDasharray="2 3" />}
                <path d={`M${x - 5 * k} ${y + 3.5 * k} v${-5.5 * k} l${5 * k} ${-4 * k} l${5 * k} ${4 * k} v${5.5 * k} z`} fill="#fff" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
                {!compact && !inset && zoom > 0 && <text x={x + 14} y={y + 34} fontSize={13} fill={INK} fontWeight={600} stroke="#fff" strokeWidth={3} paintOrder="stroke">{s.id} · {s.pin}</text>}
              </g>
            );
          })}

        {layers.rings &&
          ds.applications.filter((a) => result.decisions[a.id].outcome === 'Approved' && showCity(a.city ?? '')).map((a) => {
            const p = appPos.get(a.id);
            return p ? <circle key={'r' + a.id} cx={p[0]} cy={p[1]} r={catch_ * 0.45} fill="none" stroke={OUTCOME_COLOR.Approved} strokeOpacity={0.7} strokeDasharray="2 3" /> : null;
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
            return <path key={'a' + a.id} d={`M${from[0]} ${from[1]} Q${mx} ${my} ${to[0]} ${to[1]}`} fill="none" stroke={color} strokeOpacity={0.8} strokeWidth={1.6} strokeDasharray={dash} />;
          })}

        {/* applicants: white pills with a short label; navy when selected or hovered */}
        {layers.applicants &&
          pinsOrder.map((a) => {
            const p = appPos.get(a.id) as [number, number];
            const o = result.decisions[a.id].outcome;
            const active = a.id === selected || a.id === hover?.id;
            const dim = visible && !visible.has(a.id);
            const pulsing = changed.includes(a.id);
            const label = labelOf(a.id);
            const ir = (ph - 6) / 2;
            const tw = compact ? 0 : label.length * fs * 0.6;
            const w = compact ? ph : 4 + ir * 2 + 5 + tw + 9;
            return (
              <g key={a.id} transform={`translate(${p[0]} ${p[1]})`} opacity={dim ? 0.25 : 1} style={{ cursor: onSelect ? 'pointer' : 'default' }} onClick={() => onSelect?.(a.id)}
                onMouseEnter={(e) => !compact && hv(a.id, e)} onMouseMove={(e) => !compact && hv(a.id, e)} onMouseLeave={() => setHover(null)}
                role={onSelect ? 'button' : undefined} aria-label={`${a.id}, ${o}`}>
                {pulsing && <circle cx={compact ? 0 : -w / 2 + 3 + ir} cy={0} r={ir} fill="none" stroke={OUTCOME_COLOR[o]} strokeWidth={2.5} className="pulse-ring" />}
                <g style={{ filter: 'drop-shadow(0 1px 2.5px rgba(34,43,69,0.3))' }}>
                  <rect x={-w / 2} y={-ph / 2} width={w} height={ph} rx={ph / 2} fill={active ? INK : '#FFFFFF'} style={{ transition: 'fill 150ms' }} />
                </g>
                <Glyph o={o} cx={compact ? 0 : -w / 2 + 3 + ir} cy={0} r={compact ? ph / 2 - 1.5 : ir} active={active} />
                {!compact && (
                  <text x={-w / 2 + 3 + ir * 2 + 5} y={fs * 0.36} fontSize={fs} fontWeight={700} fill={active ? '#FFFFFF' : INK} fontFamily="JetBrains Mono, monospace">{label}</text>
                )}
              </g>
            );
          })}
        {small && false}
      </svg>
      {hover && !compact && (() => {
        const a = ds.applications.find((x) => x.id === hover.id);
        const d = result.decisions[hover.id];
        if (!a || !d) return null;
        return (
          <div className="pointer-events-none absolute z-20 max-w-[240px] rounded-lg bg-surface px-3 py-2 text-sm shadow-float-lg" style={{ left: hover.x + 14, top: hover.y + 14 }}>
            <div className="font-semibold text-ink">{a.id} · {a.name}</div>
            <div style={{ color: OUTCOME_TEXT[d.outcome] }} className="font-semibold">{d.outcome} · score {d.score}</div>
            <div className="mt-0.5 text-xs text-muted">{d.headline}</div>
          </div>
        );
      })()}
    </div>
  );
}
