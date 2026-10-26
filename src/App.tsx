import { useEffect, useMemo, useState } from 'react';
import { ApplicantPanel } from './components/ApplicantPanel';
import { ChangesPanel, ScenarioLog } from './components/ChangesPanel';
import { GeoMap } from './components/GeoMap';
import { FilterChips, LayerMenu, StatsCard } from './components/MapOverlays';
import { PinTiles } from './components/PinTiles';
import { AnswerCard, ExampleChips, QueryPill } from './components/QueryBar';
import { RulesPanel } from './components/RulesPanel';
import { ApplicantTable, DataQuality, TerritoryCards } from './components/Tables';
import { UploadScreen } from './components/UploadScreen';
import { exportDecisions } from './components/exportXlsx';
import { CITIES } from './data/cityGeo';
import { loadShared } from './state/persist';
import { backToUpload, loadDataset, select, setError, setFocus, setPanel, setSave, setTab, setView, useStore, type Tab } from './state/store';

const TABS: { k: Tab; label: string }[] = [
  { k: 'detail', label: 'Applicant' },
  { k: 'changes', label: 'What changed' },
  { k: 'territories', label: 'Territories' },
  { k: 'quality', label: 'Data quality' },
  { k: 'log', label: 'Log' },
  { k: 'rules', label: 'Rules' },
];

export default function App() {
  const phase = useStore((s) => s.phase);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('u');
    if (!id) return;
    void loadShared(id).then((r) => {
      if (r?.dataset) {
        loadDataset(r.dataset, r.fileName);
        setSave({ status: 'saved', id });
      } else setError('That shared link could not be loaded (it may have been removed, or storage is offline). You can upload the file again.');
    });
  }, []);
  return phase === 'upload' ? <UploadScreen /> : <Dashboard />;
}

const pillBtn = 'inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-medium text-ink shadow-float transition hover:bg-sunken';

