export function isSiteConfigured(site) {
  const configuration = site?.configuration || {}
  const camera = configuration.camera || {}
  const floor = configuration.floor || {}
  const gondolas = Array.isArray(configuration.gondolas) ? configuration.gondolas : []

  const hasSourcePoints = Array.isArray(camera.source_normalized) && camera.source_normalized.length === 4
  const hasTargetPoints = Array.isArray(camera.target_meters) && camera.target_meters.length === 4
  const hasFloorSize = Number(floor.width) > 0 && Number(floor.depth) > 0

  return camera.calibration_status === 'calibrated' && hasSourcePoints && hasTargetPoints && hasFloorSize && gondolas.length > 0
}
