import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HEATMAP_CONFIG,
  createGrid,
  accumulatePoint,
  accumulateSample,
  feetFromBBox,
  projectFeetThroughHomography,
  normalizeGrid,
  tintFor,
} from '../src/utils/heatmap.js'

const COLS = HEATMAP_CONFIG.GRID_COLS
const ROWS = HEATMAP_CONFIG.GRID_ROWS

// La rejilla es Float32: compara con tolerancia, nunca igualdad exacta.
const approx = (actual, expected, eps = 1e-5) => {
  assert.ok(Math.abs(actual - expected) < eps, `${actual} != ${expected} (tolerancia ${eps})`)
}

test('createGrid devuelve una rejilla plana de cols*rows', () => {
  const grid = createGrid()
  assert.equal(grid.length, COLS * ROWS)
  assert.ok(grid.every((v) => v === 0))
})

test('accumulatePoint reparte kernel 1.0/0.45 en celdas centrales', () => {
  const grid = createGrid()
  accumulatePoint(grid, 5, 5)
  approx(grid[5 * COLS + 5], HEATMAP_CONFIG.CENTER_WEIGHT)
  approx(grid[4 * COLS + 4], HEATMAP_CONFIG.NEIGHBOR_WEIGHT)
  approx(grid[6 * COLS + 6], HEATMAP_CONFIG.NEIGHBOR_WEIGHT)
  assert.equal(grid[3 * COLS + 3], 0)
})

test('accumulatePoint no desborda los bordes de la rejilla', () => {
  const grid = createGrid()
  accumulatePoint(grid, 0, 0)
  approx(grid[0], HEATMAP_CONFIG.CENTER_WEIGHT)
  approx(grid[COLS + 1], HEATMAP_CONFIG.NEIGHBOR_WEIGHT)
  const total = grid.reduce((a, b) => a + b, 0)
  assert.ok(total > HEATMAP_CONFIG.CENTER_WEIGHT)
})

test('accumulateSample coloca el punto de los pies en la celda correcta', () => {
  const grid = createGrid()
  accumulateSample(grid, [0.5, 0.5])
  approx(grid[Math.floor(ROWS / 2) * COLS + Math.floor(COLS / 2)], HEATMAP_CONFIG.CENTER_WEIGHT)
})

test('accumulateSample descarta puntos fuera de rango y null', () => {
  const grid = createGrid()
  accumulateSample(grid, null)
  accumulateSample(grid, undefined)
  accumulateSample(grid, [2.5, 0.5])
  accumulateSample(grid, [-0.2, 0.5])
  assert.ok(grid.every((v) => v === 0))
})

test('feetFromBBox usa el punto de los pies (centro-x, y inferior)', () => {
  const bbox = [10, 40, 30, 100] // 576x360 original
  const [nx, ny] = feetFromBBox(bbox, 576, 360)
  assert.equal(nx, 20 / 576)
  assert.equal(ny, 100 / 360)
})

test('projectFeetThroughHomography con identidad hace fallback a imagen', () => {
  const identity = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  const [nx, ny] = projectFeetThroughHomography([10, 40, 30, 100], 576, 360, identity)
  assert.equal(nx, 20 / 576)
  assert.equal(ny, 100 / 360)
})

test('projectFeetThroughHomography sin homografía devuelve imagen normalizada', () => {
  const [nx, ny] = projectFeetThroughHomography([10, 40, 30, 100], 576, 360, null)
  assert.equal(nx, 20 / 576)
  assert.equal(ny, 100 / 360)
})

test('projectFeetThroughHomography proyecta uv -> metros y descarta fuera de calibración', () => {
  // Homografía en el espacio imagen NORMALIZADA -> metros (igual que la
  // calibración source_normalized/target_meters), piso de 7x6 m sin traslación.
  const homography = [
    [7, 0, 0],
    [0, 6, 0],
    [0, 0, 1],
  ]
  // Pies en el centro del video -> centro del piso.
  const [nx, nz] = projectFeetThroughHomography([283, 120, 293, 180], 576, 360, homography)
  approx(nx, 0.5)
  approx(nz, 0.5)
  // Punto fuera del área calibrada (más allá de 7x6 m) -> descartado.
  const out = projectFeetThroughHomography([600, 400, 700, 500], 576, 360, homography)
  assert.equal(out, null)
})

