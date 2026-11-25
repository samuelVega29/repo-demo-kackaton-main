import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import peopleRobot from '../assets/images/team-robot.png'
import loginRobot from '../assets/images/robot-login.png'
import camera from '../assets/images/camera.png'
import circuit from '../assets/images/circuit.png'
import stripes from '../assets/images/stripes.png'
import boxes from '../assets/images/packages.png'
import plant from '../assets/images/plant.png'
import dots from '../assets/images/dots.png'
import logo from '../assets/images/logo.png'
import cameraIcon from '../assets/images/icono_camara_3d.png'
import cartIcon from '../assets/images/icono_carrito_3d.png'
import growthIcon from '../assets/images/icono_crecimiento_3d.png'
import orbitalLines from '../assets/images/lineas_orbitales_3d.png'
import iconoAnalitica from '../assets/images/icono_analitica_3d.png'

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
      className="min-h-[100svh] overflow-x-hidden overflow-y-auto bg-[#202124] text-[#21184a] md:h-screen md:overflow-hidden"
      style={{ fontFamily: 'Poppins, Montserrat, Inter, system-ui, sans-serif' }}
    >
      <div className="grid min-h-[100svh] w-full md:h-full md:min-h-0 md:grid-cols-[42%_58%] xl:grid-cols-[41%_59%]">
        <section className="relative z-20 min-h-[100svh] overflow-visible bg-[#202124] md:h-screen md:min-h-0 md:overflow-visible md:bg-[#202124]">
          
          <img src={stripes} alt="" className="pointer-events-none absolute left-0 top-[180px] z-0 block h-[210px] w-[96px] rotate-180 object-contain opacity-75 md:hidden" />
          <img src={dots} alt="" className="pointer-events-none absolute left-4 top-3 z-0 w-[76px] opacity-20" />

          <div className="absolute left-3 top-3 z-20 grid h-[34px] w-[115px] place-items-center px-1 py-1 md:left-0 md:top-0 md:h-[84px] md:w-[200px] md:rounded-br-xl md:bg-[#202124] md:px-7 md:py-4 xl:h-[80px] xl:w-[200px] xl:px-8">
            <img src={logo} alt="Scapder" className="h-full w-full object-contain" />
          </div>

          

          <div className="pointer-events-none absolute inset-0 z-20 overflow-visible md:z-40">
            <img src={circuit} alt="" className="absolute left-[16%] top-8 z-0 block w-[82%] opacity-45 md:block" />
           
            <img src={orbitalLines} alt="" className="absolute left-[20%] top-[calc(50%+285px)] z-0 hidden w-[440px] opacity-50 md:block" />
            
            
            <img src={camera} alt="Camara de analisis" className="absolute right-[-4px] top-10 z-[2] w-[88px] opacity-95 sm:right-0 sm:top-12 sm:w-[100px] md:hidden" />
            <div className="pointer-events-none absolute right-[-105px] top-[150px] z-0 h-[250px] w-[250px] rounded-full border-[18px] border-[#ff7308] opacity-90 md:hidden" />
            <img src={iconoAnalitica} alt="" className="absolute left-[-15px] top-[26px] z-[50] hidden w-[104px] drop-shadow-[0_14px_18px_rgba(0,0,0,.35)] md:left-[20%] md:top-[calc(50%-240px)] lg:block md:w-[100px]" />
            <img src={growthIcon} alt="" className="absolute left-[-16px] top-[128px] z-[50] hidden w-[106px] drop-shadow-[0_14px_18px_rgba(0,0,0,.35)] md:left-[15%] md:top-[calc(50%-40px)] lg:block md:w-[102px]" />
            <img src={cartIcon} alt="" className="absolute left-[8px] top-[226px] z-[50] hidden w-[101px] drop-shadow-[0_14px_18px_rgba(0,0,0,.35)] md:left-[20%] md:top-[calc(50%+160px)] lg:block md:w-[98px]" />
            <img src={loginRobot} alt="" className="absolute left-1/2 top-[40px] z-[3] h-[330px] w-[330px] -translate-x-1/2 object-contain object-top sm:top-[42px] sm:h-[350px] sm:w-[350px] md:hidden" />
            <img src={loginRobot} alt="" className="absolute left-1/2 top-[40px] z-[50] h-[330px] w-[330px] -translate-x-1/2 object-contain object-top sm:top-[42px] sm:h-[350px] sm:w-[350px] md:hidden" style={{ clipPath: 'inset(72% 0 0)' }} />
          </div>

          <div className="relative z-30 flex min-h-[100svh] items-start justify-center px-1 pt-[360px] sm:px-10 sm:pt-[380px] md:h-full md:min-h-0 md:items-center md:px-[4%] md:py-6 xl:px-[6%] xl:py-8">
            <div className="relative w-full max-w-[360px] md:max-w-[400px] md:translate-x-[48px] xl:max-w-[450px] xl:translate-x-[72px]">
              <img src={stripes} alt="" className="pointer-events-none absolute -right-[72px] -top-24 z-30 hidden h-[190px] w-[152px] object-cover object-bottom opacity-90 md:block xl:-right-[92px] xl:-top-28 xl:h-[230px] xl:w-[184px]" />
              <form className="relative z-10 -mt-10 flex min-h-[450px] w-full flex-col justify-center overflow-hidden rounded-t-[28px] bg-[#f4f3f8] px-4 py-8 shadow-[0_-18px_45px_rgba(0,0,0,.18)] md:mt-0 md:min-h-[500px] md:rounded-[30px] md:px-8 md:py-6 md:shadow-[0_18px_45px_rgba(20,20,30,.12)] xl:min-h-[550px] xl:rounded-[34px] xl:px-10 xl:py-7" onSubmit={submit}>
              <div className="relative z-10 mb-4 text-center md:mb-4">
                <p className='text-[21px] font-normal leading-[1.12] md:text-[22px] xl:text-[25px]'>¡Bienvenido!<br></br> Gestiona, <span className='font-medium text-[#EF740E]'>analiza</span> y <br></br> haz <span className='font-medium text-[#4f8cff]'>crecer</span> tu negocio</p>
                <p className="mx-auto mt-2 max-w-[310px] text-[11px] leading-4 font-light md:max-w-[350px] md:text-[12px] xl:max-w-[410px] xl:text-[13px]">
                  La plataforma inteligente que te ayuda a tomar mejores decisiones.
                </p>
              </div>

              <div className="grid gap-2.5 md:gap-2.5">
                <label className="relative block">
                  <span className="sr-only">Correo electronico</span>
                  <span className="pointer-events-none absolute left-4 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center text-[#4f8cff]">
                    <Mail size={22} strokeWidth={2.7} />
                  </span>
                  <input
                    className="h-[46px] w-full rounded-[15px] border border-transparent bg-white px-5 pl-12 text-[12px] font-normal text-[#21184a] shadow-[0_16px_42px_-31px_rgba(20,27,36,.62)] outline-none transition placeholder:text-[#aaa8b4] focus:border-[#4f8cff] focus:ring-4 focus:ring-[#4f8cff]/15 md:h-[49px] md:rounded-[16px] md:pl-14 md:text-[13px] xl:h-[54px] xl:rounded-[18px] xl:text-[14px]"
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
                    className="h-[46px] w-full rounded-[15px] border border-transparent bg-white px-5 pl-12 pr-12 text-[12px] font-normal text-[#21184a] shadow-[0_16px_42px_-31px_rgba(20,27,36,.62)] outline-none transition placeholder:text-[#aaa8b4] focus:border-[#4f8cff] focus:ring-4 focus:ring-[#4f8cff]/15 md:h-[49px] md:rounded-[16px] md:pl-14 md:pr-14 md:text-[13px] xl:h-[54px] xl:rounded-[18px] xl:text-[14px]"
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

              <div className="mt-2 flex items-end justify-end gap-2 px-1 text-[10px] text-[#11101f] md:mt-3 md:gap-3 md:text-[11px] xl:text-[12px]">
               
                <button type="button" className="font-semibold hover:text-[#4f8cff]">&iquest;Olvidaste tu contrase&ntilde;a?</button>
              </div>

              {error && (
                <p className="mt-4 rounded-xl border border-[#ffd0bd] bg-[#fff2eb] px-4 py-3 text-sm font-semibold text-[#b43b1d]" role="alert">
                  {error}
                </p>
              )}

              <button
                className="mt-4 h-[48px] w-full rounded-[15px] bg-[#ff7308] text-[18px] font-semibold text-white shadow-[0_22px_42px_-28px_rgba(255,115,8,.9)] transition hover:bg-[#f06400] focus:outline-none focus:ring-4 focus:ring-[#ff7308]/25 md:mt-4 md:h-[51px] md:rounded-[16px] md:text-[19px] xl:h-[55px] xl:rounded-[18px] xl:text-[20px]"
                disabled={loading}
                style={{ backgroundColor: loginTheme.orange }}
                type="submit"
              >
                {loading ? 'Verificando...' : <>Inicia sesi&oacute;n</>}
              </button>

              </form>
            </div>
          </div>

          <img src={dots} alt="" className="pointer-events-none absolute bottom-5 left-2 z-0 w-16 opacity-95" />
        </section>

        <section className="relative z-10 hidden h-screen min-h-0 overflow-hidden bg-[#202124] md:block">
          <img src={circuit} alt="" className="pointer-events-none absolute left-[35%] top-0 z-0 w-[60%] opacity-55" />
          <div className="pointer-events-none absolute bottom-[-120px] left-[5%] z-[1] h-[25vw] max-h-[360px] min-h-[280px] w-[25vw] min-w-[280px] max-w-[360px] rounded-full border-[40px] border-[#ff7308]" />
          <img src={camera} alt="" className="pointer-events-none absolute right-0 top-8 z-20 w-[15%] max-w-[180px]" />
          <img src={dots} alt="" className="pointer-events-none absolute bottom-[45%] left-[10%] z-0 w-16 opacity-95" />
          <div className="pointer-events-none absolute right-[-8%] top-[24%] z-[1] h-[18vw] max-h-[260px] min-h-[210px] w-[18vw] min-w-[210px] max-w-[260px] rounded-full border-[32px] border-[#ff7308]" />
          <img src={peopleRobot} alt="Equipo Scapder" className="pointer-events-none absolute bottom-0 left-1/2 z-30 h-[83vh] w-[95%] -translate-x-1/2 object-contain object-bottom md:h-[90vh] xl:h-[95vh] xl:w-[92%]" />
          <img src={plant} alt="" className="pointer-events-none absolute bottom-0 left-[28%] z-40 h-[19%] w-[22%] max-w-[130px] xl:left-[30%] xl:h-[20%]" />
          <img src={boxes} alt="" className="pointer-events-none absolute bottom-0 left-[16%] z-40 h-[19%] max-w-[130px] xl:left-[18%] xl:h-[20%]" />
        </section>
      </div>
    </main>
  )
}
