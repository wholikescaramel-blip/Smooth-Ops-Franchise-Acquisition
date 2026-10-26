import { useRef, useState } from 'react';
import { sampleDataset } from '../data/sample';
import { parseWorkbook } from '../engine';
import { saveUpload } from '../state/persist';
import { loadDataset, setError, setSave, useStore } from '../state/store';

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
        setError(`"${file.name}" is not an Excel file. Please upload the .xlsx template (Applications + Territories sheets).`);
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
      setError(`Could not read this file (${(e as Error).message}).`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
      <div className="pointer-events-none absolute left-1/2 top-[-20%] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
      <div className="relative w-full max-w-2xl">
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-hair bg-surface px-3 py-1 text-[11px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-o-approved" /> Franchise Partner Engine · runs fully in your browser
          </div>
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl">
            From first application <span className="text-primary-strong">to open store</span>, decided and explained.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            Upload the applications and territories sheet. Every applicant gets a decision, a plain-language reason, the next steps, and a training plan, and the brand never opens two stores in the same pin code.
          </p>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files?.[0]); }}
          className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${drag ? 'border-primary bg-primary/5' : 'border-hair bg-surface'}`}
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-sunken text-xl text-primary-strong">⇪</div>
          <p className="font-display text-lg text-ink">Drop your .xlsx here</p>
          <p className="mt-1 text-xs text-muted">Sheet 1 Applications · Sheet 2 Territories · Sheet 3 Existing stores is built in</p>
          <input ref={input} type="file" accept=".xlsx,.xlsm,.xls" className="sr-only" aria-label="Choose an Excel file" onChange={(e) => { void handle(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => input.current?.click()} disabled={busy} className="rounded-xl border border-hair bg-sunken px-5 py-2.5 text-sm font-medium text-ink hover:border-ink/40">
              {busy ? 'Reading…' : 'Choose file'}
            </button>
            <button onClick={() => loadDataset(sampleDataset(), 'Sample data')} className="rounded-xl bg-primary-strong px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110">
              Work with sample data →
            </button>
          </div>
          <a href="./sample-applications.xlsx" download className="mt-4 inline-block text-xs text-muted underline hover:text-body">Download the sample as an .xlsx template</a>
        </div>

        {error && (
          <div role="alert" className="fade-in mt-4 rounded-xl border border-o-decline/50 bg-o-decline/10 p-4 text-sm text-ink">
            <b>That file didn’t load.</b> {error}
            <div className="mt-1 text-xs text-ink">Nothing was uploaded anywhere. You can try again, or use the sample data.</div>
          </div>
        )}
        <p className="mt-6 text-center text-[11px] text-muted">No login · no server · your file never leaves this browser tab</p>
      </div>
    </main>
  );
}
