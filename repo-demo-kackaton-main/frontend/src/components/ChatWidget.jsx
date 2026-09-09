import { useEffect, useRef, useState } from 'react'
import { Send, Square, X } from 'lucide-react'
import avatarChat from '../assets/images/avatar-chat.png'
import { useApp } from '../context/AppProvider'
import { streamChatMessage } from '../services/chat'
import { renderChatMarkdown } from '../utils/chatMarkdown'

const BASE_SUGGESTIONS = [
  '¿Qué significa cada metrica?',
  'Explicame las recomendaciones',
  '¿Como subo un video?',
]

const PROGRESS_SUGGESTIONS = ['¿Cómo va el análisis?', '¿Cuánto falta?']

const FOLLOW_UP_SUGGESTIONS = [
  '¿Qué góndola tiene más tráfico?',
  '¿Cuál es la recomendación principal?',
  '¿Qué significa cada metrica?',
]

const STORAGE_PREFIX = 'scapder_chat_'
const TIMEOUT_MS = 60000

const STAGE_LABELS = {
  upload: 'Carga del video',
  metadata: 'Leyendo el video',
  model: 'Deteccion de personas',
  preprocessing: 'Deteccion de personas',
  tracking: 'Analisis de trayectorias',
  dwell: 'Tiempo de permanencia',
  heatmaps: 'Generando mapa',
  interactions: 'Interacciones detectadas',
  recommendations: 'Recomendaciones finales',
  results: 'Finalizando',
}

