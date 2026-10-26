import { useEffect, useMemo, useState } from 'react';
import { loadShared } from './state/persist';
import { ApplicantPanel } from './components/ApplicantPanel';
import { ChangesCard, ScenarioLog } from './components/ChangesPanel';
import { GeoMap } from './components/GeoMap';
import { LayersMenu } from './components/MapOverlays';
import { RulesGlance, RulesPanel } from './components/RulesPanel';
import { PinTiles } from './components/PinTiles';
import { QueryAnswer, QueryBar } from './components/QueryBar';
import { ApplicantList, DataQuality, OutcomeTabs, TerritoryCards } from './components/Tables';
import { UploadScreen } from './components/UploadScreen';
import { btn, btnPrimary, field, Icon, Modal } from './components/ui';
import { exportDecisions } from './components/exportXlsx';
import { CITIES, cityByName } from './data/cityGeo';
import { backToUpload, loadDataset, select, setError, setFocus, setSave, setView, useStore } from './state/store';

type ModalKey = 'rules' | 'territories' | 'quality' | 'log';

export default function App() {
  const phase = useStore((s) => s.phase);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('u');
    if (!id) return;
    void loadShared(id).then((r) => {
      if (r?.dataset) {
        loadDataset(r.dataset, r.fileName);
        setSave({ status: 'saved', id });
      } else setError('That shared link could not be loaded. It may have been removed, or cloud storage is offline. Upload the file again to continue.');
    });
  }, []);
  return phase === 'upload' ? <UploadScreen /> : <Dashboard />;
}

