import { useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Grid, Line, OrbitControls, Text, useTexture } from '@react-three/drei'
import { artifactUrl } from '../api/client'

const metricField = { traffic: 'traffic', dwell: 'dwell_seconds', interaction: 'interactions' }

function HeatmapFloor({ floor, textures, sliceIndex }) {
  const texture = textures[Math.min(sliceIndex, textures.length - 1)]
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
      <planeGeometry args={[floor.width, floor.depth]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} opacity={0.82} />
    </mesh>
  )
}

function Shelf({ item, floor, selected, mode, maxValue, onSelect }) {
  const x = item.x + item.width / 2 - floor.width / 2
  const z = item.z + item.depth / 2 - floor.depth / 2
  const intensity = (item[metricField[mode]] || 0) / maxValue
  const accent = selected ? '#d9ff6b' : intensity > 0.45 ? '#ff6a3d' : '#3c665c'
  return (
    <group position={[x, 0, z]} onClick={(event) => { event.stopPropagation(); onSelect(item.id) }}>
      <mesh position={[0, 0.76, 0]} castShadow>
        <boxGeometry args={[item.width, 1.45, item.depth]} />
        <meshStandardMaterial color="#18312b" emissive={accent} emissiveIntensity={0.2 + intensity * 0.8} />
      </mesh>
      {[0.25, 0.73, 1.2].map((height) => <mesh position={[0, height, 0]} key={height}><boxGeometry args={[item.width + 0.08, 0.05, item.depth + 0.1]} /><meshStandardMaterial color={accent} /></mesh>)}
      <Text position={[0, 1.62, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.16} color="#e1ece7">{item.name}</Text>
      {mode === 'interaction' && intensity > 0 && <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.65, 0.72 + intensity * 0.35, 40]} /><meshBasicMaterial color="#ff6a3d" /></mesh>}
    </group>
  )
}

function Store({ result, mode, selectedId, onSelect, heatmapUrl, sliceEntries, sliceIndex, analysisId }) {
  const configuration = result.site.configuration
  const floor = configuration.floor
  const maxValue = Math.max(...result.gondolas.map((item) => item[metricField[mode]] || 0), 1)
  const trajectories = result.trajectories.slice(0, 80)
  const urls = useMemo(
    () => (sliceEntries.length ? sliceEntries.map((entry) => artifactUrl(analysisId, entry[mode])) : [heatmapUrl]),
    [sliceEntries, analysisId, heatmapUrl, mode],
  )
  const textures = useTexture(urls)
  return (
    <>
      <color attach="background" args={['#07100e']} />
      <ambientLight intensity={1.25} /><directionalLight position={[5, 9, 4]} intensity={2.3} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[floor.width, floor.depth]} /><meshStandardMaterial color="#0d1916" /></mesh>
      <HeatmapFloor floor={floor} textures={textures} sliceIndex={sliceIndex} />
      <Grid args={[floor.width, floor.depth]} cellSize={1} cellColor="#29463d" sectionSize={4} sectionColor="#527065" fadeDistance={22} position={[0, 0.035, 0]} />
      {result.gondolas.map((item) => <Shelf key={item.id} item={item} floor={floor} selected={selectedId === item.id} mode={mode} maxValue={maxValue} onSelect={onSelect} />)}
      {mode === 'dwell' && trajectories.map((trajectory) => <Line key={trajectory.track_id} points={trajectory.points.map(([x, z]) => [x - floor.width / 2, 0.07, z - floor.depth / 2])} color="#70efd0" lineWidth={1.3} transparent opacity={0.75} />)}
      <OrbitControls makeDefault minDistance={5} maxDistance={20} maxPolarAngle={Math.PI / 2.08} target={[0, 0.3, 0]} />
    </>
  )
}

function TimeScrubber({ entries, mode, index, onChange }) {
  const current = entries[index]
  return (
    <div className="time-scrubber">
      <span className="scrub-label">{mode.toUpperCase()}</span>
      <input type="range" min="0" max={Math.max(0, entries.length - 1)} value={index} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="scrub-time">{current ? `${current.start}s – ${current.end}s` : ''}</span>
    </div>
  )
}

export default function StoreScene({ result, mode, selectedId, onSelect, heatmapUrl, slices, analysisId }) {
  const floor = result.site.configuration.floor
  const sliceEntries = useMemo(
    () => (slices || []).filter((entry) => entry[mode]),
    [slices, mode],
  )
  const [sliceIndex, setSliceIndex] = useState(0)
  useEffect(() => setSliceIndex(0), [mode, heatmapUrl, analysisId, sliceEntries.length])
  return (
    <div className="scene-canvas">
      <Canvas shadows camera={{ position: [floor.width * 0.7, 9, floor.depth * 0.8], fov: 43 }} dpr={[1, 1.5]}>
        <Store result={result} mode={mode} selectedId={selectedId} onSelect={onSelect} heatmapUrl={heatmapUrl} sliceEntries={sliceEntries} sliceIndex={sliceIndex} analysisId={analysisId} />
      </Canvas>
      {sliceEntries.length > 1 && <TimeScrubber entries={sliceEntries} mode={mode} index={sliceIndex} onChange={setSliceIndex} />}
      <span className="scene-hint">ARRASTRA · PELLIZCA · TOCA UNA GÓNDOLA</span>
    </div>
  )
}