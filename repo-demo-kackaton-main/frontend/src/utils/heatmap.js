/**
 * Motor de mapa de calor de tráfico por rejilla, independiente de la resolución
 * del video. Acumulación y renderizado separados: el componente acumula con
 * createGrid/accumulateSample/accumulatePoint y dibuja con normalizeGrid +
 * renderHeatmap.
 *
 * ----------------------------- CONFIGURACIÓN ---------------------------------
 * Ajusta HEATMAP_CONFIG aquí; es la única palanca que tocarás en producción.
 *   - Mapa demasiado SATURADO (todo rojo/naranja):
 *       bajar ALPHA_SCALE (0.68 -> 0.4) o subir NORMALIZE_PERCENTILE (99 -> 99.5).
 *   - Mapa demasiado APAGADO (casi invisible):
 *       subir ALPHA_SCALE (0.68 -> 0.9) o bajar NORMALIZE_PERCENTILE (99 -> 97)
 *       o bajar GAMMA (0.55 -> 0.4) para empujar los valores bajos hacia arriba.
 *   - Zonas de paso muy estrechas no se ven:
 *       bajar GAMMA (0.55 -> 0.45) aclara los valles sin tocar los picos.
 *   - Manchas demasiado cuadriculadas o poco fundidas entre sí:
 *       subir BLOB_RADIUS (1.9 -> 2.4).
 * -----------------------------------------------------------------------------
 */
export const HEATMAP_CONFIG = {
  // Rejilla en celdas; independiente de la resolución del video (spec §1).
  GRID_COLS: 44,
  GRID_ROWS: 38,

  // Kernel de dispersión (spec §3): la celda en la que cae la persona recibe
  // 1.0 y cada una de las 8 vecinas recibe 0.45. Evita puntos aislados.
  CENTER_WEIGHT: 1.0,
  NEIGHBOR_WEIGHT: 0.45,

  // Percentil de celdas no vacías usado como techo de la escala (spec §5).
  // El p99 evita que una celda atípica (puerta que se abre, reflejo) aplaste
  // a todo el mapa.
  NORMALIZE_PERCENTILE: 99,

  // Corrección gamma: v_final = pow(v, GAMMA). Sin esto, las zonas de tráfico
  // bajo quedan invisibles y el 90% del mapa se ve vacío (spec §5).
  GAMMA: 0.55,

  // Transparencia por celda: alpha = ALPHA_BASE + ALPHA_SCALE * v (spec §7).
  // Las celdas frías casi transparentes dejan ver la escena; las calientes
  // opacan.
  ALPHA_BASE: 0.18,
  ALPHA_SCALE: 0.68,

  // Desenfoque gaussiano ligero del resultado para suavizar los bordes de
  // celda (spec §8). Se escala con el ancho del rectángulo de dibujo.
  BLUR: 1.2,

  // Radio de la mancha radial de cada celda caliente, en múltiplos del
  // tamaño de celda (spec §8b). Un radio grande funde varias celdas vecinas
  // en una sola mancha suave (efecto "heatmap.js"/CCTV) en vez de cuadrícula.
  BLOB_RADIUS: 1.9,

  // Resolución máxima (px de ancho) del lienzo auxiliar donde se pintan las
  // manchas radiales antes de escalar al tamaño real del video. Mantiene el
  // costo por frame acotado sin importar la resolución del video, y el
  // reescalado a más resolución añade un desenfoque extra que suaviza aún
  // más el resultado.
  MASK_MAX_WIDTH: 480,

  // Dimensiones reales del piso cuando hay homografía calibrada (spec §4).
  FLOOR_WIDTH: 7.0,
  FLOOR_DEPTH: 6.0,

  // Margen de tolerancia: se descartan los puntos que caen fuera del área
  // calibrada más esta fracción (spec §4).
  TOLERANCE: 0.05,

  // Rampa de color: interpolación lineal RGB entre estas paradas, t de 0 a 1
  // (spec §6). Paleta tipo "cámara térmica": azul frío -> cian -> verde ->
  // amarillo -> naranja -> rojo intenso, saturada para que se note incluso
  // en zonas de tránsito bajo.
  COLOR_STOPS: [
    [0.0, 18, 34, 140], // azul/violeta frío
    [0.16, 22, 96, 208], // azul
    [0.34, 20, 172, 206], // cian
    [0.52, 66, 196, 96], // verde
    [0.68, 230, 202, 42], // amarillo
    [0.84, 240, 128, 24], // naranja
    [1.0, 224, 32, 32], // rojo intenso
  ],
}

/** Crea la rejilla de acumulación en un único Float32Array plano (cols*rows). */
export function createGrid(config = HEATMAP_CONFIG) {
  return new Float32Array(config.GRID_COLS * config.GRID_ROWS)
}

/**
 * Reparte un voto sobre la celda (cx, cy) y sus 8 vecinas (spec §3).
 * Verifica los límites de la rejilla antes de escribir en cualquier celda.
 */
