export function isSiteConfigured(site) {
  const configuration = site?.configuration || {}
  const floor = configuration.floor || {}
  const gondolas = Array.isArray(configuration.gondolas) ? configuration.gondolas : []

  return hasFloorSize(floor) && gondolas.length > 0
}

export function isMetricCalibrated(site) {
  const configuration = site?.configuration || {}
  const camera = configuration.camera || {}
  const floor = configuration.floor || {}

  const hasSourcePoints = Array.isArray(camera.source_normalized) && camera.source_normalized.length === 4
  const hasTargetPoints = Array.isArray(camera.target_meters) && camera.target_meters.length === 4

  return camera.calibration_status === 'calibrated' && hasSourcePoints && hasTargetPoints && hasFloorSize(floor)
}

export function calibrationStatusLabel(site) {
  if (isMetricCalibrated(site)) return 'Calibrada'
  if (isSiteConfigured(site)) return 'Modo rapido'
  return 'Pendiente'
}

function hasFloorSize(floor) {
  return Number(floor?.width) > 0 && Number(floor?.depth) > 0
}
