import { createRef, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { Billboard, Grid, Line, OrbitControls, Text, useTexture } from '@react-three/drei'
import { artifactUrl } from '../services/analyses'
import { ROWS as productRows, COLUMNS as productColumns } from '../utils/constants'

const metricField = { traffic: 'traffic', dwell: 'dwell_seconds', interaction: 'interactions', pickup: 'pickups' }

const ZONE_COLORS = {
  'Entrada': '#5b9dff',
  'Pasillo Izquierdo': '#61dec0',
  'Pasillo Derecho': '#61dec0',
}
const defaultZoneColor = '#61dec0'

function HeatmapFloor({ floor, textures, sliceIndex }) {
  const texture = textures[Math.min(sliceIndex, textures.length - 1)]
  const materialRef = useRef(null)
  // A slow breathing glow keeps the floor feeling alive instead of a flat, static overlay.
  useFrame(({ clock }) => {
    if (materialRef.current) materialRef.current.opacity = 0.8 + Math.sin(clock.elapsedTime * 1.1) * 0.08
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
      <planeGeometry args={[floor.width, floor.depth]} />
      <meshBasicMaterial ref={materialRef} map={texture} transparent depthWrite={false} opacity={0.88} blending={THREE.AdditiveBlending} toneMapped={false} />
    </mesh>
  )
}

function ZoneOverlay({ zone, floor }) {
  const polygon = zone.polygon
  if (!polygon || polygon.length < 3) return null
  const color = ZONE_COLORS[zone.name] || defaultZoneColor
  const shape = useMemo(() => {
    const s = new THREE.Shape()
    polygon.forEach(([x, z], i) => {
      const px = x - floor.width / 2
      const pz = z - floor.depth / 2
      if (i === 0) s.moveTo(px, pz)
      else s.lineTo(px, pz)
    })
    s.closePath()
    return s
  }, [polygon, floor.width, floor.depth])
  return (
    <group position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial color={color} transparent opacity={0.07} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* Zone border as a line on the floor */}
      <Line
        points={[...polygon, polygon[0]].map(([x, z]) => [x - floor.width / 2, z - floor.depth / 2, 0])}
        color={color}
        lineWidth={1.2}
        transparent
        opacity={0.35}
        dashed
        dashScale={8}
      />
      {/* Zone label */}
      <Billboard position={[polygon[0][0] - floor.width / 2 + 0.5, polygon[0][1] - floor.depth / 2 + 0.5, 0.01]}>
        <Text fontSize={0.15} color={color} anchorY="bottom" outlineWidth={0.008} outlineColor="#07100e">{zone.name}</Text>
      </Billboard>
    </group>
  )
}

function buildFacadeTexture(products, flip) {
  const W = 600
  const H = 300
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0b1714'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#dfffd9'
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cellW = W / 3
  const cellH = H / 3
  productRows.forEach((row, r) => {
    productColumns.forEach((_, c) => {
      const name = products?.[r]?.[c] || '—'
      const cx = c * cellW + cellW / 2
      const cy = r * cellH + cellH / 2
      if (flip) { ctx.save(); ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0) }
      ctx.strokeStyle = 'rgba(120, 210, 185, .35)'
      ctx.lineWidth = 2
      ctx.strokeRect(c * cellW + 8, r * cellH + 8, cellW - 16, cellH - 16)
      let label = name
      if (name.length > 16) label = name.slice(0, 15) + '…'
      ctx.fillStyle = '#c9f2e1'
      ctx.fillText(label, cx, cy - 10)
      ctx.font = '13px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(160, 210, 195, .7)'
      ctx.fillText(`${row} · ${productColumns[c]}`, cx, cy + 18)
      if (flip) ctx.restore()
    })
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.flipY = false
  texture.anisotropy = 4
  return texture
}

function Shelf({ item, floor, selected, mode, maxValue, onSelect }) {
  const x = item.x + item.width / 2 - floor.width / 2
  const z = item.z + item.depth / 2 - floor.depth / 2
  const intensity = (item[metricField[mode]] || 0) / maxValue
  const accent = selected ? '#d9ff6b' : intensity > 0.45 ? '#ff6a3d' : '#3c665c'
  const facade = useMemo(() => {
    if (!selected) return null
    const products = item.products || [[]]
    return { front: buildFacadeTexture(products), back: buildFacadeTexture(products, true) }
  }, [selected, item.products, item.id])
  const rotationY = -THREE.MathUtils.degToRad(item.rotation || 0)
  const edgeColor = selected ? '#d9ff6b' : '#4a7a6a'

  // Use real height and tier_heights from item data, with defaults
  const shelfHeight = item.height ?? 1.45
  const tierHeights = item.tier_heights ?? [0.25, 0.73, 1.20]
  const bodyCenterY = shelfHeight / 2

  return (
    <group position={[x, 0, z]} rotation={[0, rotationY, 0]} onClick={(event) => { event.stopPropagation(); onSelect(item.id) }}>
      {/* Main shelf body */}
      <mesh position={[0, bodyCenterY, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, shelfHeight, item.depth]} />
        <meshStandardMaterial color="#18312b" emissive={accent} emissiveIntensity={0.15 + intensity * 0.7} roughness={0.6} metalness={0.1} />
      </mesh>
      {/* Edge highlight — thin bright frame around the shelf body */}
      <lineSegments position={[0, bodyCenterY, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(item.width + 0.02, shelfHeight + 0.02, item.depth + 0.02)]} />
        <lineBasicMaterial color={edgeColor} transparent opacity={selected ? 0.9 : 0.4} />
      </lineSegments>
      {/* Shelf bars — horizontal tiers with subtle glow */}
      {tierHeights.map((tierHeight) => (
        <group key={tierHeight}>
          <mesh position={[0, tierHeight, 0]}>
            <boxGeometry args={[item.width + 0.08, 0.05, item.depth + 0.1]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.3} roughness={0.3} metalness={0.4} />
          </mesh>
          {/* Shelf bar edge glow */}
          <mesh position={[0, tierHeight, 0]}>
            <boxGeometry args={[item.width + 0.1, 0.06, item.depth + 0.12]} />
            <meshBasicMaterial color={accent} transparent opacity={0.08 + intensity * 0.06} depthWrite={false} />
          </mesh>
        </group>
      ))}
      {/* Dimension label below gondola */}
      <Billboard position={[0, -0.15, 0]}>
        <Text fontSize={0.1} color="#5a8a7a" anchorY="top" outlineWidth={0.005} outlineColor="#07100e">
          {`${item.width.toFixed(1)}×${item.depth.toFixed(1)}×${shelfHeight.toFixed(1)}m`}
        </Text>
      </Billboard>
      {/* Gondola name label above */}
      <Text position={[0, shelfHeight + 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.16} color="#e1ece7" outlineWidth={0.01} outlineColor="#07100e">{item.name}</Text>
      {/* Interaction ring pulse */}
      {mode === 'interaction' && intensity > 0 && (
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.65, 0.72 + intensity * 0.35, 40]} />
          <meshBasicMaterial color="#ff6a3d" transparent opacity={0.7} />
        </mesh>
      )}
      {/* Product facade when selected */}
      {facade && (
        <>
          <mesh position={[0, bodyCenterY, item.depth / 2 + 0.06]}>
            <planeGeometry args={[item.width, shelfHeight * 0.65]} />
            <meshBasicMaterial map={facade.front} transparent />
          </mesh>
          <mesh position={[0, bodyCenterY, -item.depth / 2 - 0.06]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[item.width, shelfHeight * 0.65]} />
            <meshBasicMaterial map={facade.back} transparent />
          </mesh>
        </>
      )}
    </group>
  )
}

const PERSON_COLORS = { INTERACTION: '#ff7a45', ENGAGED: '#d9ff6b', APPROACH: '#8fd6c4', PASS: '#65a893' }

// COCO skeleton bone connections — pairs of keypoint indices.
// Each bone gets its own color for visual depth; joints inherit the person's state color.
const SKELETON_BONES = [
  [5, 6],  // shoulders
  [5, 7],  // left upper arm
  [7, 9],  // left forearm
  [6, 8],  // right upper arm
  [8, 10], // right forearm
  [5, 11], // left torso
  [6, 12], // right torso
  [11, 12],// hips
  [11, 13],// left thigh
  [13, 15],// left shin
  [12, 14],// right thigh
  [14, 16],// right shin
  [0, 1],  // nose → left eye
  [0, 2],  // nose → right eye
  [1, 3],  // left eye → left ear
  [2, 4],  // right eye → right ear
]
const BONE_COLORS = [
  '#65dfc2', '#4ec9a1', '#38b385', '#4ec9a1', '#38b385',
  '#8fd6c4', '#8fd6c4', '#65dfc2',
  '#70efd0', '#58d4b5', '#70efd0', '#58d4b5',
  '#a3e8d8', '#a3e8d8', '#a3e8d8', '#a3e8d8',
]
const SKELETON_JOINT_COLOR = '#dffff2'

// One pooled avatar slot: a glowing ground ring + a small capsule body. Pooling (instead of
// mounting/unmounting a mesh per person) keeps this cheap even with many concurrent tracks,
// and every visual property is set imperatively in PeopleLayer's useFrame for smooth motion.
const _skeletonGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)])
const _jointGeometry = new THREE.SphereGeometry(0.07, 8, 8)
const _jointMaterial = new THREE.MeshBasicMaterial({ color: SKELETON_JOINT_COLOR, toneMapped: false })
const _reachGeometry = new THREE.SphereGeometry(0.05, 8, 8)
const _reachMaterial = new THREE.MeshBasicMaterial({ color: '#ff7a45', toneMapped: false, transparent: true, opacity: 0.9 })

