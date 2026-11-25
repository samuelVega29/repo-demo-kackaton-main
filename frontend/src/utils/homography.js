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