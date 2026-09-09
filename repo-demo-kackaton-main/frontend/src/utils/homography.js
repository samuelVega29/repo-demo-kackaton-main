import {
  buildProjectionMatrix,
  buildInverseProjection,
  projectFloor3D,
  unprojectToFloor3D,
  model3DFromConfig,
  DEFAULT_CAMERA_HEIGHT_M,
  DEFAULT_PITCH_DEG,
  DEFAULT_FOCAL_LENGTH_PX,
  DEFAULT_PRINCIPAL_POINT,
} from './camera3d'

export function solveHomography(pairs) {
  const a = []
  const b = []
  pairs.forEach(([sx, sy, tx, ty]) => {
    a.push([-sx, -sy, -1, 0, 0, 0, tx * sx, tx * sy])
    b.push(-tx)
    a.push([0, 0, 0, -sx, -sy, -1, ty * sx, ty * sy])
    b.push(-ty)
  })
  const n = 8
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
    if (Math.abs(a[pivot][col]) < 1e-10) return null
    ;[a[col], a[pivot]] = [a[pivot], a[col]]
    ;[b[col], b[pivot]] = [b[pivot], b[col]]
    const divisor = a[col][col]
    for (let j = col; j < n; j++) a[col][j] /= divisor
    b[col] /= divisor
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = a[row][col]
      for (let j = col; j < n; j++) a[row][j] -= factor * a[col][j]
      b[row] -= factor * b[col]
    }
  }
  return [...b, 1]
}

export function projectFloor(matrix, x, z) {
  if (!matrix) return null
  const denominator = matrix[6] * x + matrix[7] * z + matrix[8]
  if (!denominator) return null
  return [(matrix[0] * x + matrix[1] * z + matrix[2]) / denominator, (matrix[3] * x + matrix[4] * z + matrix[5]) / denominator]
}

// Altura a la que se "levantan" las góndolas al dibujarlas sobre el frame: la homografía
// proyecta el footprint en el piso, y para que se vean paradas (con perspectiva, no "desde
// arriba") se proyecta a esta altura la cara superior.
export const GONDOLA_TOP_HEIGHT_M = 1.6

/**
 * Proyecta un punto del piso (x, z en metros) elevado `height` metros sobre el piso,
 * usando la homografía metros→normalizado + un punto de fuga vertical derivado de la
 * misma homografía (asume cámara pinhole, un solo focal, punto principal en el centro,
 * sin roll). Devuelve [u, v] normalizado (0..1) o null si no se puede estimar.
 */
export function projectFloorAtHeight(matrix, frameWidth, frameHeight, x, z, height) {
  if (!matrix || !height) return projectFloor(matrix, x, z)
  const W = frameWidth || 1
  const H = frameHeight || 1
  const g1 = [matrix[0] * W, matrix[3] * H, matrix[6]]
  const g2 = [matrix[1] * W, matrix[4] * H, matrix[7]]
  const g3 = [matrix[2] * W, matrix[5] * H, matrix[8]]
  const px = W / 2
  const py = H / 2
  const f2 = -((g1[0] - px) * (g2[0] - px) + (g1[1] - py) * (g2[1] - py)) / (g1[2] * g2[2])
  if (!Number.isFinite(f2) || f2 <= 0) return null
  const focal = Math.sqrt(f2)
  if (focal < 100 || focal > 30000) return null
  let r1 = [(g1[0] - px) / focal, (g1[1] - py) / focal, g1[2]]
  let r2 = [(g2[0] - px) / focal, (g2[1] - py) / focal, g2[2]]
  const n1 = Math.hypot(...r1)
  const n2 = Math.hypot(...r2)
  if (n1 < 1e-9 || n2 < 1e-9) return null
  r1 = r1.map((value) => value / n1)
  r2 = r2.map((value) => value / n2)
  const r3 = [
    r1[1] * r2[2] - r1[2] * r2[1],
    r1[2] * r2[0] - r1[0] * r2[2],
    r1[0] * r2[1] - r1[1] * r2[0],
  ]
  const addend = [focal * r3[0] + px * r3[2], focal * r3[1] + py * r3[2], r3[2]]
  const raise = (sx, sz, hh, sign) => {
    const bx = g1[0] * sx + g2[0] * sz + g3[0]
    const by = g1[1] * sx + g2[1] * sz + g3[1]
    const bw = g1[2] * sx + g2[2] * sz + g3[2]
    if (Math.abs(bw) < 1e-9) return null
    const w = bw + sign * hh * addend[2]
    if (Math.abs(w) < 1e-9) return null
    return [(bx + sign * hh * addend[0]) / w / W, (by + sign * hh * addend[1]) / w / H]
  }
  const base = raise(x, z, 0, 1)
  if (!base) return null
  const up = raise(x, z, height, -1)
  const down = raise(x, z, height, 1)
  if (up && up[1] < base[1]) return up
  if (down && down[1] < base[1]) return down
  return null
}

