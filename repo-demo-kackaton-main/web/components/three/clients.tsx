'use client'

import dynamic from 'next/dynamic'

export const PlanogramPreview3DClient = dynamic(
  () => import('@/components/setup/PlanogramPreview3D'),
  { ssr: false },
)

export const StoreSceneClient = dynamic(() => import('@/components/analysis/StoreScene'), {
  ssr: false,
})

export default PlanogramPreview3DClient