function Dashboard() {
  const ds = useStore((s) => s.ds);
  const result = useStore((s) => s.result);
  const overrides = useStore((s) => s.overrides);
  const selected = useStore((s) => s.selected);
  const changed = useStore((s) => s.changed);
  const filter = useStore((s) => s.filter);
  const tab = useStore((s) => s.tab);
  const view = useStore((s) => s.view);
  const focus = useStore((s) => s.focus);
  const layers = useStore((s) => s.layers);
  const fileName = useStore((s) => s.fileName);
  const logN = useStore((s) => s.log.length);
  const save = useStore((s) => s.save);
  const open = useStore((s) => s.panelOpen);
  const answer = useStore((s) => s.answer);
  const [list, setList] = useState(false);

  const visible = useMemo(() => {
    if (!filter.outcome && !filter.city && !filter.territory) return null;
    return new Set(
      ds.applications
        .filter((a) => {
          const d = result.decisions[a.id];
          return (!filter.outcome || d.outcome === filter.outcome) && (!filter.city || a.city === filter.city) && (!filter.territory || d.territoryId === filter.territory || d.redirect?.territoryId === filter.territory);
        })
        .map((a) => a.id),
    );
  }, [ds, result, filter]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-page">
      {/* the map is the hero: it never moves for panels */}
      <div className="absolute inset-0">
        {view === 'map' ? (
          <GeoMap ds={ds} result={result} focus={focus} selected={selected} changed={changed} visible={visible} layers={layers} onSelect={select} onFocus={setFocus} />
        ) : (
          <div className="h-full overflow-auto bg-page pt-[270px] sm:pt-[250px]">
            <PinTiles ds={ds} result={result} selected={selected} onSelect={select} focus={focus} />
          </div>
        )}
      </div>

      {/* floating top stack */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 px-3 pt-3 transition-[padding] duration-200 ${open ? 'lg:pr-[468px]' : ''}`}>
        <div className="pointer-events-auto flex w-full max-w-5xl flex-wrap items-center gap-2 md:flex-nowrap">
          <div className="flex items-center gap-2 rounded-full bg-surface py-1.5 pl-2 pr-4 shadow-float">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink"><span className="h-3 w-3 rounded-full border-[3px] border-white" /></span>
            <span className="hidden text-sm font-semibold text-ink sm:block">Franchise partners</span>
          </div>
          <div className="order-last w-full md:order-none md:max-w-2xl md:flex-1"><QueryPill /></div>
          <div className="ml-auto flex items-center gap-2">
            {save.status !== 'idle' && (
              <button
                disabled={!save.id}
                onClick={() => save.id && void navigator.clipboard?.writeText(location.origin + location.pathname + '?u=' + save.id)}
                title={save.id ? 'Copy a link that reopens this upload' : undefined}
                className="hidden rounded-full bg-surface px-3 py-2 text-xs text-muted shadow-float lg:block"
              >
                {save.status === 'saving' ? 'Saving to cloud…' : save.status === 'saved' ? 'Saved · copy link' : 'Working offline'}
              </button>
            )}
            <button onClick={() => exportDecisions(ds, result, overrides)} className="rounded-full bg-primary-strong px-4 py-2 text-sm font-semibold text-white shadow-float transition hover:brightness-95">Export</button>
            <button onClick={backToUpload} className={`${pillBtn} hidden sm:inline-flex`}>New file</button>
          </div>
        </div>

        <div className="pointer-events-auto w-full max-w-3xl"><FilterChips result={result} filter={filter} /></div>

        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
          <div className="inline-flex overflow-hidden rounded-full bg-surface p-0.5 text-sm shadow-float" role="group" aria-label="Map view">
            {(['map', 'tiles'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`rounded-full px-3.5 py-1.5 font-medium ${view === v ? 'bg-ink text-white' : 'text-ink hover:bg-sunken'}`}>{v === 'map' ? 'Map' : 'Pin tiles'}</button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 rounded-full bg-surface py-1 pl-4 pr-1.5 text-sm text-muted shadow-float">
            Zoom
            <select value={focus} onChange={(e) => setFocus(e.target.value)} className="rounded-full bg-sunken px-3 py-1.5 text-sm font-medium text-ink">
              <option value="state">Karnataka</option>
              {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>
          <LayerMenu layers={layers} />
          <button onClick={() => setList(true)} className={pillBtn}>Applicants ({ds.applications.length})</button>
          <button onClick={() => setPanel(!open)} aria-expanded={open} className={pillBtn}>{open ? 'Hide details' : 'Details'}</button>
        </div>

        <div className="pointer-events-auto w-full max-w-2xl space-y-2">
          {answer ? <AnswerCard /> : <ExampleChips />}
        </div>
      </div>

      {/* bottom left: Bengaluru inset, bottom right: outcome mix */}
      {view === 'map' && focus === 'state' && (
        <div className="absolute bottom-10 left-3 z-10 hidden h-[34vmin] w-[34vmin] min-h-[170px] min-w-[170px] overflow-hidden rounded-lg bg-surface shadow-float-lg sm:block">
          <div className="absolute left-2.5 top-2 z-10 rounded-full bg-surface/90 px-2 py-0.5 text-xs font-semibold text-ink">Bengaluru close-up</div>
          <GeoMap ds={ds} result={result} focus="Bengaluru" selected={selected} changed={changed} visible={visible} layers={layers} onSelect={select} inset />
        </div>
      )}
      {!open && (
        <div className="absolute bottom-10 right-3 z-10">
          <StatsCard ds={ds} result={result} />
        </div>
      )}
      <p className="pointer-events-none absolute inset-x-0 bottom-2 z-10 px-3 text-center text-xs text-muted">
        Map positions are approximate (placed around real city centres). Spacing checks use pin-number closeness within a city as a proxy, not real distance.
      </p>

      {/* slide-in detail panel */}
      {open && (
        <aside className="slide-in absolute z-30 flex flex-col overflow-hidden bg-surface shadow-float-lg max-sm:inset-x-0 max-sm:bottom-0 max-sm:h-[80dvh] max-sm:rounded-t-2xl sm:bottom-3 sm:right-3 sm:top-3 sm:w-[440px] sm:rounded-lg" aria-label="Details">
          <div className="flex items-center gap-2 border-b border-hair px-3 py-2.5">
            <div className="flex flex-1 gap-1 overflow-x-auto" role="tablist">
              {TABS.map((t) => (
                <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${tab === t.k ? 'bg-ink text-white' : 'text-body hover:bg-sunken'}`}>
                  {t.label}{t.k === 'log' && logN ? ` (${logN})` : ''}{t.k === 'changes' && changed.length ? ` · ${changed.length}` : ''}
                </button>
              ))}
            </div>
            <button onClick={() => setPanel(false)} aria-label="Close details" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink hover:bg-sunken">
              <svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" /></svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-page p-4">
            {tab === 'detail' && <ApplicantPanel />}
            {tab === 'changes' && <ChangesPanel />}
            {tab === 'territories' && <TerritoryCards />}
            {tab === 'quality' && <DataQuality />}
            {tab === 'log' && <ScenarioLog />}
            {tab === 'rules' && <RulesPanel />}
          </div>
        </aside>
      )}

      {/* applicants list as a bottom sheet */}
      {list && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-ink/20" onClick={() => setList(false)}>
          <div className="sheet-in max-h-[80dvh] w-full max-w-5xl overflow-auto rounded-t-2xl bg-page p-4 shadow-float-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Applicants">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Applicants</h2>
              <button onClick={() => setList(false)} className={pillBtn}>Close</button>
            </div>
            <ApplicantTable onPick={() => setList(false)} />
          </div>
        </div>
      )}
      <span className="sr-only">{fileName}</span>
    </div>
  );
}
