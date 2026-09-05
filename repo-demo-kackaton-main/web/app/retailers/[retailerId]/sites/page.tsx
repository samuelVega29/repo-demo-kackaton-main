'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PageShell from '@/components/layout/PageShell'
import { api } from '@/lib/api'
import { readRetailer } from '@/lib/navigation'

export default function SitesPage() {
  const { retailerId } = useParams()
  const router = useRouter()
  const retailer = readRetailer() || { id: retailerId, name: 'Retailer' }
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    city: '',
    camera_name: 'Cámara principal',
    floor_width: 12,
    floor_depth: 8,
  })

  useEffect(() => {
    api(`/api/retailers/${retailerId}/sites`)
      .then((items) =>
        setSites(
          items.map((item) => ({
            ...item,
            configuration: {
              ...(item.configuration || {}),
              floor: { ...(item.configuration?.floor || {}), outline: undefined },
            },
          })),
        ),
      )
      .catch((requestError) => setLoadError(requestError.message))
      .finally(() => setLoading(false))
  }, [retailerId])

  const submit = async (event) => {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      const created = await api(`/api/retailers/${retailerId}/sites`, {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setSites((current) => [...current, created])
      setShowCreate(false)
      router.push(`/spaces/${created.id}`)
    } catch (requestError) {
      setError(requestError.message)
    }
    setCreating(false)
  }

  return (
    <PageShell>
      <section className="flex flex-col gap-6">
        <button
          className="w-fit font-mono text-xs uppercase tracking-[0.15em] text-muted transition-colors hover:text-acid"
          onClick={() => router.push('/retailers')}
        >
          ← Retailers
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="eyebrow">02 · SEDES DE {String(retailer.name).toUpperCase()}</span>
            <h1 className="mt-2 text-2xl font-bold md:text-3xl">
              Elige el <em className="not-italic text-mint">espacio.</em>
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              La configuración crea el espacio. El video crea la inteligencia.
            </p>
          </div>
          <button
            onClick={() => setShowCreate((value) => !value)}
            className={`border px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] transition-colors ${
              showCreate ? 'border-ember text-ember' : 'border-acid text-acid hover:bg-acid hover:text-base'
            }`}
          >
            {showCreate ? 'Cancelar' : '＋ Nueva sede'}
          </button>
        </div>

        {showCreate && (
          <form
            className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6"
            onSubmit={submit}
          >
            <div>
              <span className="eyebrow">REGISTRAR ESPACIO</span>
              <h2 className="mt-1 text-base font-semibold">Nueva sede</h2>
              <p className="m-0 text-xs leading-5 text-muted">
                Comienza con un plano vacío. Después podrás dibujar todas sus góndolas.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-xs text-muted">
                Nombre de la sede
                <input
                  required
                  minLength={2}
                  placeholder="Ej. Sucursal Norte"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none transition focus:border-acid"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted">
                Ciudad
                <input
                  required
                  minLength={2}
                  placeholder="Ej. Medellín"
                  value={form.city}
                  onChange={(event) => setForm({ ...form, city: event.target.value })}
                  className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none transition focus:border-acid"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted">
                Nombre de cámara
                <input
                  required
                  minLength={2}
                  value={form.camera_name}
                  onChange={(event) => setForm({ ...form, camera_name: event.target.value })}
                  className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none transition focus:border-acid"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted">
                  Ancho del piso
                  <input
                    type="number"
                    min="2"
                    max="100"
                    step="0.5"
                    value={form.floor_width}
                    onChange={(event) => setForm({ ...form, floor_width: Number(event.target.value) })}
                    className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none transition focus:border-acid"
                  />
                  <small>metros</small>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted">
                  Fondo del piso
                  <input
                    type="number"
                    min="2"
                    max="100"
                    step="0.5"
                    value={form.floor_depth}
                    onChange={(event) => setForm({ ...form, floor_depth: Number(event.target.value) })}
                    className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none transition focus:border-acid"
                  />
                  <small>metros</small>
                </label>
              </div>
            </div>
            {error && (
              <p className="rounded-lg border border-ember/40 bg-ember/10 px-4 py-2 text-sm text-ember" role="alert">
                {error}
              </p>
            )}
            <button
              className="flex w-fit items-center gap-2 border border-acid px-5 py-2.5 text-sm font-semibold text-acid transition-colors hover:bg-acid hover:text-base disabled:cursor-not-allowed disabled:opacity-50"
              disabled={creating}
            >
              {creating ? 'Creando sede…' : 'Crear y configurar'}
              <b>→</b>
            </button>
          </form>
        )}

        {loading && <p className="text-sm text-muted">Cargando sedes…</p>}
        {loadError && (
          <p className="rounded-lg border border-ember/40 bg-ember/10 px-4 py-2 text-sm text-ember">
            {loadError}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => {
            const floor = site.configuration.floor || { width: 12, depth: 8 }
            const gondolas = site.configuration.gondolas || []
            return (
              <button
                className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5 text-left transition-colors hover:border-mint/50 hover:bg-panel2"
                key={site.id}
                onClick={() => router.push(`/spaces/${site.id}`)}
              >
                <div
                  className="relative overflow-hidden rounded-xl border border-line bg-panel2"
                  style={{ aspectRatio: `${floor.width}/${floor.depth}` }}
                >
                  {gondolas.map((gondola) => (
                    <i
                      key={gondola.id}
                      className="absolute block bg-mint/40"
                      style={{
                        left: `${(gondola.x / floor.width) * 100}%`,
                        top: `${(gondola.z / floor.depth) * 100}%`,
                        width: `${(gondola.width / floor.width) * 100}%`,
                      }}
                    />
                  ))}
                  <span className="absolute bottom-1 right-2 font-mono text-[9px] tracking-[0.15em] text-muted">
                    CAM 01
                  </span>
                </div>
                <div>
                  <span className="eyebrow">{site.city}</span>
                  <h3 className="mt-1 text-base font-semibold text-ink">{site.name}</h3>
                  <p className="m-0 text-xs text-muted">
                    {site.configuration.gondolas.length} góndolas ·{' '}
                    {site.configuration.zones.length} zonas ·{' '}
                    {site.configuration.camera.name}
                  </p>
                </div>
                <b className="mt-auto font-mono text-acid">Entrar →</b>
              </button>
            )
          })}
        </div>
      </section>
    </PageShell>
  )
}