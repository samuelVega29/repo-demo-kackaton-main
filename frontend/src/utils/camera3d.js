/**
 * 3D camera model using pinhole projection.
 *
 * Provides projection from 3D world coordinates to 2D normalized image coordinates
 * and inverse operations for proper height-aware spatial analysis.
 *
 * World coordinate system: X = floor right, Y = up (height), Z = floor forward (depth).
 */

// Default camera parameters for typical retail security cameras
export const DEFAULT_CAMERA_HEIGHT_M = 2.8
export const DEFAULT_PITCH_DEG = -25.0
export const DEFAULT_YAW_DEG = 0.0
export const DEFAULT_ROLL_DEG = 0.0
export const DEFAULT_FOCAL_LENGTH_PX = 1200.0
export const DEFAULT_PRINCIPAL_POINT = [0.5, 0.5]

/**
 * Build a 3x3 rotation matrix from Euler angles (degrees).
 * Convention: pitch around X (tilt up/down), yaw around Y (pan left/right),
 * roll around Z (tilt sideways). Applied as R = Rz * Ry * Rx.
 */
function rotationMatrixFromEuler(pitchDeg, yawDeg, rollDeg) {
  const pitch = (pitchDeg * Math.PI) / 180
  const yaw = (yawDeg * Math.PI) / 180
  const roll = (rollDeg * Math.PI) / 180

  const cosP = Math.cos(pitch), sinP = Math.sin(pitch)
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw)
  const cosR = Math.cos(roll), sinR = Math.sin(roll)

  // Rx (pitch)
  const Rx = [
    [1, 0, 0],
    [0, cosP, -sinP],
    [0, sinP, cosP],
  ]
  // Ry (yaw)
  const Ry = [
    [cosY, 0, sinY],
    [0, 1, 0],
    [-sinY, 0, cosY],
  ]
  // Rz (roll)
  const Rz = [
    [cosR, -sinR, 0],
    [sinR, cosR, 0],
    [0, 0, 1],
  ]

  return matMul(matMul(Rz, Ry), Rx)
}

/**
 * Build the 3x4 projection matrix P = K [R | t] for 3D-to-2D projection.
 */
export function buildProjectionMatrix(model3d, floorWidth, floorDepth) {
  const height = model3d.height ?? DEFAULT_CAMERA_HEIGHT_M
  const pitch = model3d.pitch ?? DEFAULT_PITCH_DEG
  const yaw = model3d.yaw ?? DEFAULT_YAW_DEG
  const roll = model3d.roll ?? DEFAULT_ROLL_DEG
  const focal = model3d.focal_length ?? DEFAULT_FOCAL_LENGTH_PX
  const [cx, cy] = model3d.principal_point ?? DEFAULT_PRINCIPAL_POINT

  // Intrinsic matrix K
  const K = [
    [focal, 0, cx],
    [0, focal, cy],
    [0, 0, 1],
  ]

  // Rotation
  const R = rotationMatrixFromEuler(pitch, yaw, roll)

  // Camera position in world coordinates
  const cameraPos = [floorWidth / 2.0, height, 0.0]

  // Extrinsic [R | t] where t = -R * cameraPos
  const t = matVecMul(R, cameraPos).map((v) => -v)
  const extrinsic = [
    [...R[0], t[0]],
    [...R[1], t[1]],
    [...R[2], t[2]],
  ]

  // Full projection P = K @ extrinsic
  return matMul(K, extrinsic)
}

/**
 * Project a 3D world point to normalized image coordinates (u, v).
 */
export function project3D(P, x, y, z) {
  const pt = [x, y, z, 1.0]
  const projected = matVecMul4(P, pt)
  const w = projected[2]
  if (Math.abs(w) < 1e-10) return null
  const u = projected[0] / w
  const v = projected[1] / w
  return [u, v]
}

/**
 * Build the pseudoinverse of P for unprojection.
 */
export function buildInverseProjection(P) {
  return pseudoinverse3x4(P)
}

/**
 * Unproject a normalized image point to a 3D ray.
 * Returns { origin, direction }.
 */
export function unprojectToRay(PInv, u, v) {
  const pt = [u, v, 1.0]
  const worldPt = matVecMul3(PInv, pt)
  const w = worldPt[3] ?? 1.0
  const origin = [worldPt[0] / w, worldPt[1] / w, worldPt[2] / w]
  const norm = Math.sqrt(origin[0] ** 2 + origin[1] ** 2 + origin[2] ** 2)
  const direction = norm > 1e-10
    ? [origin[0] / norm, origin[1] / norm, origin[2] / norm]
    : [0, -1, 0]
  return { origin, direction }
}

