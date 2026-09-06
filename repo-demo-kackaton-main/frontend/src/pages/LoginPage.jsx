import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LockKeyhole, Mail, Square } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import peopleRobot from '../assets/images/team-robot.png'
import camera from '../assets/images/camera.png'
import circuit from '../assets/images/circuit.png'
import stripes from '../assets/images/stripes.png'
import boxes from '../assets/images/packages.png'
import plant from '../assets/images/plant.png'
import dots from '../assets/images/dots.png'
import logo from '../assets/images/logo.png'

const loginTheme = {
  page: '#e9e9f1',
  dark: '#202124',
  ink: '#21184a',
  muted: '#777481',
  orange: '#ff7308',
  blue: '#4f8cff',
}

export default function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) navigate('/empresas', { replace: true })
  }, [user, navigate])

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
    <main
      className="min-h-[100svh] bg-[#e9e9f1] text-[#21184a] lg:h-screen lg:overflow-hidden"
      style={{ fontFamily: 'Poppins, Montserrat, Inter, system-ui, sans-serif' }}
    >
      <div className="mx-auto grid min-h-[100svh] w-full max-w-[1365px] lg:h-screen lg:grid-cols-[44%_56%]">
        <section className="relative min-h-[100svh] overflow-hidden bg-[#e9e9f1] lg:h-screen lg:min-h-0">
          <img src={stripes} alt="" className="pointer-events-none absolute left-[51%] top-0 z-0 hidden h-[34vh] max-h-[230px] -translate-x-1/2 opacity-75 sm:block" />
          <img src={dots} alt="" className="pointer-events-none absolute left-4 top-3 z-0 w-[76px] opacity-20" />

          <div className="absolute left-0 top-0 z-20 grid h-[70px] w-[166px] place-items-center rounded-br-xl bg-[#202124] px-7 py-4 lg:h-[68px] lg:w-[162px]">
            <img src={logo} alt="Scapder" className="h-full w-full object-contain" />
          </div>

          <div className="relative z-10 flex min-h-[100svh] items-center justify-center px-6 py-24 sm:px-10 lg:h-screen lg:min-h-0 lg:px-12 lg:py-0">
            <form className="mt-7 w-full max-w-[360px] lg:mt-6 xl:mt-8" onSubmit={submit}>
              <div className="mb-4 text-center">
                <h1 className="text-[1.9rem] font-black leading-[.84] text-[#21184a] sm:text-[2.18rem] lg:text-[2rem] xl:text-[2.28rem]">
                  &iexcl;Bienvenido!
                  <span className="block">
                    Gestiona, <b className="text-[#ff7308]">analiza</b> y
                  </span>
                  <span className="block">haz crecer tu negocio</span>
                </h1>
                <p className="mx-auto mt-3 max-w-[310px] text-[13px] font-medium leading-4 text-[#777481] sm:text-[14px]">
                  La plataforma inteligente que te ayuda a tomar mejores decisiones.
                </p>
              </div>

              <div className="grid gap-3">
                <label className="relative block">
                  <span className="sr-only">Correo electronico</span>
                  <span className="pointer-events-none absolute left-4 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center text-[#4f8cff]">
                    <Mail size={22} strokeWidth={2.7} />
                  </span>
                  <input
                    className="h-[50px] w-full rounded-xl border border-transparent bg-white px-5 pl-14 text-[14px] font-semibold text-[#21184a] shadow-[0_16px_42px_-31px_rgba(20,27,36,.62)] outline-none transition placeholder:text-[#aaa8b4] focus:border-[#4f8cff] focus:ring-4 focus:ring-[#4f8cff]/15"
                    type="email"
                    placeholder="Correo electronico"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    autoComplete="email"
                  />
                </label>

                <label className="relative block">
                  <span className="sr-only">Contrasena</span>
                  <span className="pointer-events-none absolute left-4 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center text-[#4f8cff]">
                    <LockKeyhole size={22} strokeWidth={2.7} />
                  </span>
                  <input
                    className="h-[50px] w-full rounded-xl border border-transparent bg-white px-5 pl-14 pr-14 text-[14px] font-semibold text-[#21184a] shadow-[0_16px_42px_-31px_rgba(20,27,36,.62)] outline-none transition placeholder:text-[#aaa8b4] focus:border-[#4f8cff] focus:ring-4 focus:ring-[#4f8cff]/15"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Contrasena"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    className="absolute right-4 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-[#8b8a97] transition hover:bg-[#edf2ff] hover:text-[#4f8cff]"
                    type="button"
                    aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </label>
              </div>

              <div className="mt-4 flex items-center justify-between gap-4 text-[12px] font-black text-[#11101f]">
                <label className="inline-flex items-center gap-2">
                  <input
                    className="peer sr-only"
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded border-2 border-[#4f8cff] text-[#4f8cff] peer-checked:bg-[#4f8cff] peer-checked:text-white">
                    {remember && <Square size={8} fill="currentColor" strokeWidth={0} />}
                  </span>
                  <span className="sr-only">Recordarme</span>
                </label>
                <button className="shrink-0 text-right" type="button">
                  &iquest;Olvidaste tu contrase&ntilde;a?
                </button>
              </div>

              {error && (
                <p className="mt-4 rounded-xl border border-[#ffd0bd] bg-[#fff2eb] px-4 py-3 text-sm font-bold text-[#b43b1d]" role="alert">
                  {error}
                </p>
              )}

              <button
                className="mt-4 h-[52px] w-full bg-[#ff7308] text-[20px] font-black text-white shadow-[0_22px_42px_-28px_rgba(255,115,8,.9)] transition hover:bg-[#f06400] focus:outline-none focus:ring-4 focus:ring-[#ff7308]/25 disabled:cursor-not-allowed disabled:opacity-55"
                disabled={loading}
                style={{ backgroundColor: loginTheme.orange }}
                type="submit"
              >
                {loading ? 'Verificando...' : <>Inicia sesi&oacute;n</>}
              </button>

              <button className="mt-4 flex h-[48px] w-full items-center justify-center gap-3 rounded-xl bg-white text-[14px] font-black text-[#20345a] shadow-[0_16px_38px_-31px_rgba(20,27,36,.55)]" type="button">
                <span className="grid h-6 w-6 place-items-center rounded-full text-lg text-[#4285f4]">G</span>
                Continuar con Google
              </button>

              <button className="mt-4 block w-full text-right text-[12px] font-black text-[#11101f]" type="button">
                Reg&iacute;strate
              </button>
            </form>
          </div>

          <img src={dots} alt="" className="pointer-events-none absolute bottom-5 left-2 z-0 w-16 opacity-95" />
        </section>

        <section className="relative hidden h-screen min-h-0 overflow-hidden border-l-[10px] border-[#e9e9f1] bg-[#202124] lg:block">
          <img src={circuit} alt="" className="pointer-events-none absolute left-[14%] top-[7%] z-0 w-[60%] opacity-55" />
          <div className="pointer-events-none absolute right-[1%] top-[22%] z-[1] h-[25vw] max-h-[360px] min-h-[280px] w-[25vw] min-w-[280px] max-w-[360px] rounded-full border-[40px] border-[#ff7308]" />
          <img src={camera} alt="" className="pointer-events-none absolute right-3 top-8 z-20 w-[21%] max-w-[180px]" />
          <img src={peopleRobot} alt="Equipo Scapder" className="pointer-events-none absolute bottom-0 left-1/2 z-30 h-[92vh] w-[98%] -translate-x-1/2 object-contain object-bottom" />
          <img src={plant} alt="" className="pointer-events-none absolute bottom-4 left-5 z-40 w-[13%] max-w-[105px]" />
          <img src={boxes} alt="" className="pointer-events-none absolute bottom-3 left-[15%] z-40 w-[12%] max-w-[98px]" />
        </section>
      </div>
    </main>
  )
}