export default function ChatWidget() {
  const { site, job } = useApp()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const lastUserTextRef = useRef('')

  const storageKey = `${STORAGE_PREFIX}${site?.id ?? 'none'}`

  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const inProgress = Boolean(job?.id && !['completed', 'failed'].includes(job.status))

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      setMessages(raw ? JSON.parse(raw) : [])
    } catch {
      setMessages([])
    }
  }, [storageKey])

  useEffect(() => {
    if (!open) return undefined
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(messages.slice(-30)))
    } catch {
      /* sin almacenamiento disponible */
    }
  }, [messages, open, storageKey])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, busy, open])

  const stop = () => {
    abortRef.current?.abort()
  }

  const submit = async (text = input, overrides = {}) => {
    const message = text.trim()
    if (!message || busy) return
    setInput('')
    lastUserTextRef.current = message

    const current = overrides.base ?? messagesRef.current
    const index = current.length
    const history = current
      .filter((item) => !item.error && item.content && item.content.trim())
      .slice(-10)
      .map(({ role, content }) => ({ role: role === 'user' ? 'user' : 'model', content }))

    setMessages([
      ...current,
      { role: 'user', content: message },
      { role: 'model', content: '', streaming: true },
    ])

    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)

    const patchStream = (delta) => {
      setMessages((currentMessages) =>
        currentMessages.map((item, i) =>
          i === index + 1 ? { ...item, content: (item.content || '') + delta } : item,
        ),
      )
    }

    try {
      await streamChatMessage(
        {
          message,
          site_id: site?.id ?? null,
          analysis_id: job?.id ?? null,
          history,
        },
        patchStream,
        { signal: controller.signal },
      )
      setMessages((currentMessages) =>
        currentMessages.map((item, i) =>
          i === index + 1 ? { ...item, streaming: false, error: false } : item,
        ),
      )
    } catch (error) {
      const friendly =
        error?.name === 'AbortError'
          ? 'La respuesta tardó demasiado. Probá de nuevo en unos segundos.'
          : error?.message || 'No fue posible obtener respuesta.'
      setMessages((currentMessages) =>
        currentMessages.map((item, i) =>
          i === index + 1 ? { ...item, streaming: false, error: true, content: friendly } : item,
        ),
      )
    } finally {
      window.clearTimeout(timer)
      abortRef.current = null
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const retry = () => {
    const text = lastUserTextRef.current
    if (!text || busy) return
    let base = messagesRef.current
    if (base.length && base[base.length - 1]?.error) {
      base = base.slice(0, -1)
      if (base.length && base[base.length - 1]?.role === 'user') base = base.slice(0, -1)
    }
    submit(text, { base })
  }

  const last = messages[messages.length - 1]
  const showFollowUps = Boolean(
    messages.length && last?.role === 'model' && !last?.streaming && !last?.error && !busy,
  )
  const suggestions = inProgress ? [...PROGRESS_SUGGESTIONS, ...BASE_SUGGESTIONS] : BASE_SUGGESTIONS

  const stageLabel = STAGE_LABELS[job?.stage] ?? job?.stage ?? 'Procesando'

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {open && (
        <section className="flex h-[480px] w-[min(380px,calc(100vw-24px))] max-h-[calc(100vh-130px)] flex-col overflow-hidden rounded-2xl border border-[rgba(206,236,221,.14)] bg-[#08100e] shadow-[0_30px_80px_rgba(0,0,0,.5)]">
          <header className="flex items-center justify-between border-b border-[rgba(206,236,221,.14)] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-[#ff6b3d]/40 bg-[#13231e] shadow-[0_0_28px_rgba(255,107,61,.18)]">
                <img src={avatarChat} alt="Avatar del asistente" className="h-full w-full object-cover" />
              </span>
              <div className="min-w-0">
                <b className="block truncate text-[12px] font-semibold tracking-[.08em] text-white">ASISTENTE SCAPDER</b>
                <span className="block truncate text-[9px] text-[#7d8392]">{site ? `Contexto: ${site.name}` : 'Guia de uso'}</span>
                {inProgress && (
                  <span className="block truncate text-[9px] font-semibold text-[#ff6b3d]">
                    {stageLabel} · {job.progress ?? 0}%
                  </span>
                )}
              </div>
            </div>
            <button className="grid h-7 w-7 place-items-center rounded-full border border-[rgba(206,236,221,.14)] bg-[#172720] text-[#dbe8e2]" onClick={() => setOpen(false)} aria-label="Cerrar chat" type="button">
              <X size={14} />
            </button>
          </header>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 text-[12px] leading-relaxed">
            {messages.length === 0 && (
              <div className="mb-3 flex items-start gap-3">
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[#ff6b3d]/30 bg-[#13231e]">
                  <img src={avatarChat} alt="" className="h-full w-full object-cover" />
                </span>
                <div>
                  <p className="text-[13px] font-medium text-[#dbe8e2]">Hola, soy el asistente de SCAPDER.</p>
                  <p className="mt-1 text-[#7d8392]">Te ayudo a interpretar los informes y a usar la plataforma{inProgress ? '. También puedo contarte cómo va el análisis en vivo.' : '.'}</p>
                </div>
              </div>
            )}
            {messages.map((message, index) => {
              const isLast = index === messages.length - 1
              const showRetry = isLast && message.error && !busy
              return (
                <div key={index} className={`mb-2 flex items-end gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.role !== 'user' && (
                    <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-[#ff6b3d]/30 bg-[#13231e]">
                      <img src={avatarChat} alt="" className="h-full w-full object-cover" />
                    </span>
                  )}
                  <div className={`flex max-w-[85%] flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`rounded-xl px-3 py-2 ${message.role === 'user' ? 'whitespace-pre-wrap bg-[#ff6b3d] text-white' : 'bg-[#172720] text-[#dbe8e2]'}`}
                    >
                      {message.role === 'user'
                        ? message.content
                        : message.streaming && !message.content
                          ? (
                              <span className="flex items-center gap-1 py-0.5" aria-label="El asistente está escribiendo">
                                <span className="chat-dot" />
                                <span className="chat-dot" />
                                <span className="chat-dot" />
                              </span>
                            )
                          : (
                              <>
                                {renderChatMarkdown(message.content)}
                                {message.streaming && <span className="chat-cursor" />}
                              </>
                            )}
                    </div>
                    {showRetry && (
                      <button className="mt-1 inline-flex items-center gap-1 rounded-full border border-[#ff6b3d]/40 bg-[#0b1613] px-2.5 py-1 text-[10px] text-[#ff6b3d] hover:bg-[#ff6b3d]/10" onClick={retry} type="button">
                        Reintentar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {messages.length === 0 && !busy && (
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} className="rounded-full border border-[rgba(206,236,221,.2)] bg-[#0b1613] px-3 py-1.5 text-[10px] text-[#dbe8e2] hover:border-[#ff6b3d] hover:text-[#ff6b3d]" onClick={() => submit(suggestion)} type="button">
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {showFollowUps && (
              <div className="mt-1 flex flex-wrap gap-2 pl-9">
                {FOLLOW_UP_SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} className="rounded-full border border-[rgba(206,236,221,.2)] bg-[#0b1613] px-3 py-1.5 text-[10px] text-[#dbe8e2] hover:border-[#ff6b3d] hover:text-[#ff6b3d]" onClick={() => submit(suggestion)} type="button">
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
              placeholder={inProgress ? 'Pregunta cómo va el análisis...' : 'Escribe tu pregunta...'}
              disabled={busy}
              className="min-w-0 flex-1 rounded-lg border border-[rgba(206,236,221,.14)] bg-[#0b1613] px-3 py-2 text-[12px] text-[#dbe8e2] placeholder:text-[#6b7570] focus:border-[#ff6b3d] focus:outline-none disabled:opacity-60"
            />
            {busy ? (
              <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#ff6b3d]/50 bg-[#0b1613] text-[#ff6b3d]" onClick={stop} aria-label="Detener respuesta" type="button">
                <Square size={14} />
              </button>
            ) : (
              <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#ff6b3d] text-white disabled:opacity-50" onClick={() => submit()} disabled={!input.trim()} aria-label="Enviar mensaje" type="button">
                <Send size={15} />
              </button>
            )}
          </footer>
        </section>
      )}

      <button className="grid h-14 w-14 place-items-center overflow-hidden rounded-full border-2 border-white bg-[#ff6b3d] text-white shadow-[0_10px_30px_rgba(255,107,61,.45)]" onClick={() => setOpen((current) => !current)} aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'} type="button">
        {open ? <X size={22} /> : <img src={avatarChat} alt="" className="h-full w-full object-cover" />}
      </button>
    </div>
  )
}