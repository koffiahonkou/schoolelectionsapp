import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  declare props: Props;
  declare state: State;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Election Station Uncaught Error:', error, errorInfo);
  }

  private handleResetAll = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      if (window.indexedDB) {
        window.indexedDB.deleteDatabase('SchoolElectionsDB_v1');
      }
    } catch {
      // ignore
    }
    window.location.href = '/';
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-slate-800/90 border border-slate-700 rounded-3xl p-8 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h1 className="text-2xl font-black tracking-tight text-white mb-2">
              Election Station Notice
            </h1>
            <p className="text-sm text-slate-300 mb-6 leading-relaxed">
              The application encountered an initialization or display issue while loading stored election data.
            </p>

            {this.state.error && (
              <div className="p-3 mb-6 rounded-xl bg-slate-950/70 border border-slate-800 text-left overflow-auto max-h-32 text-xs text-rose-300 font-mono">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetAll}
                className="w-full py-3 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Reset Cached Data & Restore Defaults</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
