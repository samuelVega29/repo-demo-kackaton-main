import { ArrowRight, Building2, Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../context/AppProvider'

export default function RetailersPage() {
  const { retailers, selectRetailer, createRetailer, deleteRetailer } = useApp()
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', code: '' })

  const submit = async (event) => {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      await createRetailer(form)
      setForm({ name: '', code: '' })
      setShowCreate(false)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCreating(false)
    }
  }

  const removeRetailer = async (event, item) => {
    event.stopPropagation()
    if (!window.confirm(`Eliminar ${item.name} con todas sus sedes y analisis?`)) return
    try {
      await deleteRetailer(item)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <section className="min-h-[calc(100vh-72px)] bg-[radial-gradient(circle_at_96%_10%,rgba(255,91,18,.10),transparent_25%),linear-gradient(135deg,rgba(255,255,255,.92),rgba(246,246,244,.96))] px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-[1180px] overflow-hidden rounded-[10px] border border-[#e5e7ee] bg-white/90 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)]">
        <div className="flex h-[30px] items-center gap-1.5 border-b border-[#e5e7ee] bg-white/70 px-3">
          <span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" /><span className="h-[7px] w-[7px] rounded-full bg-[#ffbd2e]" /><span className="h-[7px] w-[7px] rounded-full bg-[#28c840]" />
        </div>
        <div className="relative min-h-[calc(100vh-128px)] bg-[radial-gradient(circle_at_92%_88%,rgba(255,91,18,.10),transparent_24%),#fff] p-5 sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute bottom-0 right-0 h-[min(260px,35vw)] w-[min(260px,35vw)] rounded-br-[10px] border-b-8 border-r-8 border-[#ff5b12]/90" />
          <div className="relative z-10">
            <div className="mb-5 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 text-sm font-black text-[#ff5b12]"><span className="text-[clamp(44px,6vw,70px)] leading-[.85] opacity-25">02</span> Mis empresas</span>
                <h1 className="m-0 text-[clamp(28px,4vw,44px)] font-black leading-[.92] text-[#151323]">Mis empresas</h1>
                <p className="mt-2 text-sm leading-6 text-[#7d8392]">Gestiona todos los negocios registrados desde un solo lugar.</p>
              </div>
              <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white transition hover:-translate-y-px hover:bg-[#e94d08]" onClick={() => setShowCreate((value) => !value)} type="button">
                <Plus size={16} /> {showCreate ? 'Cancelar' : 'Crear empresa'}
              </button>
            </div>

            <div className="mb-5 flex max-w-[420px] items-center gap-2 rounded-md border border-[#e5e7ee] bg-white px-3 py-2">
              <Search size={16} className="text-[#7d8392]" />
              <input className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" placeholder="Buscar empresa..." />
            </div>

            {showCreate && (
              <form className="mb-5 grid gap-4 rounded-lg border border-[#e5e7ee] bg-white p-5 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] md:grid-cols-[1fr_1fr_auto]" onSubmit={submit}>
                <label className="grid gap-2 text-xs font-black text-[#7d8392]">Nombre<input className="min-h-[42px] w-full rounded-md border border-[#e5e7ee] bg-white px-3 text-[#151323] outline-none focus:border-[#ff5b12] focus:ring-4 focus:ring-[#ff5b12]/10" required minLength="2" maxLength="120" placeholder="Ej. Mercado Central" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
                <label className="grid gap-2 text-xs font-black text-[#7d8392]">Codigo<input className="min-h-[42px] w-full rounded-md border border-[#e5e7ee] bg-white px-3 text-[#151323] outline-none focus:border-[#ff5b12] focus:ring-4 focus:ring-[#ff5b12]/10" required minLength="2" maxLength="50" placeholder="Codigo unico" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label>
                <button className="inline-flex min-h-[42px] items-center justify-center gap-2 self-end rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white transition hover:-translate-y-px hover:bg-[#e94d08]" disabled={creating} type="submit">{creating ? 'Creando...' : 'Crear empresa'} <ArrowRight size={16} /></button>
                {error && <p className="text-sm font-bold text-[#b43b1d]" role="alert">{error}</p>}
              </form>
            )}

            <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
              {retailers.map((item, index) => (
                <button className="group overflow-hidden rounded-lg border border-[#e5e7ee] bg-white p-0 text-left shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] transition hover:-translate-y-1 hover:border-[#ff5b12]" key={item.id} onClick={() => selectRetailer(item)} type="button">
                  <div className="relative h-40 bg-gradient-to-br from-[#151323] via-[#34384a] to-[#ff5b12]">
                    <span className="absolute left-4 top-4 rounded-md bg-white px-3 py-2 text-sm font-black text-[#ff5b12]">{String(index + 1).padStart(2, '0')}</span>
                    <span
                      className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-md bg-white/90 text-[#b43b1d] opacity-0 transition hover:bg-[#fff1eb] group-hover:opacity-100"
                      onClick={(event) => removeRetailer(event, item)}
                      role="button"
                      tabIndex={0}
                      title="Eliminar empresa"
                    >
                      <Trash2 size={16} />
                    </span>
                    <Building2 className="absolute bottom-4 right-4 text-white/75" size={58} strokeWidth={1.5} />
                  </div>
                  <div className="p-5">
                    <h2 className="text-xl font-black text-[#151323]">{item.name}</h2>
                    <p className="mt-1 text-sm font-semibold text-[#7d8392]">{item.site_count ?? 0} sedes</p>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#ff5b12]">Ver sedes <ArrowRight size={16} /></span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