function Person({ slot, label }) {
  const bonesRef = useRef([])
  const jointsRef = useRef([])

  useEffect(() => {
    const group = slot.group.current
    if (!group) return
    const bones = SKELETON_BONES.map((_, i) => {
      const mat = new THREE.LineBasicMaterial({ color: BONE_COLORS[i], toneMapped: false })
      const mesh = new THREE.Line(_skeletonGeometry.clone(), mat)
      mesh.visible = false
      group.add(mesh)
      return mesh
    })
    const joints = Array.from({ length: 17 }, () => {
      const mesh = new THREE.Mesh(_jointGeometry, _jointMaterial)
      mesh.visible = false
      group.add(mesh)
      return mesh
    })
    // Reach indicator (highlights the hands during interaction)
    const reachLeft = new THREE.Mesh(_reachGeometry, _reachMaterial)
    const reachRight = new THREE.Mesh(_reachGeometry, _reachMaterial)
    reachLeft.visible = false
    reachRight.visible = false
    group.add(reachLeft)
    group.add(reachRight)

    bonesRef.current = bones
    jointsRef.current = joints
    return () => {
      bones.forEach((mesh) => { group.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose() })
      joints.forEach((mesh) => { group.remove(mesh) })
    }
  }, [slot.group])

  return (
    <group ref={slot.group} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.24, 24]} />
        <meshBasicMaterial ref={slot.ring} color="#65dfc2" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <capsuleGeometry args={[0.13, 0.62, 4, 8]} />
        <meshStandardMaterial ref={slot.body} color="#0c1f1a" emissive="#65dfc2" emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[0, 0.98, 0]}>
        <sphereGeometry args={[0.11, 12, 12]} />
        <meshStandardMaterial ref={slot.head} color="#0c1f1a" emissive="#dffff2" emissiveIntensity={0.6} />
      </mesh>
      {/* Reach indicator meshes (created imperatively, references stored on slot) */}
      <mesh ref={slot.reachLeftRef} position={[0, 0.9, 0.2]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#ff7a45" transparent opacity={0.85} toneMapped={false} />
      </mesh>
      <mesh ref={slot.reachRightRef} position={[0, 0.9, 0.2]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#ff7a45" transparent opacity={0.85} toneMapped={false} />
      </mesh>
      {label && (
        <Billboard position={[0, 1.3, 0]}>
          <Text fontSize={0.14} color="#e7fff3" outlineWidth={0.012} outlineColor="#07120e" anchorY="bottom">{label}</Text>
        </Billboard>
      )}
    </group>
  )
}

