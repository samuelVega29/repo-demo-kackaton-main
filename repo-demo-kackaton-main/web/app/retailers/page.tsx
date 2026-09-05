'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageShell from '@/components/layout/PageShell'
import { api } from '@/lib/api'
import { stashRetailer } from '@/lib/navigation'

export default function RetailersPage() {
  const router = useRouter()
  const [retailers, setRetailers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', code: '' })

  useEffect(() => {
    api('/api/retailers')
      .then(setRetailers)
      .catch((requestError) => setLoadError(requestError.message))
      .finally(() => setLoading(false))
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      const created = await api('/api/retailers', { method: 'POST', body: JSON.stringify(form) })
      setRetailers((current) => [created, ...current])
      setForm({ name: '', code: '' })
      setShowCreate(false)
      stashRetailer(created)
      router.push(`/retailers/${created.id}/sites`)
    } catch (requestError) {
      setError(requestError.message)
    }
    setCreating(false)
  }

  return (
    <PageShell>
      <section className="flex flex-col gap-6">
        <div>
          <span className="eyebrow">01 · ORGANIZACIÓN</span>
          <h1 className="mt-2 text-2xl font-bold md:text-3xl">
            Selecciona un <em className="not-italic text-mint">retailer.</em>
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Cada retailer mantiene aisladas sus sedes, configuraciones espaciales y análisis.
          </p>
        </div>

        {loading && <p className="text-sm text-muted">Cargando retailers…</p>}
        {loadError && (
          <p className="rounded-lg border border-ember/40 bg-ember/10 px-4 py-2 text-sm text-ember">
            {loadError}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {retailers.map((item, index) => (
            <button
              className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5 text-left transition-colors hover:border-mint/50 hover:bg-panel2"
              key={item.id}
              onClick={() => {
                stashRetailer(item)
                router.push(`/retailers/${item.id}/sites`)
              }}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                R/{String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="text-base font-semibold text-ink">{item.name}</h3>
                <p className="m-0 text-xs text-muted">
                  {item.site_count} sede{item.site_count === 1 ? '' : 's'} configurada
                  {item.site_count === 1 ? '' : 's'}
                </p>
              </div>
              <b className="mt-auto font-mono text-acid">→</b>
            </button>
          ))}
          <button
            className="flex flex-col gap-3 rounded-2xl border border-dashed border-mint/40 bg-transparent p-5 text-left transition-colors hover:border-mint/70"
            onClick={() => setShowCreate((value) => !value)}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">+</span>
            <div>
              <h3 className="text-base font-semibold text-ink">
                {showCreate ? 'Cancelar' : 'Crear empresa'}
              </h3>
              <p className="m-0 text-xs text-muted">
                {showCreate ? 'Cerrar formulario' : 'Registrar nuevo retailer'}
              </p>
            </div>
            <b className="mt-auto font-mono text-muted">→</b>
          </button>
        </div>

        {showCreate && (
          <form
            className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6"
            onSubmit={submit}
          >
            <div>
              <span className="eyebrow">NUEVO RETAILER</span>
              <h2 className="mt-1 text-base font-semibold">Crear empresa</h2>
              <p className="m-0 text-xs leading-5 text-muted">
                Completá el nombre y un código único (ej. <code className="text-mint">MAY-001</code>
                ). Después elegís la empresa y creás sedes.
              </p>
            </div>
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              Nombre
              <input
                required
                minLength={2}
                maxLength={120}
                placeholder="Ej. Mi Empresa"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none transition focus:border-acid"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              Código único
              <input
                required
                minLength={2}
                maxLength={50}
                placeholder="Ej. MAY-001"
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
                className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none transition focus:border-acid"
              />
              <small className="text-[11px] text-muted">Código corto, sin espacios.</small>
            </label>
            {error && (
              <p className="rounded-lg border border-ember/40 bg-ember/10 px-4 py-2 text-sm text-ember" role="alert">
                {error}
              </p>
            )}
            <button
              className="flex w-fit items-center gap-2 border border-acid px-5 py-2.5 text-sm font-semibold text-acid transition-colors hover:bg-acid hover:text-base disabled:cursor-not-allowed disabled:opacity-50"
              disabled={creating}
            >
              {creating ? 'Creando…' : 'Crear empresa'}
              <b>→</b>
            </button>
          </form>
        )}
      </section>
    </PageShell>
  )
}