/**
 * Intersect a ray with a horizontal plane at height planeY.
 */
export function rayPlaneIntersection(origin, direction, planeY) {
  if (Math.abs(direction[1]) < 1e-10) return null
  const t = (planeY - origin[1]) / direction[1]
  if (t < 0) return null
  return [
    origin[0] + t * direction[0],
    origin[1] + t * direction[1],
    origin[2] + t * direction[2],
  ]
}

/**
 * Unproject a normalized image point to floor coordinates (x, z) at given height.
 */
export function unprojectToFloor3D(PInv, u, v, floorY = 0.0) {
  const { origin, direction } = unprojectToRay(PInv, u, v)
  const point = rayPlaneIntersection(origin, direction, floorY)
  if (!point) return null
  return [point[0], point[2]]
}

/**
 * Project a floor point at given height to normalized image coordinates.
 */
export function projectFloor3D(P, x, z, y = 0.0) {
  return project3D(P, x, y, z)
}

/**
 * Build a3D model from camera config.
 * Returns { enabled, projection, inverse_projection, camera_center, params } or null.
 */
export function model3DFromConfig(camera, floorWidth, floorDepth) {
  const model = camera.model_3d
  if (!model?.enabled) return null

  const projection = buildProjectionMatrix(model, floorWidth, floorDepth)
  const inverseProjection = buildInverseProjection(projection)

  return {
    enabled: true,
    projection,
    inverse_projection: inverseProjection,
    params: {
      height: model.height ?? DEFAULT_CAMERA_HEIGHT_M,
      pitch: model.pitch ?? DEFAULT_PITCH_DEG,
      yaw: model.yaw ?? DEFAULT_YAW_DEG,
      roll: model.roll ?? DEFAULT_ROLL_DEG,
      focal_length: model.focal_length ?? DEFAULT_FOCAL_LENGTH_PX,
      principal_point: model.principal_point ?? [...DEFAULT_PRINCIPAL_POINT],
    },
  }
}

// ---- Matrix math helpers ----

function matMul(A, B) {
  const rowsA = A.length, colsA = A[0].length, colsB = B[0].length
  const result = Array.from({ length: rowsA }, () => Array(colsB).fill(0))
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      for (let k = 0; k < colsA; k++) {
        result[i][j] += A[i][k] * B[k][j]
      }
    }
  }
  return result
}

function matVecMul(M, v) {
  return M.map((row) => row.reduce((sum, val, i) => sum + val * v[i], 0))
}

function matVecMul4(M, v) {
  return M.map((row) => row.reduce((sum, val, i) => sum + val * v[i], 0))
}

function matVecMul3(M, v) {
  // M is 4x3, v is 3-element → returns 4-element
  return M.map((row) => row.slice(0, 3).reduce((sum, val, i) => sum + val * v[i], 0))
}

function pseudoinverse3x4(M) {
  // Simple pseudoinverse using transpose for 3x4 matrix
  // M is 3x4, M+ is 4x3
  const MT = transpose(M)
  const MTM = matMul(MT, M)
  const MTMInv = invert3x3(MTM)
  if (!MTMInv) return null
  return matMul(MTMInv, MT)
}

function transpose(M) {
  const rows = M.length, cols = M[0].length
  const result = Array.from({ length: cols }, () => Array(rows).fill(0))
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = M[i][j]
    }
  }
  return result
}

function invert3x3(M) {
  const [[a, b, c], [d, e, f], [g, h, i]] = M
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (Math.abs(det) < 1e-10) return null
  const invDet = 1 / det
  return [
    [(e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet],
    [(f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet],
    [(d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet],
  ]
}

/**
 * Unified projection function that uses3D model when available, falls back to homography.
 */
export function projectPoint(camera, x, y = 0, z) {
  if (camera.model_3d?.enabled && camera._model3d) {
    return project3D(camera._model3d.projection, x, y, z)
  }
  // Fallback to 2D homography
  if (camera._inverseHomography) {
    return projectFloor(camera._inverseHomography, x, z)
  }
  return null
}

/**
 * Unified unprojection function that uses3D model when available.
 */
export function unprojectPoint(camera, u, v, height = 0) {
  if (camera.model_3d?.enabled && camera._model3d) {
    return unprojectToFloor3D(camera._model3d.inverse_projection, u, v, height)
  }
  // Fallback to 2D homography
  if (camera._homography) {
    return projectFloor(camera._homography, u, v)
  }
  return null
}