// Walks a pool of avatars through `samples` (result.frame_detections, already computed by the
// backend but never wired to the UI) — looping over `timeWindow` and lerping each track's
// floor position between the two neighboring samples so motion reads as walking, not teleporting.
// Track ids keep a stable pool slot for as long as they're active, so an avatar doesn't jump
// between visual identities frame to frame.
function PeopleLayer({ samples, floor, timeWindow, poolSize }) {
  const pool = useMemo(
    () => Array.from({ length: Math.max(1, Math.min(40, poolSize)) }, () => ({
      group: createRef(), ring: createRef(), body: createRef(), head: createRef(),
      reachLeftRef: createRef(), reachRightRef: createRef(),
      // Skeleton line segments + joint spheres — created imperatively, no React re-renders per frame
      skeletonBones: SKELETON_BONES.map(() => createRef()),
      skeletonJoints: Array.from({ length: 17 }, () => createRef()),
    })),
    [poolSize],
  )
  const slotByTrack = useRef(new Map())
  const freeSlots = useRef([])
  const clockRef = useRef(0)
  // Which track_id each pool slot is currently labeled with — kept in React state (unlike
  // position/color, set imperatively every frame) because it only changes when a slot changes
  // hands, so a normal re-render for the <Text> content is cheap and simpler than mutating
  // troika-three-text glyphs by hand.
  const [labels, setLabels] = useState(() => Array(pool.length).fill(null))
  const labelsRef = useRef(labels)
  labelsRef.current = labels

  useEffect(() => {
    slotByTrack.current = new Map()
    freeSlots.current = pool.map((_, index) => index)
    clockRef.current = 0
    pool.forEach((slot) => { if (slot.group.current) slot.group.current.visible = false })
    setLabels(Array(pool.length).fill(null))
  }, [samples, pool])

  useFrame((_, delta) => {
    if (!samples.length) return
    const [start, end] = timeWindow
    const duration = Math.max(0.6, end - start)
    clockRef.current = (clockRef.current + delta) % duration
    const virtual = start + clockRef.current

    let i = 0
    while (i < samples.length - 1 && samples[i + 1].timestamp <= virtual) i++
    const a = samples[i]
    const b = samples[Math.min(i + 1, samples.length - 1)]
    const span = Math.max(0.0001, b.timestamp - a.timestamp)
    const t = a === b ? 0 : Math.min(1, Math.max(0, (virtual - a.timestamp) / span))

    const mapA = new Map(a.detections.map((detection) => [detection.track_id, detection]))
    const mapB = new Map(b.detections.map((detection) => [detection.track_id, detection]))
    const activeIds = new Set([...mapA.keys(), ...mapB.keys()])

    let labelsChanged = false
    const nextLabels = labelsRef.current.slice()

    for (const [trackId, slotIndex] of slotByTrack.current) {
      if (!activeIds.has(trackId)) {
        slotByTrack.current.delete(trackId)
        freeSlots.current.push(slotIndex)
        const group = pool[slotIndex].group.current
        if (group) group.visible = false
        // Hide skeleton bones and joints when slot is freed
        pool[slotIndex].skeletonBones.forEach((ref) => { if (ref.current) ref.current.visible = false })
        pool[slotIndex].skeletonJoints.forEach((ref) => { if (ref.current) ref.current.visible = false })
        if (pool[slotIndex].reachLeftRef.current) pool[slotIndex].reachLeftRef.current.visible = false
        if (pool[slotIndex].reachRightRef.current) pool[slotIndex].reachRightRef.current.visible = false
        if (nextLabels[slotIndex] !== null) { nextLabels[slotIndex] = null; labelsChanged = true }
      }
    }

    activeIds.forEach((trackId) => {
      let slotIndex = slotByTrack.current.get(trackId)
      if (slotIndex === undefined) {
        slotIndex = freeSlots.current.pop()
        if (slotIndex === undefined) return
        slotByTrack.current.set(trackId, slotIndex)
        slot.state = undefined
        labelsChanged = true
      }
      const slot = pool[slotIndex]
      const rawA = mapA.get(trackId)
      const rawB = mapB.get(trackId)
      const from = (rawA || rawB).floor_point
      const to = (rawB || rawA).floor_point
      const x = from[0] + (to[0] - from[0]) * t
      const z = from[1] + (to[1] - from[1]) * t
      if (slot.group.current) {
        slot.group.current.visible = true
        slot.group.current.position.set(x - floor.width / 2, 0, z - floor.depth / 2)
      }
      const state = (rawB || rawA).state

      // Update the visible state label on the avatar so behavior is obvious.
      if (slot.state !== state) {
        slot.state = state
        const stateText = state ? ` · ${state}` : ''
        nextLabels[slotIndex] = `#${trackId}${stateText}`
        labelsChanged = true
      }
      const hot = state === 'INTERACTION'
      const color = PERSON_COLORS[state] || PERSON_COLORS.PASS

      // Update 3D skeleton bones + joints from keypoints_3d (only present when backend uses pose model).
      // The capsule/ring always stay visible (so a person is never lost); the skeleton is drawn
      // on top when pose data is available so arms and movement are visible.
      const sk3d = (rawB || rawA).keypoints_3d
      const hasSkeleton = !!(sk3d && sk3d.some(Boolean))
      if (slot.body.current) {
        slot.body.current.visible = true
        slot.body.current.emissive.set(hasSkeleton ? '#65dfc2' : color)
        slot.body.current.emissiveIntensity = hot ? 1.3 : 0.85
      }
      if (slot.head.current) slot.head.current.visible = true
      if (slot.ring.current) { slot.ring.current.color.set(color); slot.ring.current.opacity = hot ? 0.55 : 0.28 }

      // Track hand positions for interaction highlighting (joints 9=left_wrist, 10=right_wrist)
      let leftWrist3D = null
      let rightWrist3D = null

      for (let b = 0; b < SKELETON_BONES.length; b++) {
        const line = slot.skeletonBones[b]?.current
        if (!line) continue
        const [aIdx, bIdx] = SKELETON_BONES[b]
        const pa = sk3d?.[aIdx]
        const pb = sk3d?.[bIdx]
        const show = pa && pb
        line.visible = !!show
        if (show && line.geometry.attributes.position) {
          const pos = line.geometry.attributes.position
          pos.setXYZ(0, pa[0] - x, pa[2], pa[1] - z)
          pos.setXYZ(1, pb[0] - x, pb[2], pb[1] - z)
          pos.needsUpdate = true
        }
      }
      for (let j = 0; j < 17; j++) {
        const joint = slot.skeletonJoints[j]?.current
        if (!joint) continue
        const kp = sk3d?.[j]
        joint.visible = !!kp
        if (kp) {
          joint.position.set(kp[0] - x, kp[2], kp[1] - z)
          if (j === 9) leftWrist3D = kp
          if (j === 10) rightWrist3D = kp
        }
      }

      // Highlight hands (reach indicator) when person is engaged or interacting
      const reachVisible = state === 'INTERACTION' || state === 'ENGAGED'
      if (slot.reachLeftRef.current && leftWrist3D) {
        slot.reachLeftRef.current.visible = reachVisible
        slot.reachLeftRef.current.position.set(leftWrist3D[0] - x, leftWrist3D[2], leftWrist3D[1] - z)
      }
      if (slot.reachRightRef.current && rightWrist3D) {
        slot.reachRightRef.current.visible = reachVisible
        slot.reachRightRef.current.position.set(rightWrist3D[0] - x, rightWrist3D[2], rightWrist3D[1] - z)
      }
      if (!reachVisible) {
        if (slot.reachLeftRef.current) slot.reachLeftRef.current.visible = false
        if (slot.reachRightRef.current) slot.reachRightRef.current.visible = false
      }
    })

    if (labelsChanged) { labelsRef.current = nextLabels; setLabels(nextLabels) }
  })

  return <>{pool.map((slot, index) => <Person key={index} slot={slot} label={labels[index]} />)}</>
}

