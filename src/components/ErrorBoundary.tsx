import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Without this, a single render error blanks the window with no way back — and
 * in a desktop app there's no browser chrome to reload from either.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bg px-10 text-center">
        <h1 className="font-display text-[24px] text-ink">Something broke on this screen</h1>
        <p className="max-w-[480px] text-[13px] leading-relaxed text-ink-dim">
          Your work is saved — this is a display problem, not a data one. Go back to Projects, or reload if
          that doesn't help.
        </p>
        <pre className="max-w-[560px] overflow-x-auto rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-[11px] text-ink-faint">
          {error.message}
        </pre>
        <div className="flex gap-2">
          <button
            onClick={() => {
              this.setState({ error: null })
              window.location.hash = ''
              window.location.pathname = '/projects'
            }}
            className="rounded-lg bg-gold px-4 py-2 text-[13px] font-medium text-[#141316] transition hover:bg-gold-bright"
          >
            Back to Projects
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-ink-dim transition hover:border-ink-faint hover:text-ink"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
