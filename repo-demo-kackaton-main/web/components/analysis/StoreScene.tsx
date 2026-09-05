'use client'

import { createRef, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { Billboard, Grid, Line, OrbitControls, Text, useTexture } from '@react-three/drei'
import { artifactUrl } from '@/lib/api'
import { ROWS as productRows, COLUMNS as productColumns } from '@/lib/constants'

const metricField = {
  traffic: 'traffic',
  dwell: 'dwell_seconds',
  interaction: 'interactions',
  pickup: 'pickups',
}

const ZONE_COLORS = {
  Entrada: '#5b9dff',
  'Pasillo Izquierdo': '#61dec0',
  'Pasillo Derecho': '#61dec0',
}
const defaultZoneColor = '#61dec0'

function HeatmapFloor({ floor, textures, sliceIndex }) {
  const texture = textures[Math.min(sliceIndex, textures.length - 1)]
  const materialRef = useRef(null)
  useFrame(({ clock }) => {
    if (materialRef.current)
      materialRef.current.opacity = 0.8 + Math.sin(clock.elapsedTime * 1.1) * 0.08
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
      <planeGeometry args={[floor.width, floor.depth]} />
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        transparent
        depthWrite={false}
        opacity={0.88}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
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
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.07}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Line
        points={[...polygon, polygon[0]].map(([x, z]) => [x - floor.width / 2, z - floor.depth / 2, 0])}
        color={color}
        lineWidth={1.2}
        transparent
        opacity={0.35}
        dashed
        dashScale={8}
      />
      <Billboard position={[polygon[0][0] - floor.width / 2 + 0.5, polygon[0][1] - floor.depth / 2 + 0.5, 0.01]}>
        <Text fontSize={0.15} color={color} anchorY="bottom" outlineWidth={0.008} outlineColor="#07100e">
          {zone.name}
        </Text>
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
      if (flip) {
        ctx.save()
        ctx.translate(cx, 0)
        ctx.scale(-1, 1)
        ctx.translate(-cx, 0)
      }
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

  const shelfHeight = item.height ?? 1.45
  const tierHeights = item.tier_heights ?? [0.25, 0.73, 1.2]
  const bodyCenterY = shelfHeight / 2

  return (
    <group
      position={[x, 0, z]}
      rotation={[0, rotationY, 0]}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(item.id)
      }}
    >
      <mesh position={[0, bodyCenterY, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, shelfHeight, item.depth]} />
        <meshStandardMaterial
          color="#18312b"
          emissive={accent}
          emissiveIntensity={0.15 + intensity * 0.7}
          roughness={0.6}
          metalness={0.1}
        />
      </mesh>
      <lineSegments position={[0, bodyCenterY, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(item.width + 0.02, shelfHeight + 0.02, item.depth + 0.02)]} />
        <lineBasicMaterial color={edgeColor} transparent opacity={selected ? 0.9 : 0.4} />
      </lineSegments>
      {tierHeights.map((tierHeight) => (
        <group key={tierHeight}>
          <mesh position={[0, tierHeight, 0]}>
            <boxGeometry args={[item.width + 0.08, 0.05, item.depth + 0.1]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.3} roughness={0.3} metalness={0.4} />
          </mesh>
          <mesh position={[0, tierHeight, 0]}>
            <boxGeometry args={[item.width + 0.1, 0.06, item.depth + 0.12]} />
            <meshBasicMaterial color={accent} transparent opacity={0.08 + intensity * 0.06} depthWrite={false} />
          </mesh>
        </group>
      ))}
      <Billboard position={[0, -0.15, 0]}>
        <Text fontSize={0.1} color="#5a8a7a" anchorY="top" outlineWidth={0.005} outlineColor="#07100e">
          {`${item.width.toFixed(1)}×${item.depth.toFixed(1)}×${shelfHeight.toFixed(1)}m`}
        </Text>
      </Billboard>
      <Text
        position={[0, shelfHeight + 0.15, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.16}
        color="#e1ece7"
        outlineWidth={0.01}
        outlineColor="#07100e"
      >
        {item.name}
      </Text>
      {mode === 'interaction' && intensity > 0 && (
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.65, 0.72 + intensity * 0.35, 40]} />
          <meshBasicMaterial color="#ff6a3d" transparent opacity={0.7} />
        </mesh>
      )}
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

const PERSON_COLORS = {
  INTERACTION: '#ff7a45',
  ENGAGED: '#d9ff6b',
  APPROACH: '#8fd6c4',
  PASS: '#65a893',
}

const SKELETON_BONES = [
  [5, 6],
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10],
  [5, 11],
  [6, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
]
const BONE_COLORS = [
  '#65dfc2', '#4ec9a1', '#38b385', '#4ec9a1', '#38b385',
  '#8fd6c4', '#8fd6c4', '#65dfc2',
  '#70efd0', '#58d4b5', '#70efd0', '#58d4b5',
  '#a3e8d8', '#a3e8d8', '#a3e8d8', '#a3e8d8',
]
const SKELETON_JOINT_COLOR = '#dffff2'

const _skeletonGeometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 0),
])
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
    const reachLeft = new THREE.Mesh(_reachGeometry, _reachMaterial)
    const reachRight = new THREE.Mesh(_reachGeometry, _reachMaterial)
    reachLeft.visible = false
    reachRight.visible = false
    group.add(reachLeft)
    group.add(reachRight)

    bonesRef.current = bones
    jointsRef.current = joints
    return () => {
      bones.forEach((mesh) => {
        group.remove(mesh)
        mesh.geometry.dispose()
        mesh.material.dispose()
      })
      joints.forEach((mesh) => {
        group.remove(mesh)
      })
    }
  }, [slot.group])

  return (
    <group ref={slot.group} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.24, 24]} />
        <meshBasicMaterial
          ref={slot.ring}
          color="#65dfc2"
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <capsuleGeometry args={[0.13, 0.62, 4, 8]} />
        <meshStandardMaterial ref={slot.body} color="#0c1f1a" emissive="#65dfc2" emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[0, 0.98, 0]}>
        <sphereGeometry args={[0.11, 12, 12]} />
        <meshStandardMaterial ref={slot.head} color="#0c1f1a" emissive="#dffff2" emissiveIntensity={0.6} />
      </mesh>
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
          <Text fontSize={0.14} color="#e7fff3" outlineWidth={0.012} outlineColor="#07120e" anchorY="bottom">
            {label}
          </Text>
        </Billboard>
      )}
    </group>
  )
}