function Store({ result, mode, selectedId, onSelect, heatmapUrl, sliceEntries, sliceIndex, analysisId }) {
  const configuration = result.site.configuration
  const floor = configuration.floor
  const zones = configuration.zones || []
  const sceneGondolas = useMemo(() => {
    const gondolas = result.gondolas || []
    const video = result.video || {}
    const normalizedFloor = floor.width <= 1.5 && floor.depth <= 1.5
    const looksLikePixels = normalizedFloor && gondolas.some((item) => item.x > 2 || item.z > 2 || item.width > 2 || item.depth > 2)
    if (!looksLikePixels || !video.width || !video.height) return gondolas
    return gondolas.map((item) => ({
      ...item,
      x: item.x / video.width,
      z: item.z / video.height,
      width: item.width / video.width,
      depth: item.depth / video.height,
      height: Math.min(item.height || 1.45, 0.35),
      tier_heights: (item.tier_heights || [0.08, 0.18, 0.28]).map((height) => Math.min(height / video.height, 0.35)),
    }))
  }, [result.gondolas, result.video, floor.width, floor.depth])
  const maxValue = Math.max(...sceneGondolas.map((item) => item[metricField[mode]] || 0), 1)
  const trajectories = result.trajectories.slice(0, 80)
  const urls = useMemo(
    () => (sliceEntries.length ? sliceEntries.map((entry) => artifactUrl(analysisId, entry[mode])) : [heatmapUrl]),
    [sliceEntries, analysisId, heatmapUrl, mode],
  )
  const textures = useTexture(urls)

  // The window the scrubber currently points at (falls back to the whole video when there's
  // no per-mode slicing yet) — people animate on a loop inside it, in sync with the heatmap.
  const timeWindow = useMemo(() => {
    const current = sliceEntries[sliceIndex]
    return current ? [current.start, current.end] : [0, result.video.duration_seconds || 1]
  }, [sliceEntries, sliceIndex, result.video.duration_seconds])

  const peopleSamples = useMemo(() => {
    const all = result.frame_detections || []
    const [start, end] = timeWindow
    const windowed = all.filter((sample) => sample.timestamp >= start - 0.05 && sample.timestamp <= end + 0.05)
    return windowed.length ? windowed : all
  }, [result.frame_detections, timeWindow])

  return (
    <>
      <color attach="background" args={['#07100e']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 12, 4]} intensity={2.0} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-near={1} shadow-camera-far={25} shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} />
      <pointLight position={[-3, 6, -2]} intensity={0.4} color="#61dec0" />
      {/* Floor plane with shadow receiver */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[floor.width, floor.depth]} />
        <meshStandardMaterial color="#0d1916" roughness={0.9} metalness={0.05} />
      </mesh>
      <HeatmapFloor floor={floor} textures={textures} sliceIndex={sliceIndex} />
      <Grid args={[floor.width, floor.depth]} cellSize={1} cellColor="#29463d" sectionSize={4} sectionColor="#527065" fadeDistance={22} position={[0, 0.035, 0]} />
      {/* Zone overlays */}
      {zones.map((zone) => <ZoneOverlay key={zone.id} zone={zone} floor={floor} />)}
      {/* Floor outline */}
      {floor.outline?.length >= 3 && (
        // Blue on purpose — everything else glowing on this floor (shelves, the acid accent,
        // interaction rings) lives in the green/orange family; blue reads unambiguously as
        // "this is the real wall," not another gondola.
        <Line
          points={[...floor.outline, floor.outline[0]].map(([x, z]) => [x - floor.width / 2, 0.04, z - floor.depth / 2])}
          color="#5b9dff" lineWidth={1.8} dashed dashScale={5} transparent opacity={0.7}
        />
      )}
      {sceneGondolas.map((item) => <Shelf key={item.id} item={item} floor={floor} selected={selectedId === item.id} mode={mode} maxValue={maxValue} onSelect={onSelect} />)}
      {mode === 'dwell' && trajectories.map((trajectory) => <Line key={trajectory.track_id} points={trajectory.points.map(([x, z]) => [x - floor.width / 2, 0.07, z - floor.depth / 2])} color="#70efd0" lineWidth={1.3} transparent opacity={0.75} />)}
      <PeopleLayer samples={peopleSamples} floor={floor} timeWindow={timeWindow} poolSize={result.metrics?.peak_presence || 6} />
      <OrbitControls makeDefault minDistance={5} maxDistance={20} maxPolarAngle={Math.PI / 2.08} target={[0, 0.3, 0]} />
    </>
  )
}

