import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/figtree';
import '@fontsource/jetbrains-mono/400.css';
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
        <div className="p-8 text-ink">
          <h1 className="font-display text-xl">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted">{this.state.err.message}</p>
          <button className="mt-4 rounded-full bg-primary-strong px-4 py-2 text-sm font-semibold text-white" onClick={() => location.reload()}>Reload</button>
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
