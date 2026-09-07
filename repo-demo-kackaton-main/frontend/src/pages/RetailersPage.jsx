import { ArrowRight, BarChart3, Building2, Grid2X2, List, MapPin, MoreHorizontal, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import flujoPuntos from '../assets/images/flujo_puntos.png'
import gondolas from '../assets/images/gondolas.png'
import documentIcon from '../assets/images/icono_documento_3d.png'
import pieIcon from '../assets/images/icono_pastel_3d.png'
import locationIcon from '../assets/images/icono_ubicacion_3d.png'
import vendedorRobot from '../assets/images/vendedor_robot.png'
import { useApp } from '../context/AppProvider'

const supermarketImages = [
  'https://pbs.twimg.com/media/FE_fYS9WYAgve_k?format=jpg&name=large',
  'https://img.resized.co/esmmagazine/eyJkYXRhIjoie1widXJsXCI6XCJodHRwczpcXFwvXFxcL21lZGlhLm1hZGlzb25wdWJsaWNhdGlvbnMuZXVcXFwvZXNtbWFnYXppbmUtcHJvZFxcXC91cGxvYWRzXFxcLzIwMjNcXFwvMDlcXFwvMjcxMTA5NTlcXFwvYXJhX2ZhY2hhZGFfcmV0b2NhZGFfdjItMTAyNHg3NjguanBnXCIsXCJ3aWR0aFwiOjkwMCxcImhlaWdodFwiOjYwMCxcImRlZmF1bHRcIjpcImh0dHBzOlxcXC9cXFwvaW1nLnJlc2l6ZWQuY29cXFwvbm8taW1hZ2UucG5nXCIsXCJvcHRpb25zXCI6e1wib3V0cHV0XCI6XCJhdmlmXCIsXCJxdWFsaXR5XCI6NTV9fSIsImhhc2giOiJiODFlYjVmZjRlZGJkZTUwMmE3NjRkNGMxODU3ZWIzOWExNzFiNzAyIn0=/jer-oacute-nimo-martins-announces-expansion-plan-for-ara-in-colombia.jpg',
  'https://media.licdn.com/dms/image/v2/D4E22AQGpY3MdFxrK_w/feedshare-image-high-res/feedshare-image-high-res/0/1719362056439?e=1790208000&v=beta&t=BSCvb8WqbpH6ixqKjI_avGcImORSApgkFv6dmE-8fDg',
  'https://tteasygoo.com/images/supermarket.png',
]

function getSupermarketImage(index) {
  return supermarketImages[index % supermarketImages.length]
}

function getSector(item) {
  return item.sector || item.category || item.industry || item.code || 'Empresa'
}

function getStatus(item) {
  if (item.status === 'paused') return { label: 'Pausada', value: 'pausada', className: 'bg-[#fff3df] text-[#f28b13]' }
  if (item.status === 'setup') return { label: 'En analisis', value: 'configuracion', className: 'bg-[#e8f2ff] text-[#1677ff]' }
  return { label: 'Activa', value: 'activa', className: 'bg-[#e5f8ef] text-[#12a15d]' }
}

function getPerformance(item) {
  return item.performance ?? item.score ?? item.compliance_score ?? null
}

function formatPerformance(value) {
  if (value === null || value === undefined || value === '') return '--'
  return Number.isFinite(Number(value)) ? `${Number(value)}%` : value
}

export default function RetailersPage() {
  const { retailers, selectRetailer, createRetailer } = useApp()
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [form, setForm] = useState({ name: '', code: '' })

  const filteredRetailers = useMemo(() => retailers.filter((item) => {
    const status = getStatus(item).value
    const searchable = `${item.name || ''} ${item.code || ''} ${getSector(item)}`.toLowerCase()
    const matchesQuery = searchable.includes(query.trim().toLowerCase())
    const matchesStatus = statusFilter === 'all' || status === statusFilter
    return matchesQuery && matchesStatus
  }), [query, retailers, statusFilter])

  const featuredRetailers = filteredRetailers

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

  return (
    <section className=" bg-[linear-gradient(135deg,#f7fbff_0%,#eef6ff_48%,#ffffff_100%)]  ">
      <div className="mx-auto ">
        <div className="relative isolate overflow-hidden bg-[#202021] px-4 pb-8 pt-5 text-white shadow-[0_22px_60px_-44px_rgba(18,22,33,.75)] sm:px-8 lg:h-[500px] lg:px-0 lg:py-0">
          <img src={flujoPuntos} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40 mix-blend-screen" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(17,24,39,.96)_0%,rgba(17,24,39,.84)_40%,rgba(17,24,39,.34)_100%)]" />
          <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-[#1683ff]/18 blur-3xl" />
          <div className="pointer-events-none absolute right-[-72px] top-6 h-[360px] w-[150px] rounded-full bg-[#4fb4ff]/35 blur-3xl lg:right-[-46px] lg:top-10 lg:h-[430px] lg:w-[190px]" />
          <div className="pointer-events-none absolute right-0 top-8 h-[250px] w-[2px] bg-[linear-gradient(180deg,transparent,#8fd3ff,transparent)] shadow-[0_0_26px_8px_rgba(88,181,255,.7)] lg:h-[330px]" />
          <div className="pointer-events-none absolute left-[7%] top-[28%] h-1.5 w-1.5 rounded-full bg-[#65c8ff] shadow-[0_0_18px_5px_rgba(101,200,255,.65)]" />
          <div className="pointer-events-none absolute left-[20%] top-[20%] h-1 w-1 rounded-full bg-[#65c8ff] shadow-[0_0_14px_4px_rgba(101,200,255,.55)]" />
          <div className="pointer-events-none absolute left-[15%] bottom-[30%] h-1.5 w-1.5 rounded-full bg-[#65c8ff] shadow-[0_0_18px_5px_rgba(101,200,255,.6)]" />
          <div className="pointer-events-none absolute left-[30%] bottom-[42%] h-1 w-1 rounded-full bg-[#65c8ff] shadow-[0_0_14px_4px_rgba(101,200,255,.55)]" />
          <div className="pointer-events-none absolute -left-[10%] -top-[30%] h-72 w-72 rounded-full border-[22px] border-[#ff7a1a]" />
          <div className="pointer-events-none absolute -right-16 bottom-[-90px] h-56 w-56 rounded-full border-[18px] border-[#ff7a1a]/35" />
          <img src={locationIcon} alt="" className="pointer-events-none absolute left-[10%] top-[48%] z-10 w-10 rotate-[-10deg] object-contain opacity-95 drop-shadow-[0_16px_22px_rgba(0,0,0,.35)] sm:left-[14%] sm:top-[44%] sm:w-12 lg:left-[38%] lg:top-[20%] lg:w-20" />
          <img src={pieIcon} alt="" className="pointer-events-none absolute right-[12%] top-[8%] z-10 w-11 rotate-[12deg] object-contain opacity-95 drop-shadow-[0_16px_22px_rgba(0,0,0,.35)] sm:right-[18%] sm:w-14 lg:right-[40%] lg:top-[10%] lg:w-20" />
          <img src={documentIcon} alt="" className="pointer-events-none absolute bottom-[36%] right-[8%] z-10 w-10 rotate-[-7deg] object-contain opacity-95 drop-shadow-[0_16px_22px_rgba(0,0,0,.35)] sm:bottom-[34%] sm:right-[12%] sm:w-12 lg:bottom-[12%] lg:left-[35%] lg:w-20" />

          <div className="relative grid h-full items-center gap-5 lg:grid-cols-[390px_1fr]">
            <div className="order-2 z-10 max-w-[430px] rounded-[18px] bg-[#071d25]/45 p-4 backdrop-blur-[2px] sm:p-5 lg:order-1 lg:ml-20 lg:bg-transparent lg:p-0 lg:backdrop-blur-0 xl:ml-20">
              <p className="mb-3 text-[10px] font-bold uppercase leading-none tracking-[.32em] text-white/75">Tu negocio, con mas claridad</p>
              <h1 className="text-[clamp(31px,3.1vw,42px)] font-extrabold leading-[1.02] tracking-normal text-white drop-shadow-[0_4px_16px_rgba(0,0,0,.45)]">
                Gestiona tus empresas <span className="text-[#ff7a1a]">con Scapder</span>
              </h1>
              <p className="mt-4 max-w-[370px] text-[13px] font-semibold leading-6 text-white/85 drop-shadow-[0_3px_12px_rgba(0,0,0,.35)]">Centraliza, analiza y haz crecer todas tus empresas desde una sola plataforma.</p>
              <button className="mt-5 inline-flex min-h-[44px] items-center justify-center gap-4 rounded-lg bg-[#ff7a1a] px-5 text-[13px] font-bold text-white shadow-[0_16px_34px_-22px_rgba(255,122,26,.95)] transition hover:-translate-y-px hover:bg-[#ff5b12]" onClick={() => setShowCreate((value) => !value)} type="button">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-[#ff7a1a]">{showCreate ? '-' : '+'}</span>
                {showCreate ? 'Cancelar' : 'Crear empresa'}
                <ArrowRight size={17} />
              </button>
            </div>

            <div className="order-1 relative min-h-[245px] overflow-hidden sm:min-h-[300px] lg:order-2 lg:h-full lg:min-h-0">
              <img src={gondolas} alt="" className="absolute bottom-[8%] right-[-2%] w-[min(390px,82vw)] object-contain drop-shadow-[0_22px_34px_rgba(0,0,0,.34)] sm:right-[6%] sm:w-[min(620px,76vw)] lg:bottom-[-10%] lg:right-[10%] lg:w-[min(620px,42vw)]" />
              <img src={vendedorRobot} alt="" className="absolute bottom-[2px] left-[2%] w-[min(220px,50vw)] object-contain drop-shadow-[0_22px_34px_rgba(0,0,0,.32)] sm:left-[10%] sm:w-[400px] lg:left-[15%] lg:w-[380px]" />
              <div className="absolute bottom-[-1px] right-[-1px] hidden h-[118px] w-[150px] overflow-hidden sm:h-[150px] sm:w-[190px] lg:block lg:h-[175px] lg:w-[220px]">
                <div className="absolute -bottom-[72px] -right-[72px] h-[188px] w-[188px] rounded-full border-[13px] border-[#ff7a1a] bg-[#071d25] shadow-[0_18px_38px_-22px_rgba(0,0,0,.85)] sm:-bottom-[92px] sm:-right-[92px] sm:h-[245px] sm:w-[245px] sm:border-[16px] lg:-bottom-[108px] lg:-right-[108px] lg:h-[286px] lg:w-[286px] lg:border-[18px]">
                  <span className="absolute left-12 top-12 grid h-7 w-7 place-items-center rounded-full border-2 border-[#ff7a1a] text-[#ff7a1a] sm:left-16 sm:top-16 sm:h-8 sm:w-8 lg:left-[74px] lg:top-[74px]">
                    <ArrowRight size={15} />
                  </span>
                  <p className="absolute left-7 top-[76px] max-w-[82px] text-[11px] font-extrabold leading-4 text-white sm:left-10 sm:top-[104px] sm:max-w-[105px] sm:text-[13px] sm:leading-5 lg:left-12 lg:top-[120px] lg:max-w-[120px] lg:text-[14px]">
                    Datos que impulsan tu crecimiento
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 pt-6 sm:px-8 lg:px-10">
          <div className="mb-5 grid gap-5 xl:grid-cols-[1fr_auto] xl:items-center">
            <div className="grid grid-cols-[auto_1fr] items-center gap-3">
              <span className="text-[clamp(52px,7vw,76px)] font-extrabold leading-none text-[#ff8b3a]/90">01</span>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[.22em] text-[#8a9ab0]">Paso 1</span>
                <h2 className="text-[clamp(32px,4.5vw,48px)] font-extrabold leading-[.9] text-[#07132c]">Empresas</h2>
                <p className="mt-2 text-sm font-medium text-[#58708f]">Gestiona y visualiza tus empresas desde un solo lugar.</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(260px,430px)_auto_auto]">
              <label className="flex min-h-[48px] items-center gap-3 rounded-lg border border-[#d6e3f2] bg-white px-4 shadow-[0_16px_42px_-36px_rgba(18,22,33,.65)]">
                <Search size={20} className="text-[#4d6b90]" />
                <input className="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-medium text-[#142033] outline-none placeholder:text-[#7c8ea6]" placeholder="Buscar empresas por nombre, sector o ubicacion..." value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <select className="min-h-[48px] rounded-lg border border-[#d6e3f2] bg-white px-4 text-[13px] font-semibold text-[#142033] outline-none" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Todas las empresas</option>
                <option value="activa">Activas</option>
                <option value="configuracion">En analisis</option>
                <option value="pausada">Pausadas</option>
              </select>
              <div className="grid min-h-[48px] grid-cols-2 overflow-hidden rounded-lg border border-[#d6e3f2] bg-white">
                <button className="grid w-12 place-items-center bg-[#071d25] text-white" type="button" aria-label="Vista en cuadricula"><Grid2X2 size={17} /></button>
                <button className="grid w-12 place-items-center text-[#8a9ab0]" type="button" aria-label="Vista en lista"><List size={17} /></button>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-5 flex snap-x gap-5 overflow-x-auto pb-5 sm:mx-8 lg:mx-10">
          {featuredRetailers.map((item, index) => {
            const status = getStatus(item)
            return (
              <button className="group relative h-[350px] min-w-[min(88vw,390px)] snap-start overflow-hidden rounded-[22px] bg-[#071d25] text-left shadow-[0_26px_70px_-42px_rgba(7,29,37,.9)] transition duration-300 hover:-translate-y-2 hover:shadow-[0_34px_90px_-46px_rgba(7,29,37,.95)] md:min-w-[380px] xl:min-w-[400px]" key={item.id} onClick={() => selectRetailer(item)} type="button">
                <img src={getSupermarketImage(index)} alt={item.name} className="absolute inset-x-0 top-0 h-[205px] w-full object-cover transition duration-700 group-hover:scale-110" onError={(event) => { event.currentTarget.src = gondolas }} />
                <div className="absolute inset-x-0 top-0 h-[205px] bg-[linear-gradient(180deg,rgba(7,29,37,.04)_0%,rgba(7,29,37,.10)_58%,rgba(7,29,37,.72)_100%)]" />
                <span className={`absolute right-4 top-4 z-10 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-black shadow-[0_12px_26px_-20px_rgba(7,29,37,.8)] ${status.className}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" /> {status.label}
                </span>
                <div className="absolute bottom-0 left-0 right-0 min-h-[182px] rounded-t-[28px] bg-[#111923]/96 px-5 pb-5 pt-5 text-white shadow-[0_-20px_48px_-36px_rgba(0,0,0,.9)] transition group-hover:bg-[#071d25]">
                  <span className="absolute -top-4 left-5 grid h-9 w-9 place-items-center rounded-full bg-[#ff7a1a] text-[12px] font-black text-white shadow-[0_14px_30px_-18px_rgba(255,122,26,.9)]">{String(index + 1).padStart(2, '0')}</span>
                  <h3 className="mt-2 truncate text-xl font-black text-white">{item.name}</h3>
                  <p className="mt-1 truncate text-xs font-semibold text-white/62">{getSector(item)}</p>
                  <div className="mt-4 grid gap-2 text-[12px] font-semibold text-white/82">
                    <span className="inline-flex items-center gap-2"><MapPin size={15} className="text-white/70" /> {item.code || 'Ubicacion registrada'}</span>
                    <span className="inline-flex items-center gap-2"><Building2 size={15} className="text-white/70" /> {item.site_count ?? 0} sedes</span>
                    
                  </div>
                  <span className="absolute bottom-5 right-5 grid h-12 w-12 place-items-center rounded-full bg-white text-[#071d25] shadow-[0_18px_36px_-22px_rgba(0,0,0,.95)] transition group-hover:translate-x-1 group-hover:bg-[#ff7a1a] group-hover:text-white">
                    <ArrowRight size={19} />
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {!filteredRetailers.length && (
          <div className="mx-5 rounded-xl border border-dashed border-[#ccd7e5] bg-white p-10 text-center sm:mx-8 lg:mx-10">
            <p className="text-base font-bold text-[#07132c]">No hay empresas para mostrar.</p>
            <p className="mt-2 text-sm font-semibold text-[#58708f]">Cambia la busqueda o crea una empresa nueva.</p>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#071d25]/55 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="create-retailer-title">
          <form className="relative grid w-full max-w-[860px] overflow-hidden rounded-[24px] bg-white shadow-[0_34px_90px_-42px_rgba(7,29,37,.95)] md:grid-cols-[320px_1fr]" onSubmit={submit}>
            <button className="absolute right-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-full border border-[#d6e3f2] bg-white text-[#071d25] transition hover:border-[#ff5b12] hover:text-[#ff5b12]" onClick={() => setShowCreate(false)} type="button" aria-label="Cerrar modal">
              x
            </button>
            <div className="relative isolate min-h-[260px] overflow-hidden bg-[#202021] p-6 text-white">
              <img src={flujoPuntos} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[.18] mix-blend-screen" />
              <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full border-[16px] border-[#ff7a1a]" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#202021] to-transparent" />
              <img src={vendedorRobot} alt="" className="absolute bottom-0 left-1/2 w-[260px] -translate-x-1/2 object-contain drop-shadow-[0_24px_38px_rgba(0,0,0,.42)]" />
              <div className="relative z-10">
                <span className="text-[11px] font-bold uppercase tracking-[.24em] text-[#7dc3ff]">Paso 1</span>
                <h2 id="create-retailer-title" className="mt-3 text-3xl font-extrabold leading-none">Nueva empresa</h2>
                <p className="mt-3 max-w-[220px] text-sm font-medium leading-6 text-white/70">Crea el negocio y luego configura sus sedes para iniciar el analisis.</p>
              </div>
            </div>
            <div className="p-6 sm:p-8">
              <div className="mb-6">
                <h3 className="text-2xl font-extrabold text-[#07132c]">Datos de la empresa</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-[#58708f]">Usa un nombre claro y un codigo unico para identificarla rapido.</p>
              </div>
              <div className="grid gap-4">
                <label className="grid gap-2 text-xs font-bold text-[#58708f]">
                  Nombre
                  <input className="min-h-[52px] w-full rounded-xl border border-[#d6e3f2] bg-[#f8fbff] px-4 text-[#151323] outline-none focus:border-[#ff5b12] focus:ring-4 focus:ring-[#ff5b12]/10" required minLength="2" maxLength="120" placeholder="Ej. Mercado Central" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </label>
                <label className="grid gap-2 text-xs font-bold text-[#58708f]">
                  NIT
                  <input className="min-h-[52px] w-full rounded-xl border border-[#d6e3f2] bg-[#f8fbff] px-4 text-[#151323] outline-none focus:border-[#1683ff] focus:ring-4 focus:ring-[#1683ff]/10" required minLength="2" maxLength="50" placeholder="nit de la empresa" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
                </label>
              </div>
              {error && <p className="mt-4 text-sm font-bold text-[#b43b1d]" role="alert">{error}</p>}
              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-[#d6e3f2] bg-white px-5 text-sm font-bold text-[#58708f] transition hover:border-[#071d25] hover:text-[#071d25]" onClick={() => setShowCreate(false)} type="button">
                  Cancelar
                </button>
                <button className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#ff5b12] px-5 text-sm font-bold text-white shadow-[0_16px_34px_-22px_rgba(255,91,18,.85)] transition hover:-translate-y-px hover:bg-[#e94d08]" disabled={creating} type="submit">
                  {creating ? 'Creando...' : 'Crear empresa'} <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <nav className="fixed inset-x-4 bottom-4 z-40 grid grid-cols-4 rounded-[24px] border border-white/10 bg-[#071d25]/95 px-4 py-3 text-xs font-bold text-[#8da0bb] shadow-[0_18px_60px_-28px_rgba(7,29,37,.85)] backdrop-blur md:hidden">
        <span className="grid place-items-center gap-1 text-[#ff7a1a]"><Building2 size={22} />Empresas</span>
        <span className="grid place-items-center gap-1"><MapPin size={22} />Sedes</span>
        <span className="grid place-items-center gap-1"><BarChart3 size={22} />Analisis</span>
        <span className="grid place-items-center gap-1"><MoreHorizontal size={22} />Mas</span>
      </nav>
    </section>
  )
}
