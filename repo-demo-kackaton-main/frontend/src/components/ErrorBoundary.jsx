import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary capturó un error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <section className="grid min-h-screen place-items-center bg-[#f6f6f4] p-6">
          <div className="w-full max-w-lg rounded-lg border border-[#ffd2c2] bg-white p-6 shadow-sm">
            <span className="text-[10px] font-black uppercase tracking-[.17em] text-[#ff5b12]">Ocurrió un error</span>
            <h1 className="mt-2 text-xl font-black text-[#151323]">No se pudo mostrar la vista</h1>
            <p className="mt-2 text-sm text-[#7d8392]">Revisa la consola del navegador (F12) para ver el detalle del error.</p>
            <pre className="mt-4 max-h-64 overflow-auto rounded-md bg-[#f6f6f4] p-3 text-xs text-[#b43b1d]">
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <button
              className="mt-4 rounded-md bg-[#111827] px-4 py-2 text-[13px] font-black text-white"
              onClick={() => this.setState({ error: null })}
            >
              Reintentar
            </button>
          </div>
        </section>
      )
    }
    return this.props.children
  }
}
