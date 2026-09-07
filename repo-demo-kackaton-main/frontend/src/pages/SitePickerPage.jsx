import { ArrowLeft, ArrowRight, Building2, MapPin, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppProvider'

const siteImagePool = [
  'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=85',
]

function getSiteImage(site, index) {
  if (site.image_url) return site.image_url

  const source = `${site.name || ''} ${site.city || ''}`.toLowerCase()
  if (source.includes('olimp') || source.includes('centro')) return siteImagePool[0]
  if (source.includes('exito') || source.includes('éxito')) return siteImagePool[1]
  if (source.includes('carulla') || source.includes('premium')) return siteImagePool[2]
  return siteImagePool[index % siteImagePool.length]
}

export default function SitePickerPage() {
  const { retailers, retailer, sites, selectSite, createSite, deleteSite, goHome, setRetailer } = useApp()
  const { retailerId } = useParams()
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', city: '', camera_name: 'Camara principal', floor_width: 12, floor_depth: 8 })

  useEffect(() => {
    if (!retailer && retailerId && retailers.length) {
      const found = retailers.find((item) => item.id === Number(retailerId))
      if (found) setRetailer(found)
    }
  }, [retailer, retailerId, retailers, setRetailer])

  if (!retailer) return <Navigate to="/empresas" replace />

  const submit = async (event) => {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      await createSite(form)
      setShowCreate(false)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCreating(false)
    }
  }

  const removeSite = async (event, site) => {
    event.stopPropagation()
    if (!window.confirm(`Eliminar la sede ${site.name} con sus analisis?`)) return
    try {
      await deleteSite(site)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <section className="min-h-[calc(100vh-72px)] bg-[radial-gradient(circle_at_96%_10%,rgba(255,91,18,.10),transparent_25%),linear-gradient(135deg,rgba(255,255,255,.92),rgba(246,246,244,.96))] px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-[1180px] overflow-hidden rounded-[10px] border border-[#e5e7ee] bg-white/90 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)]">
        <div className="flex h-[30px] items-center gap-1.5 border-b border-[#e5e7ee] bg-white/70 px-3"><span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" /><span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" /><span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" /></div>
        <div className="relative min-h-[calc(100vh-128px)] bg-[radial-gradient(circle_at_92%_88%,rgba(255,91,18,.10),transparent_24%),#fff] p-5 sm:p-7 lg:p-8">
          <div className="relative z-10">
            <button className="mb-5 inline-flex items-center gap-2 border-0 bg-transparent text-sm font-black text-[#7d8392]" onClick={goHome} type="button">
              <ArrowLeft size={16} /> Empresas
            </button>

            <div className="mb-5 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 text-sm font-black text-[#ff5b12]"><span className="text-[clamp(44px,6vw,70px)] leading-[.85] opacity-25">04</span> Mis sedes</span>
                <h1 className="m-0 text-[clamp(28px,4vw,44px)] font-black leading-[.92] text-[#151323]">Mis sedes</h1>
                <p className="mt-2 text-sm leading-6 text-[#7d8392]">Todas las sedes de {retailer.name}, en un solo lugar.</p>
              </div>
              <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08]" onClick={() => setShowCreate((value) => !value)} type="button">
                <Plus size={16} /> {showCreate ? 'Cancelar' : 'Crear sede'}
              </button>
            </div>

            <div className="mb-5 flex max-w-[420px] items-center gap-2 rounded-md border border-[#e5e7ee] bg-white px-3 py-2">
              <Search size={16} className="text-[#7d8392]" />
              <input className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" placeholder="Buscar sede..." />
            </div>

            {showCreate && (
              <form className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] mb-5 grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={submit}>
                <label className="grid gap-2 text-xs font-black text-[#7d8392]">Nombre<input className="min-h-[42px] w-full rounded-md border border-[#e5e7ee] bg-white px-3 text-[#151323] outline-none focus:border-[#ff5b12] focus:ring-4 focus:ring-[#ff5b12]/10" required minLength="2" placeholder="Ej. Sede Centro" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
                <label className="grid gap-2 text-xs font-black text-[#7d8392]">Ciudad<input className="min-h-[42px] w-full rounded-md border border-[#e5e7ee] bg-white px-3 text-[#151323] outline-none focus:border-[#ff5b12] focus:ring-4 focus:ring-[#ff5b12]/10" required minLength="2" placeholder="Ciudad" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
                <label className="grid gap-2 text-xs font-black text-[#7d8392]">Camara<input className="min-h-[42px] w-full rounded-md border border-[#e5e7ee] bg-white px-3 text-[#151323] outline-none focus:border-[#ff5b12] focus:ring-4 focus:ring-[#ff5b12]/10" required minLength="2" value={form.camera_name} onChange={(event) => setForm({ ...form, camera_name: event.target.value })} /></label>
                <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08] self-end" disabled={creating} type="submit">{creating ? 'Creando...' : 'Crear sede'} <ArrowRight size={16} /></button>
                {error && <p className="text-sm font-bold text-[#b43b1d]" role="alert">{error}</p>}
              </form>
            )}

            <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
              {sites.map((site, index) => {
                const configuration = site.configuration ?? {}
                const gondolas = configuration.gondolas ?? []
                const zones = configuration.zones ?? []
                const camera = configuration.camera ?? {}

                return (
                  <button className="group [perspective:1200px]" key={site.id} onClick={() => selectSite(site)} type="button">
                    <div className="overflow-hidden rounded-lg border border-[#e5e7ee] bg-white text-left shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] transition duration-500 [transform-style:preserve-3d] group-hover:-translate-y-1 group-hover:[transform:rotateX(3deg)_rotateY(-4deg)] group-hover:border-[#ff5b12]">
                    <div className="relative h-40 overflow-hidden bg-gradient-to-br from-[#263043] via-[#4a5364] to-[#ff5b12]">
                      <img
                        src={getSiteImage(site, index)}
                        alt={`Interior de ${site.name}`}
                        className="absolute inset-0 h-full w-full object-cover opacity-90 transition duration-700 group-hover:scale-105"
                        onError={(event) => { event.currentTarget.style.display = 'none' }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#111522]/80 via-transparent to-[#111522]/10" />
                      <span className="absolute left-4 top-4 rounded-md bg-white px-3 py-2 text-sm font-black text-[#ff5b12]">{String(index + 1).padStart(2, '0')}</span>
                      <span
                        className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-md bg-white/90 text-[#b43b1d] opacity-0 transition hover:bg-[#fff1eb] group-hover:opacity-100"
                        onClick={(event) => removeSite(event, site)}
                        role="button"
                        tabIndex={0}
                        title="Eliminar sede"
                      >
                        <Trash2 size={16} />
                      </span>
                      <Building2 className="absolute bottom-4 right-4 text-white/75" size={58} strokeWidth={1.5} />
                    </div>
                    <div className="p-5">
                      <h2 className="text-xl font-black text-[#151323]">{site.name}</h2>
                      <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-[#7d8392]"><MapPin size={14} /> {site.city || 'Sin ciudad'}</p>
                      <p className="mt-3 text-xs font-bold text-[#7d8392]">{gondolas.length} gondolas · {zones.length} zonas{camera.name ? ` · ${camera.name}` : ''}</p>
                      <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#ff5b12]">Ver sede <ArrowRight size={16} /></span>
                    </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