export function accumulatePoint(grid, cx, cy, config = HEATMAP_CONFIG) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (x < 0 || x >= config.GRID_COLS || y < 0 || y >= config.GRID_ROWS) continue
      const weight = dx === 0 && dy === 0 ? config.CENTER_WEIGHT : config.NEIGHBOR_WEIGHT
      grid[y * config.GRID_COLS + x] += weight
    }
  }
}

/**
 * Acumula un punto normalizado [0..1] sobre la rejilla: un voto por track por
 * frame, sin importar el tamaño aparente de la persona (spec §2).
 */
export function accumulateSample(grid, point, config = HEATMAP_CONFIG) {
  if (!point || !Array.isArray(point)) return
  const cx = Math.floor(point[0] * config.GRID_COLS)
  const cy = Math.floor(point[1] * config.GRID_ROWS)
  if (cx < 0 || cx >= config.GRID_COLS || cy < 0 || cy >= config.GRID_ROWS) return
  accumulatePoint(grid, cx, cy, config)
}

/**
 * Punto de los pies de una persona a partir de su bounding box (spec §2):
 * (x_centro, y_inferior), normalizado al rango [0..1] del video.
 * NUNCA usar el centro de la caja: el centro mete el calor a la altura del
 * torso y distorsiona el mapa.
 */
export function feetFromBBox(bbox, videoW, videoH, config = HEATMAP_CONFIG) {
  const cx = (bbox[0] + bbox[2]) / 2
  const bottom = bbox[3]
  return [
    Math.min(1, Math.max(0, cx / (videoW || 1))),
    Math.min(1, Math.max(0, bottom / (videoH || 1))),
  ]
}

/**
 * Proyección opcional a metros reales (spec §4). Si la homografía [imagen -> piso]
 * está disponible y no es la identidad, mapea el punto de los pies al plano del
 * piso y lo normaliza contra FLOOR_WIDTH x FLOOR_DEPTH. Devuelve null si el punto
 * cae fuera del área calibrada (más el margen TOLERANCE). Si no hay homografía (o
 * es identidad, p.ej. modo vídeo sin calibrar), devuelve la coordenada de imagen
 * normalizada (fallback).
 */
export function projectFeetThroughHomography(bbox, videoW, videoH, homography, config = HEATMAP_CONFIG) {
  const cx = (bbox[0] + bbox[2]) / 2
  const bottom = bbox[3]
  const identity =
    homography &&
    homography.length === 3 &&
    Array.isArray(homography[0]) && Array.isArray(homography[1]) && Array.isArray(homography[2]) &&
    homography[0][0] === 1 && homography[1][1] === 1 && homography[2][2] === 1
  if (!homography || identity || typeof homography[2]?.[0] !== 'number') {
    return feetFromBBox(bbox, videoW, videoH, config)
  }
  // El sistema trabaja con homografías en el espacio imagen NORMALIZADO ->
  // metros (source_normalized/target_meters de la calibración), asi que el
  // punto de los pies se normaliza ANTES de proyectar.
  const u = cx / (videoW || 1)
  const v = bottom / (videoH || 1)
  const [a, b, c] = homography[0]
  const [d, e, f] = homography[1]
  const [g, h, i] = homography[2]
  const denom = g * u + h * v + i
  if (Math.abs(denom) < 1e-9) return null
  const nx = (a * u + b * v + c) / (denom * (config.FLOOR_WIDTH || 1))
  const nz = (d * u + e * v + f) / (denom * (config.FLOOR_DEPTH || 1))
  const tol = config.TOLERANCE ?? 0.05
  if (nx < -tol || nx > 1 + tol || nz < -tol || nz > 1 + tol) return null
  return [Math.min(1, Math.max(0, nx)), Math.min(1, Math.max(0, nz))]
}

/**
 * Normalización (spec §5): el techo de la escala es el percentil configurado
 * de las celdas no vacías (no el máximo crudo) y se recorta a 1.0. Luego aplica
 * la corrección gamma. Devuelve una NUEVA rejilla 0..1 sin mutar el acumulador.
 */
export function normalizeGrid(grid, config = HEATMAP_CONFIG) {
  const out = new Float32Array(grid.length)
  const positive = []
  for (let i = 0; i < grid.length; i++) {
    const value = grid[i]
    out[i] = value
    if (value > 0) positive.push(value)
  }
  if (!positive.length) return out
  positive.sort((a, b) => a - b)
  const index = Math.min(
    positive.length - 1,
    Math.floor((config.NORMALIZE_PERCENTILE / 100) * (positive.length - 1)),
  )
  const ceiling = positive[index] || 1
  const gamma = config.GAMMA ?? 0.55
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.pow(Math.min(1, out[i] / ceiling), gamma)
  }
  return out
}

/**
 * Interpolación lineal RGB sobre la rampa de COLOR_STOPS para t en [0, 1]
 * (spec §6). Devuelve [r, g, b].
 */
