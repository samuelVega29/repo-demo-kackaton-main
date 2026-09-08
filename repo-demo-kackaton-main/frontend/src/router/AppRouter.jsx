import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import RequireAuth from './RequireAuth'
import AppLayout from '../layouts/AppLayout'
import LoginPage from '../pages/LoginPage'
import RetailersPage from '../pages/RetailersPage'
import SitePickerPage from '../pages/SitePickerPage'
import SiteDashboardPage from '../pages/SiteDashboardPage'
import UploadPage from '../pages/UploadPage'
import AnalysisAreaPage from '../pages/AnalysisAreaPage'
import ProcessingPage from '../pages/ProcessingPage'
import CapturePage from '../pages/CapturePage'
import CalibrationPage from '../pages/CalibrationPage'
import PlanogramPage from '../pages/PlanogramPage'
import ResultsPage from '../pages/ResultsPage'
import HistoryPage from '../pages/HistoryPage'
import { useApp } from '../context/AppProvider'

function SiteRouteGate({ resolve }) {
  const { site, loadSite } = useApp()
  const { siteId } = useParams()
  const [loading, setLoading] = useState(Boolean(siteId && (!site || String(site.id) !== String(siteId))))

  useEffect(() => {
    if (!siteId) {
      setLoading(false)
      return
    }
    if (site && String(site.id) === String(siteId)) {
      setLoading(false)
      return
    }
    setLoading(true)
    loadSite(siteId).catch(() => {}).finally(() => setLoading(false))
  }, [loadSite, site, siteId])

  if (loading) return <section className="grid min-h-[calc(100vh-72px)] place-items-center bg-[#f6f6f4] p-6 text-sm font-black text-[#7d8392]">Cargando sede</section>
  if (!site || String(site.id) !== String(siteId)) return <Navigate to="/empresas" replace />

  return <Navigate to={resolve(site, siteId)} replace />
}

const uploadNextRoute = (site, siteId) => `/sedes/${siteId}/analisis/nuevo/area`
const legacyAnalyzeRoute = (site, siteId) => `/sedes/${siteId}/analisis/nuevo`

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/empresas" replace />} />
          <Route path="/empresas" element={<RetailersPage />} />
          <Route path="/empresas/:retailerId/sedes" element={<SitePickerPage />} />
          <Route path="/sedes/:siteId" element={<SiteDashboardPage />} />
          <Route path="/sites/:siteId/video" element={<UploadPage />} />
          <Route path="/sedes/:siteId/analisis/nuevo" element={<UploadPage />} />
          <Route path="/sedes/:siteId/analisis/nuevo/siguiente" element={<SiteRouteGate resolve={uploadNextRoute} />} />
          <Route path="/sedes/:siteId/analisis/nuevo/area" element={<AnalysisAreaPage />} />
          <Route path="/sedes/:siteId/historial" element={<HistoryPage />} />
          <Route path="/sites/:siteId/captura" element={<CapturePage />} />
          <Route path="/sites/:siteId/calibracion" element={<CalibrationPage />} />
          <Route path="/sites/:siteId/planograma" element={<PlanogramPage />} />
          <Route path="/sites/:siteId/analizar" element={<SiteRouteGate resolve={legacyAnalyzeRoute} />} />
          <Route path="/historial" element={<HistoryPage />} />
          <Route path="/analyses/:analysisId/procesando" element={<ProcessingPage />} />
          <Route path="/analyses/:analysisId" element={<ResultsPage />} />
        </Route>
      </Route>
      <Route path="/usuarios" element={<Navigate to="/empresas" replace />} />
      <Route path="*" element={<Navigate to="/empresas" replace />} />
    </Routes>
  )
}
