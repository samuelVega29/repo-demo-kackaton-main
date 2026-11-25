import { AlertTriangle, X } from 'lucide-react'

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  loading = false,
  onCancel,
  onConfirm,
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-[#02060b]/70 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <button className="absolute inset-0 cursor-default" onClick={loading ? undefined : onCancel} type="button" aria-label="Cerrar confirmacion" />
      <section className="relative z-10 w-full max-w-[460px] overflow-hidden rounded-2xl border border-[#26384a] bg-[#071d25] text-white shadow-[0_30px_90px_-28px_rgba(0,0,0,.95)]">
        <div className="absolute inset-x-0 top-0 h-1 bg-[#ff5b12]" />
        <button className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:border-[#ff5b12] hover:text-white disabled:opacity-50" onClick={onCancel} disabled={loading} type="button" aria-label="Cerrar">
          <X size={17} />
        </button>

        <div className="p-6 pr-14">
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-[#fff1eb] text-[#ff5b12]">
            <AlertTriangle size={25} />
          </span>
          <h2 id="confirm-dialog-title" className="text-2xl font-black leading-tight">{title}</h2>
          <p className="mt-3 text-sm font-semibold leading-6 text-white/70">{message}</p>
        </div>

        <div className="grid gap-3 border-t border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
          <button className="min-h-[46px] rounded-xl border border-white/12 bg-white/5 px-4 text-sm font-black text-white transition hover:border-white/35 disabled:opacity-50" onClick={onCancel} disabled={loading} type="button">
            {cancelLabel}
          </button>
          <button className="min-h-[46px] rounded-xl bg-[#ff5b12] px-4 text-sm font-black text-white shadow-[0_18px_40px_-24px_rgba(255,91,18,.95)] transition hover:-translate-y-px hover:bg-[#e94d08] disabled:cursor-not-allowed disabled:opacity-70" onClick={onConfirm} disabled={loading} type="button">
            {loading ? 'Eliminando...' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