function Dashboard() {
  const ds = useStore((s) => s.ds);
  const result = useStore((s) => s.result);
  const prev = useStore((s) => s.prev);
  const diff = useStore((s) => s.diff);
  const baseResult = useStore((s) => s.baseResult);
  const overrides = useStore((s) => s.overrides);
  const selected = useStore((s) => s.selected);
  const changed = useStore((s) => s.changed);
  const filter = useStore((s) => s.filter);
  const view = useStore((s) => s.view);
  const focus = useStore((s) => s.focus);
  const layers = useStore((s) => s.layers);
  const fileName = useStore((s) => s.fileName);
  const logN = useStore((s) => s.log.length);
  const save = useStore((s) => s.save);
  const error = useStore((s) => s.error);
  const [modal, setModal] = useState<ModalKey | null>(null);
  const [showBefore, setShowBefore] = useState(false);

  // A new change always shows its "after" first.
  useEffect(() => setShowBefore(false), [diff]);
  useEffect(() => {
    if (!selected) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !modal && select(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [selected, modal]);

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

  const canCompare = !!diff && diff.changes.length > 0;
  const before = showBefore && canCompare;
  const mapResult = before ? prev ?? baseResult ?? result : result;
  const mapChanged = before ? [] : changed;
  const mapPrev = before ? null : prev;
  const flagCount = result.flagCount;
  const selectedCity = ds.applications.find((a) => a.id === selected)?.city;
  const zoomIn = () => setFocus(focus !== 'state' ? focus : cityByName(selectedCity) ? (selectedCity as string) : 'Bengaluru');

  return (
    <div className="min-h-screen">
      <header className="grid grid-cols-[minmax(0,1fr)] items-center gap-3 px-4 pb-3 pt-4 sm:px-8 lg:grid-cols-[1fr_auto_1fr]">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-lg font-bold">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white"><Icon name="store" size={18} /></span>
            <span className="truncate">Franchise partner decisions</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-mute">{fileName}: {ds.applications.length} applications, {ds.territories.length} territories, {ds.stores.length} existing stores</p>
        </div>
        <QueryBar />
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {save.status !== 'idle' && (
            <button disabled={!save.id} onClick={() => save.id && void navigator.clipboard?.writeText(location.origin + location.pathname + '?u=' + save.id)} title={save.id ? 'Copy a link that reopens this upload' : undefined} className={btn}>
              {save.status === 'saving' ? 'Saving a copy' : save.status === 'saved' ? 'Copy link to this file' : 'Not saved online'}
            </button>
          )}
          <button onClick={() => exportDecisions(ds, result, overrides)} className={btnPrimary}><Icon name="download" size={16} />Download decisions</button>
          <button onClick={backToUpload} className={btn}>Upload another file</button>
        </div>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line px-4 sm:px-8">
        <OutcomeTabs />
        <div className="flex flex-wrap gap-2 pb-2">
          <button onClick={() => setModal('rules')} className={btn + ' py-1.5'}>Rules</button>
          <button onClick={() => setModal('territories')} className={btn + ' py-1.5'}>Territories</button>
          <button onClick={() => setModal('quality')} className={btn + ' py-1.5'}>Data problems{flagCount ? ` (${flagCount})` : ''}</button>
          <button onClick={() => setModal('log')} className={btn + ' py-1.5'}>Change log{logN ? ` (${logN})` : ''}</button>
        </div>
      </div>

      {result.invariantViolations.length > 0 && (
        <div role="alert" className="mx-4 mt-4 rounded-xl border border-o-decline bg-white p-3 sm:mx-8">The engine broke one of its own rules: {result.invariantViolations.join('; ')}. Treat these results with care.</div>
      )}
      {error && <div role="alert" className="mx-4 mt-4 rounded-xl border border-o-decline bg-white p-3 sm:mx-8">{error}</div>}

      <div className="px-4 pt-4 sm:px-8 lg:hidden"><QueryAnswer /></div>

      <main className="grid grid-cols-[minmax(0,1fr)] gap-6 px-4 pb-12 pt-4 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* the map comes first on small screens */}
        <section aria-label="Map of Karnataka" className="relative order-first h-[68vh] min-h-[420px] overflow-hidden rounded-xl shadow-card lg:sticky lg:top-3 lg:order-last lg:h-[calc(100vh-170px)]">
          {view === 'map' ? (
            <GeoMap ds={ds} result={mapResult} prev={mapPrev} focus={focus} selected={selected} changed={mapChanged} visible={visible} layers={layers} onSelect={select} onFocus={setFocus} />
          ) : (
            <PinTiles ds={ds} result={mapResult} selected={selected} onSelect={select} focus={focus} />
          )}

          {/* controls float on the map, as on a listings map */}
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2">
            <div className="pointer-events-auto flex flex-col items-start gap-2">
              {canCompare && (
                <div role="group" aria-label="Compare the map before and after the last change" className="flex rounded-full bg-white p-1 shadow-float">
                  {[['Before', true], ['After', false]].map(([label, b]) => (
                    <button key={label as string} onClick={() => setShowBefore(b as boolean)} aria-pressed={showBefore === b} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${showBefore === b ? 'bg-brand text-white' : 'hover:bg-tint'}`}>{label as string}</button>
                  ))}
                </div>
              )}
              {before && <p className="rounded-full bg-white px-3 py-1 text-xs font-semibold shadow-float">Showing the map before the last change</p>}
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              <label className="sr-only" htmlFor="zoom-city">Zoom to</label>
              <select id="zoom-city" value={focus} onChange={(e) => setFocus(e.target.value)} className="h-10 rounded-full bg-white px-4 text-sm font-semibold shadow-float hover:bg-wash">
                <option value="state">All of Karnataka</option>
                {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <LayersMenu layers={layers} view={view} setView={setView} />
            </div>
          </div>

          {view === 'map' && (
            <div className="absolute right-3 top-[68px] z-10 flex flex-col overflow-hidden rounded-full bg-white shadow-float">
              <button onClick={zoomIn} aria-label="Zoom in" className="flex h-10 w-10 items-center justify-center hover:bg-wash"><Icon name="plus" size={18} /></button>
              <button onClick={() => setFocus('state')} aria-label="Zoom out to all of Karnataka" className="flex h-10 w-10 items-center justify-center border-t border-line hover:bg-wash"><Icon name="minus" size={18} /></button>
            </div>
          )}

          {view === 'map' && focus === 'state' && (
            <figure className="absolute right-3 top-[220px] z-10 aspect-square w-[20%] min-w-[130px] max-w-[220px] overflow-hidden rounded-xl bg-white shadow-float">
              <GeoMap ds={ds} result={mapResult} prev={mapPrev} focus="Bengaluru" selected={selected} changed={mapChanged} visible={visible} layers={layers} onSelect={select} inset />
              <figcaption className="absolute left-2 top-2 rounded-full bg-white px-2 py-0.5 text-xs font-semibold shadow-card">Bengaluru, enlarged</figcaption>
            </figure>
          )}

          <p className="absolute bottom-3 left-3 z-10 max-w-[55%] rounded-full bg-white px-3 py-1.5 text-xs font-medium shadow-float">Map positions are approximate, not surveyed</p>
        </section>

        <div className="order-last space-y-5 lg:order-first">
          <div className="hidden lg:block"><QueryAnswer /></div>
          <ChangesCard />
          <RulesGlance onMore={() => setModal('rules')} />
          <div>
            <label htmlFor="open-app" className="mb-1 block text-sm font-semibold">Open an applicant’s decision</label>
            <select id="open-app" value={selected ?? ''} onChange={(e) => select(e.target.value || null)} className={field + ' w-full'}>
              <option value="">Choose an applicant</option>
              {ds.applications.map((x) => <option key={x.id} value={x.id}>{x.id}, {x.name}, {result.decisions[x.id].outcome}</option>)}
            </select>
          </div>
          <ApplicantList />
        </div>
      </main>

      {/* decision drawer: opens from a pin, a card, the dropdown or a question */}
      {selected && (
        <aside aria-label="Applicant decision" className="sheet-in fixed inset-y-0 left-0 z-40 w-full overflow-auto bg-white p-5 shadow-pop sm:w-[500px] sm:rounded-r-xl">
          <ApplicantPanel onClose={() => select(null)} />
        </aside>
      )}

      {modal && (
        <Modal onClose={() => setModal(null)} wide title={modal === 'rules' ? 'The rules the engine uses' : modal === 'territories' ? 'Territories' : modal === 'quality' ? 'Data problems' : 'Change log'}>
          {modal === 'rules' && <RulesPanel />}
          {modal === 'territories' && <TerritoryCards />}
          {modal === 'quality' && <DataQuality />}
          {modal === 'log' && <ScenarioLog />}
        </Modal>
      )}
    </div>
  );
}
