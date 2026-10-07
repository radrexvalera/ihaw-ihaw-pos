import { AlertTriangle, RotateCw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * Last line of defence: an unexpected crash shows a reload screen instead of a
 * blank page. Sales, the cart and the outbox live in storage, so reloading loses nothing.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="pt-safe pb-safe flex min-h-full flex-col items-center justify-center gap-5 bg-char p-6 text-center text-white">
        <AlertTriangle className="size-16 text-amber-400" />
        <h1 className="text-2xl font-extrabold">Something went wrong</h1>
        <p className="max-w-sm text-lg text-stone-300">
          Your sales and the current order are saved on this phone. Reload to continue.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="flex min-h-16 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-ember-600 text-xl font-extrabold uppercase active:bg-ember-700"
        >
          <RotateCw className="size-6" /> Reload
        </button>
        <p className="max-w-sm break-words text-xs text-stone-500">{this.state.error.message}</p>
      </div>
    )
  }
}
