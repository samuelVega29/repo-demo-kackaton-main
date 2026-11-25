import { useEffect, useRef } from 'react'
import { getAnalysis, getAnalysisStatus } from '../services/analyses'

const POLL_INTERVAL_MS = 1000

export function useJobPolling(job, setJob) {
  const { id, status } = job || {}
  const completedRef = useRef(false)
  useEffect(() => {
    if (!id || ['completed', 'failed'].includes(status) || completedRef.current) return
    let stopped = false
    const active = () => !stopped && !completedRef.current
    const tick = async () => {
      if (!active()) return
      try {
        const statusData = await getAnalysisStatus(id)
        if (!active()) return
        if (statusData.status === 'completed') {
          completedRef.current = true
          const detail = await getAnalysis(id)
          if (!stopped) setJob(detail)
          return
        }
        if (statusData.status === 'failed') {
          setJob((current) => ({ ...current, status: 'failed', stage: statusData.stage, progress: statusData.progress, message: statusData.message }))
          return
        }
        setJob((current) => ({ ...current, status: statusData.status, stage: statusData.stage, progress: statusData.progress, message: statusData.message }))
      } catch (error) {
        if (!stopped) setJob((current) => ({ ...current, status: 'failed', message: error.message }))
      }
    }
    const timer = window.setInterval(tick, POLL_INTERVAL_MS)
    tick()
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [id, status, setJob])
}