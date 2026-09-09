// Formateador liviano para las respuestas del asistente (Gemini responde en Markdown:
// **negrita**, listas con "-"/"*" o "1.", párrafos separados por líneas en blanco).
// No usamos una librería de markdown completa a propósito: el chat solo necesita
// negrita, listas y párrafos, y esto evita sumar una dependencia para tan poco.

const BULLET_RE = /^\s*[-*]\s+(.*)/
const NUMBERED_RE = /^\s*\d+\.\s+(.*)/

function renderInline(text, keyPrefix) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((part) => part !== '')
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>
    }
    return <span key={`${keyPrefix}-${index}`}>{part}</span>
  })
}

export function renderChatMarkdown(text) {
  if (!text) return null
  const lines = text.split('\n')
  const blocks = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') {
      i++
      continue
    }

    if (BULLET_RE.test(line)) {
      const items = []
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        items.push(lines[i].match(BULLET_RE)[1])
        i++
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-4">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `li-${blocks.length}-${idx}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    if (NUMBERED_RE.test(line)) {
      const items = []
      while (i < lines.length && NUMBERED_RE.test(lines[i])) {
        items.push(lines[i].match(NUMBERED_RE)[1])
        i++
      }
      blocks.push(
        <ol key={`ol-${blocks.length}`} className="my-1 list-decimal space-y-0.5 pl-4">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `oli-${blocks.length}-${idx}`)}</li>
          ))}
        </ol>,
      )
      continue
    }

    const paragraphLines = []
    while (i < lines.length && lines[i].trim() !== '' && !BULLET_RE.test(lines[i]) && !NUMBERED_RE.test(lines[i])) {
      paragraphLines.push(lines[i])
      i++
    }
    blocks.push(
      <p key={`p-${blocks.length}`} className="mb-1 last:mb-0">
        {renderInline(paragraphLines.join(' '), `p-${blocks.length}`)}
      </p>,
    )
  }

  return blocks
}
