export const DEFAULT_CAMERA_HEIGHT_M = 2.8
export const DEFAULT_PITCH_DEG = -25.0
export const DEFAULT_YAW_DEG = 0.0
export const DEFAULT_ROLL_DEG = 0.0
export const DEFAULT_FOCAL_LENGTH_PX = 1200.0
export const DEFAULT_PRINCIPAL_POINT = [0.5, 0.5]

function rotationMatrixFromEuler(pitchDeg, yawDeg, rollDeg) {
  const pitch = (pitchDeg * Math.PI) / 180
  const yaw = (yawDeg * Math.PI) / 180
  const roll = (rollDeg * Math.PI) / 180

  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)
  const cosY = Math.cos(yaw)
  const sinY = Math.sin(yaw)
  const cosR = Math.cos(roll)
  const sinR = Math.sin(roll)

  const Rx = [
    [1, 0, 0],
    [0, cosP, -sinP],
    [0, sinP, cosP],
  ]
  const Ry = [
    [cosY, 0, sinY],
    [0, 1, 0],
    [-sinY, 0, cosY],
  ]
  const Rz = [
    [cosR, -sinR, 0],
    [sinR, cosR, 0],
    [0, 0, 1],
  ]

  return matMul(matMul(Rz, Ry), Rx)
}

export function buildProjectionMatrix(model3d, floorWidth, floorDepth) {
  const height = model3d.height ?? DEFAULT_CAMERA_HEIGHT_M
  const pitch = model3d.pitch ?? DEFAULT_PITCH_DEG
  const yaw = model3d.yaw ?? DEFAULT_YAW_DEG
  const roll = model3d.roll ?? DEFAULT_ROLL_DEG
  const focal = model3d.focal_length ?? DEFAULT_FOCAL_LENGTH_PX
  const [cx, cy] = model3d.principal_point ?? DEFAULT_PRINCIPAL_POINT

  const K = [
    [focal, 0, cx],
    [0, focal, cy],
    [0, 0, 1],
  ]

  const R = rotationMatrixFromEuler(pitch, yaw, roll)
  const cameraPos = [floorWidth / 2.0, height, 0.0]
  const t = matVecMul(R, cameraPos).map((v) => -v)
  const extrinsic = [
    [...R[0], t[0]],
    [...R[1], t[1]],
    [...R[2], t[2]],
  ]

  return matMul(K, extrinsic)
}

export function project3D(P, x, y, z) {
  const pt = [x, y, z, 1.0]
  const projected = matVecMul4(P, pt)
  const w = projected[2]
  if (Math.abs(w) < 1e-10) return null
  const u = projected[0] / w
  const v = projected[1] / w
  return [u, v]
}

export function buildInverseProjection(P) {
  return pseudoinverse3x4(P)
}

export function unprojectToRay(PInv, u, v) {
  const pt = [u, v, 1.0]
  const worldPt = matVecMul3(PInv, pt)
  const w = worldPt[3] ?? 1.0
  const origin = [worldPt[0] / w, worldPt[1] / w, worldPt[2] / w]
  const norm = Math.sqrt(origin[0] ** 2 + origin[1] ** 2 + origin[2] ** 2)
  const direction = norm > 1e-10 ? [origin[0] / norm, origin[1] / norm, origin[2] / norm] : [0, -1, 0]
  return { origin, direction }
}

export function rayPlaneIntersection(origin, direction, planeY) {
  if (Math.abs(direction[1]) < 1e-10) return null
  const t = (planeY - origin[1]) / direction[1]
  if (t < 0) return null
  return [origin[0] + t * direction[0], origin[1] + t * direction[1], origin[2] + t * direction[2]]
}

export function unprojectToFloor3D(PInv, u, v, floorY = 0.0) {
  const { origin, direction } = unprojectToRay(PInv, u, v)
  const point = rayPlaneIntersection(origin, direction, floorY)
  if (!point) return null
  return [point[0], point[2]]
}

export function projectFloor3D(P, x, z, y = 0.0) {
  return project3D(P, x, y, z)
}

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

function matMul(A, B) {
  const rowsA = A.length
  const colsA = A[0].length
  const colsB = B[0].length
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
  return M.map((row) => row.slice(0, 3).reduce((sum, val, i) => sum + val * v[i], 0))
}

function pseudoinverse3x4(M) {
  const MT = transpose(M)
  const MTM = matMul(MT, M)
  const MTMInv = invert3x3(MTM)
  if (!MTMInv) return null
  return matMul(MTMInv, MT)
}

function transpose(M) {
  const rows = M.length
  const cols = M[0].length
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