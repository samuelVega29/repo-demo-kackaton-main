import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import { useApp } from '../context/AppProvider'
import { sendChatMessage } from '../services/chat'
import { renderChatMarkdown } from '../utils/chatMarkdown'

const SUGGESTIONS = [
  '¿Qué significa cada métrica?',
  'Explícame las recomendaciones',
  '¿Cómo subo un video?',
]

export default function ChatWidget() {
  const { site } = useApp()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, busy, open])

  const submit = async (text = input) => {
    const message = text.trim()
    if (!message || busy) return
    setInput('')
    const history = messages
      .filter((item) => item.content && item.content.trim())
      .slice(-10)
      .map(({ role, content }) => ({ role, content }))
    setMessages((current) => [...current, { role: 'user', content: message }])
    setBusy(true)
    try {
      const data = await sendChatMessage({ message, site_id: site?.id ?? null, history })
      setMessages((current) => [...current, { role: 'model', content: data.reply }])
    } catch (error) {
      setMessages((current) => [...current, { role: 'model', content: error.message || 'No fue posible obtener respuesta.' }])
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {open && (
        <section className="flex h-[480px] w-[min(380px,calc(100vw-24px))] max-h-[calc(100vh-130px)] flex-col overflow-hidden rounded-2xl border border-[rgba(206,236,221,.14)] bg-[#08100e] shadow-[0_30px_80px_rgba(0,0,0,.5)]">
          <header className="flex items-center justify-between border-b border-[rgba(206,236,221,.14)] px-4 py-3">
            <div>
              <b className="block text-[12px] font-semibold tracking-[.08em] text-[#fff]">ASISTENTE SCAPDER</b>
              <span className="block text-[9px] text-[#7d8392]">{site ? `Contexto: ${site.name}` : 'Guía de uso'}</span>
            </div>
            <button className="grid h-7 w-7 place-items-center rounded-full border border-[rgba(206,236,221,.14)] bg-[#172720] text-[#dbe8e2]" onClick={() => setOpen(false)} aria-label="Cerrar chat">
              <X size={14} />
            </button>
          </header>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 text-[12px] leading-relaxed">
            {messages.length === 0 && (
              <div className="mb-3">
                <p className="text-[13px] font-medium text-[#dbe8e2]">Hola, soy el asistente de SCAPDER.</p>
                <p className="mt-1 text-[#7d8392]">Te ayudo a interpretar los informes y a usar la plataforma.</p>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={index} className={`mb-2 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 ${message.role === 'user' ? 'whitespace-pre-wrap bg-[#ff6b3d] text-white' : 'bg-[#172720] text-[#dbe8e2]'}`}
                >
                  {message.role === 'user' ? message.content : renderChatMarkdown(message.content)}
                </div>
              </div>
            ))}
            {busy && (
              <div className="mb-2 flex justify-start">
                <span className="rounded-xl bg-[#172720] px-3 py-2 text-[#7d8392]">Pensando…</span>
              </div>
            )}
            {messages.length === 0 && !busy && (
              <div className="mt-3 flex flex-wrap gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} className="rounded-full border border-[rgba(206,236,221,.2)] bg-[#0b1613] px-3 py-1.5 text-[10px] text-[#dbe8e2] hover:border-[#ff6b3d] hover:text-[#ff6b3d]" onClick={() => submit(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          <footer className="flex items-center gap-2 border-t border-[rgba(206,236,221,.14)] p-3">
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
              placeholder="Escribe tu pregunta…"
              className="min-w-0 flex-1 rounded-lg border border-[rgba(206,236,221,.14)] bg-[#0b1613] px-3 py-2 text-[12px] text-[#dbe8e2] placeholder:text-[#6b7570] focus:border-[#ff6b3d] focus:outline-none"
            />
            <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#ff6b3d] text-white disabled:opacity-50" onClick={() => submit()} disabled={busy || !input.trim()} aria-label="Enviar mensaje">
              <Send size={15} />
            </button>
          </footer>
        </section>
      )}

      <button className="grid h-14 w-14 place-items-center rounded-full bg-[#ff6b3d] text-white shadow-[0_10px_30px_rgba(255,107,61,.45)]" onClick={() => setOpen((current) => !current)} aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'}>
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </div>
  )
}