export function tintFor(value, config = HEATMAP_CONFIG) {
  const stops = config.COLOR_STOPS
  const t = Math.min(1, Math.max(0, value))
  if (!stops || !stops.length) return [255, 0, 0]
  if (stops.length === 1) return stops[0].slice(1)
  if (t <= stops[0][0]) return stops[0].slice(1)
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const prev = stops[i - 1]
      const next = stops[i]
      const span = next[0] - prev[0] || 1
      const k = (t - prev[0]) / span
      return [
        Math.round(prev[1] + (next[1] - prev[1]) * k),
        Math.round(prev[2] + (next[2] - prev[2]) * k),
        Math.round(prev[3] + (next[3] - prev[3]) * k),
      ]
    }
  }
  const last = stops[stops.length - 1]
  return last.slice(1)
}

/** Tabla de 256 colores precalculados sobre COLOR_STOPS, para colorizar rápido por píxel. */
function buildColorLUT(config) {
  const lut = new Array(256)
  for (let i = 0; i < 256; i++) lut[i] = tintFor(i / 255, config)
  return lut
}

/**
 * Renderizado (spec §8), técnica "heatmap.js": en vez de pintar cada celda
 * como un rectángulo plano, cada celda caliente dibuja una mancha radial
 * (negro opaco en el centro -> transparente en el borde, alpha = v) sobre un
 * lienzo auxiliar de intensidad. Las manchas vecinas se superponen y el
 * alpha se acumula, fundiéndose en manchas orgánicas suaves en vez de una
 * cuadrícula visible (igual que un mapa de calor térmico/CCTV).
 *
 * Luego se coloriza: el alpha acumulado de cada píxel (0..255) se busca
 * directo en una rampa de color precalculada (spec §6) — la gamma ya se
 * aplicó una vez en normalizeGrid, así que aquí no se vuelve a corregir —
 * y se le asigna alpha final = ALPHA_BASE + ALPHA_SCALE * v (spec §7).
 *
 * El lienzo auxiliar se construye a resolución reducida (MASK_MAX_WIDTH) y
 * se escala hacia arriba al dibujar: el reescalado con interpolación suma
 * un desenfoque extra "gratis" que redondea aún más el resultado, además
 * del blur gaussiano final.
 *
 * alphaScale multiplica ALPHA_SCALE (sirve para que el slider de opacidad del
 * video siga teniendo efecto, o para realzar el mapa al final del video).
 */
export function renderHeatmap(ctx, grid, rect, config = HEATMAP_CONFIG, alphaScale = 1) {
  const cols = config.GRID_COLS
  const rows = config.GRID_ROWS
  const maxW = config.MASK_MAX_WIDTH || 480
  const scale = Math.min(1, maxW / Math.max(1, rect.width))
  const w = Math.max(1, Math.round(rect.width * scale))
  const h = Math.max(1, Math.round(rect.height * scale))
  const cellW = w / cols
  const cellH = h / rows

  // --- Paso 1: máscara de intensidad acumulada (manchas radiales) ---
  const mask = document.createElement('canvas')
  mask.width = w
  mask.height = h
  const mctx = mask.getContext('2d')
  const radius = Math.max(cellW, cellH) * (config.BLOB_RADIUS || 1.9)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = grid[r * cols + c]
      if (v <= 0.02) continue
      const cx = (c + 0.5) * cellW
      const cy = (r + 0.5) * cellH
      const g = mctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      g.addColorStop(0, `rgba(0,0,0,${Math.min(1, v)})`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      mctx.fillStyle = g
      mctx.beginPath()
      mctx.arc(cx, cy, radius, 0, Math.PI * 2)
      mctx.fill()
    }
  }

  // --- Paso 2: colorizar según el alpha acumulado de cada píxel ---
  // El valor de cada celda que alimenta las manchas radiales ya pasó por
  // normalizeGrid (gamma aplicado una vez, spec §5); aquí solo se usa el
  // alpha acumulado (0..255) tal cual como t para no corregir gamma dos
  // veces sobre la mezcla de manchas superpuestas.
  const lut = buildColorLUT(config)
  const maskData = mctx.getImageData(0, 0, w, h)
  const src = maskData.data
  const out = mctx.createImageData(w, h)
  const dst = out.data
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3]
    if (a === 0) continue
    const t = a / 255
    const [rr, gg, bb] = lut[a]
    dst[i] = rr
    dst[i + 1] = gg
    dst[i + 2] = bb
    dst[i + 3] = Math.round(255 * Math.min(1, config.ALPHA_BASE + config.ALPHA_SCALE * alphaScale * t))
  }
  mctx.putImageData(out, 0, 0)

  const blur = Math.max(0, (config.BLUR || 0) * rect.width / 960)
  if (blur > 0 && typeof ctx.filter === 'string') ctx.filter = `blur(${blur.toFixed(2)}px)`
  ctx.drawImage(mask, rect.x, rect.y, rect.width, rect.height)
  if (blur > 0 && typeof ctx.filter === 'string') ctx.filter = 'none'
}