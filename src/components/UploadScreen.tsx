import { useRef, useState } from 'react';
import { sampleDataset } from '../data/sample';
import { parseWorkbook, type Outcome } from '../engine';
import { saveUpload } from '../state/persist';
import { loadDataset, setError, setSave, useStore } from '../state/store';
import { btn, btnPrimary, Icon, Mark, OUTCOME_COLOR } from './ui';

const MEANING: [Outcome, string][] = [
  ['Approved', 'Gets a store in the territory. Next steps and a training plan follow.'],
  ['Hold', 'Close, but one thing is missing, such as space or funds. The applicant can fix it.'],
  ['Waitlist', 'Qualified, but another applicant won the pin. First in line if it frees up.'],
  ['Redirect', 'Not this pin, but another open pin fits. The app names it.'],
  ['Decline', 'Cannot be fixed soon, for example the pin already has a store.'],
];

export function UploadScreen() {
  const error = useStore((s) => s.error);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const handle = async (file: File | undefined | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
        setError(`"${file.name}" is not an Excel file. Save it as .xlsx and drop it here again, or use the sample data.`);
        return;
      }
      const buf = await file.arrayBuffer();
      const res = parseWorkbook(buf);
      if (!res.dataset) setError(res.error ?? 'The file could not be read.');
      else {
        loadDataset(res.dataset, file.name);
        setSave({ status: 'saving', id: null });
        void saveUpload(res.dataset, file.name).then((id) => {
          setSave(id ? { status: 'saved', id } : { status: 'offline', id: null });
          if (id) history.replaceState(null, '', `?u=${id}`);
        });
      }
    } catch (e) {
      setError(`Could not read this file (${(e as Error).message}). Check that it opens in Excel, then try again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 pb-12 pt-6 sm:px-8">
      <p className="flex items-center gap-2 text-lg font-bold">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white"><Icon name="store" size={18} /></span>
        Franchise partner decisions
      </p>

      <div className="mx-auto mt-14 max-w-2xl text-center">
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">See who gets a franchise store, and why</h1>
        <p className="mx-auto mt-4 max-w-[52ch] text-lg text-mute">
          Upload an Excel file of applicants and territories. The app decides every applicant and plots them on a map of Karnataka. Then type a question or a new fact and watch the map change.
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files?.[0]); }}
        className={`mx-auto mt-10 w-full max-w-2xl rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${drag ? 'border-brand bg-tint' : 'border-line bg-white'}`}
      >
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-tint text-brand"><Icon name="upload" size={26} /></span>
        <p className="mt-4 text-xl font-semibold">{drag ? 'Release to read the file' : 'Drop an Excel file here'}</p>
        <p className="mx-auto mt-1 max-w-[46ch] text-mute">Sheet 1 lists applications and sheet 2 lists territories. Existing stores are already built in.</p>
        <input ref={input} type="file" accept=".xlsx,.xlsm,.xls" className="sr-only" aria-label="Choose an Excel file" onChange={(e) => { void handle(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={() => input.current?.click()} disabled={busy} className={btn + ' px-5 py-2.5'}>{busy ? 'Reading the file' : 'Choose a file from this computer'}</button>
          <button onClick={() => loadDataset(sampleDataset(), 'Sample data')} className={btnPrimary}>Use the sample data</button>
        </div>
        <a href="./sample-applications.xlsx" download className="mt-5 inline-block text-sm font-semibold text-brand underline underline-offset-4">Download the Excel template</a>
      </div>

      {error && (
        <div role="alert" className="mx-auto mt-4 w-full max-w-2xl rounded-xl border border-o-decline bg-white p-4 shadow-card">
          <p className="font-semibold">That file didn’t load.</p>
          <p>{error}</p>
          <p className="mt-1 text-sm text-mute">Try again with another file, or use the sample data.</p>
        </div>
      )}

      <section aria-labelledby="meaning" className="mt-16">
        <h2 id="meaning" className="text-2xl font-bold">What the five outcomes mean</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {MEANING.map(([o, text]) => (
            <li key={o} className="rounded-xl p-4" style={{ background: OUTCOME_COLOR[o] + '14' }}>
              <Mark o={o} size={32} />
              <p className="mt-3 font-semibold">{o}</p>
              <p className="mt-1 text-sm text-mute">{text}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