function PeopleLayer({ samples, floor, timeWindow, poolSize }) {
  const pool = useMemo(
    () =>
      Array.from({ length: Math.max(1, Math.min(40, poolSize)) }, () => ({
        group: createRef(),
        ring: createRef(),
        body: createRef(),
        head: createRef(),
        reachLeftRef: createRef(),
        reachRightRef: createRef(),
        skeletonBones: SKELETON_BONES.map(() => createRef()),
        skeletonJoints: Array.from({ length: 17 }, () => createRef()),
      })),
    [poolSize],
  )
  const slotByTrack = useRef(new Map())
  const freeSlots = useRef([])
  const clockRef = useRef(0)
  const [labels, setLabels] = useState(() => Array(pool.length).fill(null))
  const labelsRef = useRef(labels)
  labelsRef.current = labels

  useEffect(() => {
    slotByTrack.current = new Map()
    freeSlots.current = pool.map((_, index) => index)
    clockRef.current = 0
    pool.forEach((slot) => {
      if (slot.group.current) slot.group.current.visible = false
    })
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
        pool[slotIndex].skeletonBones.forEach((ref) => {
          if (ref.current) ref.current.visible = false
        })
        pool[slotIndex].skeletonJoints.forEach((ref) => {
          if (ref.current) ref.current.visible = false
        })
        if (pool[slotIndex].reachLeftRef.current) pool[slotIndex].reachLeftRef.current.visible = false
        if (pool[slotIndex].reachRightRef.current) pool[slotIndex].reachRightRef.current.visible = false
        if (nextLabels[slotIndex] !== null) {
          nextLabels[slotIndex] = null
          labelsChanged = true
        }
      }
    }

    activeIds.forEach((trackId) => {
      let slotIndex = slotByTrack.current.get(trackId)
      if (slotIndex === undefined) {
        slotIndex = freeSlots.current.pop()
        if (slotIndex === undefined) return
        slotByTrack.current.set(trackId, slotIndex)
        pool[slotIndex].state = undefined
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

      if (slot.state !== state) {
        slot.state = state
        const stateText = state ? ` · ${state}` : ''
        nextLabels[slotIndex] = `#${trackId}${stateText}`
        labelsChanged = true
      }
      const hot = state === 'INTERACTION'
      const color = PERSON_COLORS[state] || PERSON_COLORS.PASS

      const sk3d = (rawB || rawA).keypoints_3d
      const hasSkeleton = !!(sk3d && sk3d.some(Boolean))
      if (slot.body.current) {
        slot.body.current.visible = true
        slot.body.current.emissive.set(hasSkeleton ? '#65dfc2' : color)
        slot.body.current.emissiveIntensity = hot ? 1.3 : 0.85
      }
      if (slot.head.current) slot.head.current.visible = true
      if (slot.ring.current) {
        slot.ring.current.color.set(color)
        slot.ring.current.opacity = hot ? 0.55 : 0.28
      }

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

    if (labelsChanged) {
      labelsRef.current = nextLabels
      setLabels(nextLabels)
    }
  })

  return (
    <>
      {pool.map((slot, index) => (
        <Person key={index} slot={slot} label={labels[index]} />
      ))}
    </>
  )
}

function Store({ result, mode, selectedId, onSelect, heatmapUrl, sliceEntries, sliceIndex, analysisId }) {
  const configuration = result.site.configuration
  const floor = configuration.floor
  const zones = configuration.zones || []
  const maxValue = Math.max(...result.gondolas.map((item) => item[metricField[mode]] || 0), 1)
  const trajectories = result.trajectories.slice(0, 80)
  const urls = useMemo(
    () =>
      sliceEntries.length ? sliceEntries.map((entry) => artifactUrl(analysisId, entry[mode])) : [heatmapUrl],
    [sliceEntries, analysisId, heatmapUrl, mode],
  )
  const textures = useTexture(urls)

  const timeWindow = useMemo(() => {
    const current = sliceEntries[sliceIndex]
    return current ? [current.start, current.end] : [0, result.video.duration_seconds || 1]
  }, [sliceEntries, sliceIndex, result.video.duration_seconds])

  const peopleSamples = useMemo(() => {
    const all = result.frame_detections || []
    const [start, end] = timeWindow
    const windowed = all.filter(
      (sample) => sample.timestamp >= start - 0.05 && sample.timestamp <= end + 0.05,
    )
    return windowed.length ? windowed : all
  }, [result.frame_detections, timeWindow])

  return (
    <>
      <color attach="background" args={['#07100e']} />
      <ambientLight intensity={0.8} />
      <directionalLight
        position={[5, 12, 4]}
        intensity={2.0}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={25}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <pointLight position={[-3, 6, -2]} intensity={0.4} color="#61dec0" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[floor.width, floor.depth]} />
        <meshStandardMaterial color="#0d1916" roughness={0.9} metalness={0.05} />
      </mesh>
      <HeatmapFloor floor={floor} textures={textures} sliceIndex={sliceIndex} />
      <Grid
        args={[floor.width, floor.depth]}
        cellSize={1}
        cellColor="#29463d"
        sectionSize={4}
        sectionColor="#527065"
        fadeDistance={22}
        position={[0, 0.035, 0]}
      />
      {zones.map((zone) => (
        <ZoneOverlay key={zone.id} zone={zone} floor={floor} />
      ))}
      {floor.outline?.length >= 3 && (
        <Line
          points={[...floor.outline, floor.outline[0]].map(([x, z]) => [
            x - floor.width / 2,
            0.04,
            z - floor.depth / 2,
          ])}
          color="#5b9dff"
          lineWidth={1.8}
          dashed
          dashScale={5}
          transparent
          opacity={0.7}
        />
      )}
      {result.gondolas.map((item) => (
        <Shelf
          key={item.id}
          item={item}
          floor={floor}
          selected={selectedId === item.id}
          mode={mode}
          maxValue={maxValue}
          onSelect={onSelect}
        />
      ))}
      {mode === 'dwell' &&
        trajectories.map((trajectory) => (
          <Line
            key={trajectory.track_id}
            points={trajectory.points.map(([x, z]) => [x - floor.width / 2, 0.07, z - floor.depth / 2])}
            color="#70efd0"
            lineWidth={1.3}
            transparent
            opacity={0.75}
          />
        ))}
      <PeopleLayer
        samples={peopleSamples}
        floor={floor}
        timeWindow={timeWindow}
        poolSize={result.metrics?.peak_presence || 6}
      />
      <OrbitControls
        makeDefault
        minDistance={5}
        maxDistance={20}
        maxPolarAngle={Math.PI / 2.08}
        target={[0, 0.3, 0]}
      />
    </>
  )
}

