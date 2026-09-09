import {
  BarChart3,
  ScanLine,
  ShoppingCart,
  UploadCloud,
  Video,
} from 'lucide-react'

const STEPS = [
  {
    id: 1,
    label: 'Subir video',
    icon: UploadCloud,
  },
  {
    id: 2,
    label: 'Seleccionar área',
    icon: Video,
  },
  {
    id: 3,
    label: 'Configurar góndolas',
    icon: ShoppingCart,
  },
  {
    id: 4,
    label: 'Procesar análisis',
    icon: ScanLine,
  },
  {
    id: 5,
    label: 'Resultados',
    icon: BarChart3,
  },
]

export default function AnalysisStepper({ currentStep = 1 }) {
  return (
    <div className="w-full px-2 py-5 sm:px-4">
      <div className="mx-auto flex w-full max-w-[920px] items-start justify-between">

        {STEPS.map((step, index) => {
          const active = step.id === currentStep
          const completed = step.id < currentStep
          const Icon = step.icon

          return (
            <div
              key={step.id}
              className="relative flex flex-1 flex-col items-center"
            >
              {/* LÍNEA */}
              {index < STEPS.length - 1 && (
                <div
                  className={`absolute left-1/2 top-[19px] h-[2px] w-full ${
                    completed
                      ? 'bg-[#ff641f]'
                      : 'bg-[#d7e3ef]'
                  }`}
                />
              )}

              {/* CÍRCULO */}
              <div
                className={`relative z-10 grid h-10 w-10 place-items-center rounded-full transition-all duration-300 ${
                  active
                    ? 'bg-[#ff641f] text-white shadow-[0_0_0_6px_rgba(255,100,31,.12),0_8px_22px_rgba(255,100,31,.22)]'
                    : completed
                      ? 'bg-[#fff0e8] text-[#ff641f]'
                      : 'bg-[#e9eef5] text-[#61738a]'
                }`}
              >
                <Icon size={18} strokeWidth={2.4} />
              </div>

              {/* TEXTO */}
              <span
                className={`mt-3 max-w-[130px] text-center text-[10px] font-black leading-4 sm:text-xs ${
                  active
                    ? 'text-[#ff641f]'
                    : 'text-[#52657c]'
                }`}
              >
                {step.label}
              </span>
            </div>
          )
        })}

      </div>
    </div>
  )
}