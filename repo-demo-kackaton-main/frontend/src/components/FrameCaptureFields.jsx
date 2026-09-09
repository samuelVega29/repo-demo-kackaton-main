import { Camera, Check } from 'lucide-react'
import { useRef } from 'react'
import { Link, useParams } from 'react-router-dom'

export default function FrameCaptureFields({ preview, frameCapture, onCapture }) {
  const videoRef = useRef(null)
  const { siteId } = useParams()

  const capture = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const width = video.videoWidth
    const height = video.videoHeight
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(video, 0, 0, width, height)
    onCapture(canvas.toDataURL('image/jpeg', 0.85), width, height)
  }

  if (!preview) {
    return (
      <div className="rounded-md border border-dashed border-[#e5e7ee] bg-[#f8f8f7] px-5 py-12 text-center text-sm font-semibold text-[#7d8392]">
        <p>Para reconfigurar la camara necesitas subir un video de referencia primero.</p>
        <Link className="mt-4 inline-flex min-h-[40px] items-center justify-center rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08]" to={`/sites/${siteId}/video?reconfigurar=camara`}>
          Subir video de referencia
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <video ref={videoRef} src={preview} controls muted playsInline className="max-h-[48vh] w-full rounded-md border border-[#e5e7ee] bg-black" />
      <div className="flex flex-wrap items-center gap-3">
        <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white transition hover:-translate-y-px hover:bg-[#e94d08]" onClick={capture} type="button"><Camera size={16} /> Capturar frame</button>
        {frameCapture && <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#eaf8ef] px-2.5 py-1 text-[11px] font-black text-[#12824c]"><Check size={14} /> Frame capturado ({frameCapture.width} x {frameCapture.height})</span>}
      </div>
    </div>
  )
}
