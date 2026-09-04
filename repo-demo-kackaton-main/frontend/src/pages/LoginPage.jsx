import { useState } from 'react'
import BrandLogo from '../components/ui/BrandLogo'
import { useAuth } from '../auth/AuthProvider'
import peopleRobot from '../assets/images/team-robot.png'
import camera from '../assets/images/camera.png'
import circuit from '../assets/images/circuit.png'
import stripes from '../assets/images/stripes.png'
import boxes from '../assets/images/packages.png'
import plant from '../assets/images/plant.png'
import dots from '../assets/images/dots.png'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('admin@scapder.ai')
  const [password, setPassword] = useState('Scapder2026!')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#202023] text-[#21184a] md:grid md:grid-cols-[minmax(360px,42%)_1fr]">
      <section className="order-last relative flex min-h-0 flex-col justify-end px-4 pb-6 pt-5 sm:px-8 sm:pb-10 sm:pt-8 md:order-none md:min-h-screen md:justify-center md:px-8 md:py-12 lg:px-14">
        <div className="absolute left-5 top-5 z-10 sm:left-8 sm:top-8 md:left-8 md:top-8 lg:left-14 lg:top-10">
          <BrandLogo />
        </div>

        <form className="relative z-10 mx-auto w-full max-w-[430px] rounded-[28px] bg-[#f3f3f8] px-5 py-7 shadow-2xl sm:rounded-[32px] sm:px-9 sm:py-9 md:max-w-[390px] md:px-8 lg:max-w-[430px] lg:px-10" onSubmit={submit}>
          <div className="mb-6 text-center sm:mb-7">
            <p className="text-[clamp(1.35rem,5vw,2.25rem)] font-bold leading-[1.08] sm:text-3xl md:text-[2rem]">
              ¡Bienvenido!<span className="block">Gestiona, <b className="text-orange-500">analiza</b> y</span><span className="block">haz crecer tu negocio</span>
            </p>
            <p className="mx-auto mt-3 max-w-xs text-[11px] leading-4 text-slate-500 sm:text-xs sm:leading-5">La plataforma inteligente que te ayuda a tomar mejores decisiones.</p>
          </div>

          <div className="grid gap-3 sm:gap-4">
            <label className="relative block">
              <span className="sr-only">Correo</span>
              <input className="h-12 w-full rounded-lg border border-transparent bg-white px-4 pl-11 text-sm text-slate-900 outline-none transition focus:border-orange-400 sm:h-14" type="email" placeholder="Correo electrónico" value={email} onChange={(event) => setEmail(event.target.value)} required />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500">@</span>
            </label>

            <label className="relative block">
              <span className="sr-only">Contrasena</span>
              <input className="h-12 w-full rounded-lg border border-transparent bg-white px-4 pl-11 text-sm text-slate-900 outline-none transition focus:border-orange-400 sm:h-14" type="password" placeholder="Contraseña" value={password} onChange={(event) => setPassword(event.target.value)} required />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500">#</span>
            </label>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-[10px] font-semibold sm:text-[11px]">
            <label className="inline-flex items-center gap-2 text-slate-500"><input className="accent-blue-500" type="checkbox" />Recordarme</label>
            <button className="text-right text-[#21184a]" type="button">¿Olvidaste tu contraseña?</button>
          </div>

          {error && <p className="mt-4 rounded-lg bg-orange-100 px-3 py-2 text-sm text-orange-700" role="alert">{error}</p>}

          <button className="mt-5 h-12 w-full bg-orange-500 text-base font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50 sm:mt-6 sm:h-14" disabled={loading} type="submit">
            {loading ? 'Verificando...' : 'Inicia sesión'}
          </button>
          <button className="mx-auto mt-6 block text-[11px] font-bold text-[#21184a]" type="button">Registrate</button>
        </form>
      </section>

      <section className="order-first relative h-[38vh] min-h-[245px] overflow-hidden bg-[#202023] sm:h-[42vh] sm:min-h-[300px] md:order-none md:h-screen md:min-h-screen">
        <div className="relative h-full w-full bg-[#202023]">
          <img src={stripes} alt="" className="pointer-events-none absolute left-[-2%] top-0 z-10 w-[30%] max-w-[220px] opacity-90 md:left-0 md:w-[26%] lg:w-[23%]" />
          <img src={circuit} alt="" className="pointer-events-none absolute right-[-8%] top-[8%] z-0 w-[75%] max-w-[560px] opacity-70 md:right-[-4%] md:top-[12%] md:w-[72%] lg:right-[-2%] lg:top-[10%] lg:w-[68%]" />
          <div className="pointer-events-none absolute right-[-8%] top-[25%] z-[1] h-28 w-28 rounded-full border-[12px] border-orange-500 sm:h-44 sm:w-44 sm:border-[16px] md:right-[-4%] md:top-[23%] md:h-72 md:w-72 md:border-[24px] lg:right-[-2%] lg:top-[24%] lg:h-80 lg:w-80" />
          <img src={camera} alt="" className="pointer-events-none absolute right-[-3%] top-[5%] z-20 w-[27%] max-w-[190px] md:right-[-2%] md:top-[7%] md:w-[25%] lg:right-0 lg:top-[5%] lg:w-[24%]" />
          <img src={peopleRobot} alt="Equipo Scapder con robot" className="pointer-events-none absolute bottom-[-12%] left-[18%] z-20 w-[78%] max-w-[650px] sm:bottom-[-20%] sm:left-[24%] sm:w-[65%] md:bottom-[-5%] md:left-[12%] md:w-[78%] lg:bottom-[-4%] lg:left-[14%] lg:w-[70%]" />
          <img src={plant} alt="" className="pointer-events-none absolute bottom-[-2%] left-[4%] z-30 w-[18%] max-w-[130px] md:bottom-[1%] md:left-[5%] md:w-[17%] lg:bottom-[2%] lg:left-[5%] lg:w-[15%]" />
          <img src={boxes} alt="" className="pointer-events-none absolute bottom-[-1%] left-[19%] z-30 w-[16%] max-w-[115px] md:bottom-[1%] md:left-[20%] lg:bottom-[2%] lg:left-[19%] lg:w-[14%]" />
          <img src={dots} alt="" className="pointer-events-none absolute bottom-1 left-1 z-30 w-8 sm:bottom-3 sm:left-3 md:bottom-5 md:left-5 md:w-12 lg:bottom-6 lg:left-6" />
        </div>
      </section>
    </main>
  )
}