function TimeScrubber({ entries, mode, index, onChange }) {
  const current = entries[index]
  return (
    <div className="pointer-events-auto absolute bottom-[34px] left-1/2 z-[4] flex -translate-x-1/2 items-center gap-3 border border-[#335046] bg-[rgba(5,11,9,.85)] p-[11px] px-[15px] text-[9px] font-medium font-[ui-monospace,monospace] text-[#a9c0b6] max-[760px]:bottom-3 max-[760px]:left-3 max-[760px]:max-w-[calc(100%-24px)] max-[760px]:translate-x-0">
      <span className="uppercase text-[#61dec0]">{mode.toUpperCase()}</span>
      <input type="range" className="w-[150px] accent-[#d4ff70] max-[760px]:w-auto max-[760px]:flex-1" min="0" max={Math.max(0, entries.length - 1)} value={index} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="whitespace-nowrap text-[#c5d4ce]">{current ? `${current.start}s – ${current.end}s` : ''}</span>
    </div>
  )
}

export default function StoreScene({ result, mode, selectedId, onSelect, heatmapUrl, slices, analysisId }) {
  const floor = result?.site?.configuration?.floor
  const sliceEntries = useMemo(
    () => (slices || []).filter((entry) => entry[mode]),
    [slices, mode],
  )
  const [sliceIndex, setSliceIndex] = useState(0)
  useEffect(() => setSliceIndex(0), [mode, heatmapUrl, analysisId, sliceEntries.length])
  if (!floor?.width || !floor?.depth) {
    return (
      <div className="grid h-full min-h-[520px] place-items-center px-6 text-center text-sm font-semibold leading-6 text-[#90a69d]">
        No hay plano 3D disponible para este analisis. Revisa la configuracion de la sede y vuelve a procesar el video.
      </div>
    )
  }
  return (
    <div className="absolute inset-0 [&_canvas]:touch-none">
      <Canvas shadows camera={{ position: [floor.width * 0.7, 9, floor.depth * 0.8], fov: 43 }} dpr={[1, 1.5]}>
        <Store result={result} mode={mode} selectedId={selectedId} onSelect={onSelect} heatmapUrl={heatmapUrl} sliceEntries={sliceEntries} sliceIndex={sliceIndex} analysisId={analysisId} />
      </Canvas>
      {sliceEntries.length > 1 && <TimeScrubber entries={sliceEntries} mode={mode} index={sliceIndex} onChange={setSliceIndex} />}
      <span className="pointer-events-none absolute bottom-5 left-[22px] text-[8px] font-medium font-[ui-monospace,monospace] tracking-[.1em] text-[#6c837a] max-[760px]:bottom-[14px] max-[760px]:left-[14px]">ARRASTRA · PELLIZCA · TOCA UNA GÓNDOLA</span>
    </div>
  )
}
