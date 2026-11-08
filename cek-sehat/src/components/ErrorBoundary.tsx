import { Component, type ReactNode } from 'react';

/** If a screen crashes, show a friendly message instead of a blank page. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card space-y-3 text-[15px]" role="alert">
        <p className="text-lg font-bold">Halaman ini mengalami gangguan</p>
        <p>Data Anda aman. Coba muat ulang aplikasi. Jika tetap terjadi, kirim tangkapan layar ini ke pengembang.</p>
        <p className="rounded-xl bg-slate-100 p-2 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {this.state.error.message}
        </p>
        <button className="btn-primary w-full" onClick={() => window.location.reload()}>
          Muat ulang
        </button>
      </div>
    );
  }
}
