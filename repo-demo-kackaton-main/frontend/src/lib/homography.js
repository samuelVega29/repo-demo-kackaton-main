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

export const forwardHomography = (camera) => {
  const source = camera?.source_normalized
  const target = camera?.target_meters
  if (!source || !target || source.length !== 4 || target.length !== 4) return null
  return solveHomography(source.map(([sx, sy], index) => [sx, sy, target[index][0], target[index][1]]))
}

export const inverseHomography = (camera) => {
  const source = camera?.source_normalized
  const target = camera?.target_meters
  if (!source || !target || source.length !== 4 || target.length !== 4) return null
  return solveHomography(target.map(([tx, tz], index) => [tx, tz, source[index][0], source[index][1]]))
}