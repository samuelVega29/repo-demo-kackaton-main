import { useMemo, useState } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { Grid, Line, OrbitControls, Text } from '@react-three/drei'

const productRows = ['Superior', 'Media', 'Inferior']
const productColumns = ['Izquierda', 'Centro', 'Derecha']

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

function PreviewShelf({ item, floor, selected, onSelect }) {
  const x = item.x + item.width / 2 - floor.width / 2
  const z = item.z + item.depth / 2 - floor.depth / 2
  const accent = selected ? '#d9ff6b' : '#3c665c'
  const facade = useMemo(() => {
    if (!selected) return null
    const products = item.products || [[]]
    return { front: buildFacadeTexture(products), back: buildFacadeTexture(products, true) }
  }, [selected, item.products, item.id])
  return (
    <group position={[x, 0, z]} onClick={(event) => { event.stopPropagation(); onSelect(item.id) }}>
      <mesh position={[0, 0.76, 0]} castShadow>
        <boxGeometry args={[item.width, 1.45, item.depth]} />
        <meshStandardMaterial color="#18312b" emissive={accent} emissiveIntensity={selected ? 0.35 : 0.15} />
      </mesh>
      {[0.25, 0.73, 1.2].map((height) => <mesh position={[0, height, 0]} key={height}><boxGeometry args={[item.width + 0.08, 0.05, item.depth + 0.1]} /><meshStandardMaterial color={accent} /></mesh>)}
      <Text position={[0, 1.62, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.16} color="#e1ece7">{item.name}</Text>
      {facade && (
        <>
          <mesh position={[0, 0.9, item.depth / 2 + 0.06]}>
            <planeGeometry args={[item.width, 0.95]} />
            <meshBasicMaterial map={facade.front} transparent />
          </mesh>
          <mesh position={[0, 0.9, -item.depth / 2 - 0.06]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[item.width, 0.95]} />
            <meshBasicMaterial map={facade.back} transparent />
          </mesh>
        </>
      )}
    </group>
  )
}

function PreviewStore({ configuration, selectedId, onSelect }) {
  const floor = configuration.floor
  const gondolas = configuration.gondolas || []
  return (
    <>
      <color attach="background" args={['#07100e']} />
      <ambientLight intensity={1.25} /><directionalLight position={[5, 9, 4]} intensity={2.3} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[floor.width, floor.depth]} /><meshStandardMaterial color="#0d1916" /></mesh>
      <Grid args={[floor.width, floor.depth]} cellSize={1} cellColor="#29463d" sectionSize={4} sectionColor="#527065" fadeDistance={22} position={[0, 0.035, 0]} />
      {gondolas.map((item) => <PreviewShelf key={item.id} item={item} floor={floor} selected={selectedId === item.id} onSelect={onSelect} />)}
      <OrbitControls makeDefault minDistance={5} maxDistance={20} maxPolarAngle={Math.PI / 2.08} target={[0, 0.3, 0]} />
    </>
  )
}

export default function PlanogramPreview3D({ configuration, onSelect }) {
  const floor = configuration.floor
  const [selectedId, setSelectedId] = useState(null)
  const geometry = configuration.gondolas || []
  const isEmpty = geometry.length === 0
  return (
    <div className="relative h-[560px] min-h-[360px] overflow-hidden bg-[#07100e]">
      <Canvas shadows camera={{ position: [floor.width * 0.7, 9, floor.depth * 0.8], fov: 43 }} dpr={[1, 1.5]}>
        <PreviewStore
          configuration={configuration}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); if (onSelect) onSelect(id) }}
        />
      </Canvas>
      {isEmpty && <div className="absolute inset-0 grid place-items-center p-8 text-center text-sm text-slate-500">Aún no hay góndolas. Dibuja tu planograma para verlo en 3D.</div>}
      <span className="absolute bottom-4 left-4 z-10 font-mono text-[10px] uppercase tracking-widest text-slate-400">VISTA 3D DEL PLANO · ARRASTRA · SELECCIONA UNA GÓNDOLA</span>
    </div>
  )
}

