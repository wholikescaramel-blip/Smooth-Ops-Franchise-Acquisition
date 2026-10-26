import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import './index.css';
import App from './App';

class Boundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (this.state.err)
      return (
        <div className="mx-auto max-w-xl p-8">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-mute">{this.state.err.message}</p>
          <p className="mt-2 text-mute">Reload the page and try again. If it keeps happening, upload the file again or use the sample data.</p>
          <button className="mt-4 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white" onClick={() => location.reload()}>Reload the page</button>
        </div>
      );
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </React.StrictMode>,
);