test('normalizeGrid usa p99 (una celda atípica no aplasta el mapa)', () => {
  const grid = createGrid()
  // 100 celdas en 4, 20 celdas en 8, 1 celda atípica en 1000.
  let n = 0
  for (let i = 0; i < grid.length && n < 100; i++, n++) grid[i] = 4
  n = 0
  for (let i = 0; i < grid.length && n < 20; i++) {
    if (grid[i] === 0) {
      grid[i] = 8
      n++
    }
  }
  grid[0] = 1000
  const out = normalizeGrid(grid)
  // p99 cae en las celdas de valor 8 -> techo 8. El pico 1000 se recorta a 1.
  assert.equal(Math.round(out[0] * 1e6) / 1e6, 1)
  // Valor 4 (justo debajo del p99) queda en el interior de la rampa.
  const plain = out[5]
  assert.ok(plain > 0 && plain < 1)
})

test('normalizeGrid aplica gamma y devuelve copia sin mutar la fuente', () => {
  const grid = createGrid()
  // 121 celdas positivas repartidas en 4 (x100) y 8 (x20) y un pico 1000.
  let n = 0
  for (let i = 0; i < grid.length && n < 100; i++, n++) grid[i] = 4
  n = 0
  for (let i = 0; i < grid.length && n < 20; i++) {
    if (grid[i] === 0) {
      grid[i] = 8
      n++
    }
  }
  grid[0] = 1000
  let idxA = -1
  let idxB = -1
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 4 && idxA < 0) idxA = i
    if (grid[i] === 8 && idxB < 0) idxB = i
  }
  const before = Array.from(grid)
  const out = normalizeGrid(grid)
  assert.deepEqual(Array.from(grid), before) // sin mutar
  const expectedA = Math.pow(4 / 8, HEATMAP_CONFIG.GAMMA)
  approx(out[idxA], expectedA)
  assert.equal(out[idxB], 1)
})

test('normalizeGrid sobre rejilla vacía devuelve ceros', () => {
  const out = normalizeGrid(createGrid())
  assert.ok(out.every((v) => v === 0))
})

test('tintFor respeta las paradas de la rampa y es monotónico', () => {
  assert.deepEqual(tintFor(0), [18, 34, 140])
  assert.deepEqual(tintFor(1), [224, 32, 32])
  const low = tintFor(0.1)
  const high = tintFor(0.95)
  assert.equal(low.length, 3)
  assert.ok(high[2] < low[2]) // se pierde el azul hacia el rojo
  assert.deepEqual(tintFor(0.52), [66, 196, 96])
})

test('sanity del kernel en 3x3 no solapado', () => {
  const config = { ...HEATMAP_CONFIG, GRID_COLS: 4, GRID_ROWS: 4 }
  const grid = createGrid(config)
  accumulatePoint(grid, 1, 1, config)
  accumulatePoint(grid, 2, 2, config)
  const total = grid.reduce((a, b) => a + b, 0)
  const cellW = config.CENTER_WEIGHT
  const nW = config.NEIGHBOR_WEIGHT
  // Dos votos completos sin cortes de borde: 2 * (1.0 + 8*0.45).
  approx(total, (cellW + 8 * nW) * 2)
})

test('la especificación exige 7 paradas de color con esos RGB (paleta térmica)', () => {
  const stops = HEATMAP_CONFIG.COLOR_STOPS
  assert.equal(stops.length, 7)
  assert.deepEqual(stops[0].slice(1), [18, 34, 140])
  assert.deepEqual(stops[1].slice(1), [22, 96, 208])
  assert.deepEqual(stops[2].slice(1), [20, 172, 206])
  assert.deepEqual(stops[3].slice(1), [66, 196, 96])
  assert.deepEqual(stops[4].slice(1), [230, 202, 42])
  assert.deepEqual(stops[5].slice(1), [240, 128, 24])
  assert.deepEqual(stops[6].slice(1), [224, 32, 32])
})