function TimeScrubber({ entries, mode, index, onChange }) {
  const current = entries[index]
  return (
    <div className="absolute bottom-10 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-panel/90 px-4 py-2 backdrop-blur">
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-mint">{mode}</span>
      <input
        type="range"
        min="0"
        max={Math.max(0, entries.length - 1)}
        value={index}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-40 accent-acid"
      />
      <span className="font-mono text-[11px] text-muted">
        {current ? `${current.start}s – ${current.end}s` : ''}
      </span>
    </div>
  )
}

export default function StoreScene({ result, mode, selectedId, onSelect, heatmapUrl, slices, analysisId }) {
  const floor = result.site.configuration.floor
  const sliceEntries = useMemo(() => (slices || []).filter((entry) => entry[mode]), [slices, mode])
  const [sliceIndex, setSliceIndex] = useState(0)
  useEffect(() => setSliceIndex(0), [mode, heatmapUrl, analysisId, sliceEntries.length])
  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-2xl border border-line bg-base lg:h-[460px]">
      <Canvas
        shadows
        camera={{ position: [floor.width * 0.7, 9, floor.depth * 0.8], fov: 43 }}
        dpr={[1, 1.5]}
      >
        <Store
          result={result}
          mode={mode}
          selectedId={selectedId}
          onSelect={onSelect}
          heatmapUrl={heatmapUrl}
          sliceEntries={sliceEntries}
          sliceIndex={sliceIndex}
          analysisId={analysisId}
        />
      </Canvas>
      {sliceEntries.length > 1 && (
        <TimeScrubber entries={sliceEntries} mode={mode} index={sliceIndex} onChange={setSliceIndex} />
      )}
      <span className="pointer-events-none absolute bottom-3 left-4 z-10 font-mono text-[9px] uppercase tracking-[0.18em] text-muted/70">
        ARRASTRA · PELLIZCA · TOCA UNA GÓNDOLA
      </span>
    </div>
  )
}