// Corners (floor meters) of a gondola's footprint, honoring its `rotation` (degrees,
// clockwise, about its own center) — used everywhere a gondola outline gets drawn
// on top of a video frame, so rotated shelves don't show up as an unrotated box.
export function gondolaCorners(gondola) {
  const cx = gondola.x + gondola.width / 2
  const cz = gondola.z + gondola.depth / 2
  const theta = ((gondola.rotation || 0) * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const hw = gondola.width / 2
  const hd = gondola.depth / 2
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [cx + u * cos - v * sin, cz + u * sin + v * cos])
}

export const forwardHomography = (camera) => {
  // Always compute the 2D homography from the visual calibration points. This is the base
  // projection for all video overlays - it matches exactly what the user traced on the frame.
  const source = camera?.source_normalized
  const target = camera?.target_meters
  if (!source || !target || source.length !== 4 || target.length !== 4) return null
  return solveHomography(source.map(([sx, sy], index) => [sx, sy, target[index][0], target[index][1]]))
}

export const inverseHomography = (camera) => {
  // Always compute the 2D inverse homography for video overlay projection.
  const source = camera?.source_normalized
  const target = camera?.target_meters
  if (!source || !target || source.length !== 4 || target.length !== 4) return null
  return solveHomography(target.map(([tx, tz], index) => [tx, tz, source[index][0], source[index][1]]))
}

/**
 * Check if3D camera model is available and enabled.
 */
export const has3DModel = (camera) => {
  return camera?.model_3d?.enabled === true && camera?.model_3d_projection != null
}

/**
 * Build3D projection matrices from camera config.
 * Returns { projection, inverse_projection } or null.
 */
export const build3DProjection = (camera, floorWidth, floorDepth) => {
  if (!camera?.model_3d?.enabled) return null
  return model3DFromConfig(camera, floorWidth, floorDepth)
}

/**
 * Project a point using the best available method.
 * Uses3D model when enabled, falls back to homography.
 * Returns [u, v] in normalized coords (0..1).
 */
export const projectPoint = (camera, x, y = 0, z) => {
  if (has3DModel(camera)) {
    const model = model3DFromConfig(camera, 10, 8) // Default floor, should be passed from context
    if (model) {
      const result = projectFloor3D(model.projection, x, z, y)
      if (result) return result
    }
  }
  // Fallback to 2D homography
  const matrix = forwardHomography(camera)
  if (matrix) {
    return projectFloor(matrix, x, z)
  }
  return null
}

/**
 * Unproject a normalized image point to floor coordinates.
 * Uses3D model when enabled, falls back to homography.
 * Returns [x, z] in floor meters.
 */
export const unprojectPoint = (camera, u, v, height = 0) => {
  if (has3DModel(camera)) {
    const model = model3DFromConfig(camera, 10, 8) // Default floor, should be passed from context
    if (model?.inverse_projection) {
      return unprojectToFloor3D(model.inverse_projection, u, v, height)
    }
  }
  // Fallback to 2D homography
  const matrix = inverseHomography(camera)
  if (matrix) {
    return projectFloor(matrix, u, v)
  }
  return null
}