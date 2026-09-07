import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import useRetailWorkspace from '../hooks/useRetailWorkspace'
import AppLayout from '../layouts/AppLayout'
import LoginPage from '../pages/LoginPage'
import ResultsPage from '../pages/ResultsPage'
import RetailerPickerPage from '../pages/RetailerPickerPage'
import SitePickerPage from '../pages/SitePickerPage'
import UploadPage from '../pages/UploadPage'

function getWorkspacePath({ job, site, retailer }) {
  if (job?.result) return '/results'
  if (site) return '/upload'
  if (retailer) return '/sites'
  return '/retailers'
}

export default function AppRouter() {
  const { user, checking, logout } = useAuth()
  const workspace = useRetailWorkspace(user, logout)
  const navigate = useNavigate()

  if (checking) {
    return (
      <div className="grid h-screen place-items-center bg-[#07100e] font-mono text-xl font-bold tracking-[0.18em] text-white">
        SCAPDER <span className="ml-2 text-xs text-teal-300">INITIALIZING</span>
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  const selectRetailer = (selectedRetailer) => {
    workspace.setRetailer(selectedRetailer)
    navigate('/sites')
  }

  const selectSite = (selectedSite) => {
    workspace.setSite(selectedSite)
    navigate('/upload')
  }

  const goHome = () => {
    workspace.goHome()
    navigate('/retailers')
  }

  const goBackToRetailers = () => {
    workspace.setRetailer(null)
    workspace.setSite(null)
    navigate('/retailers')
  }

  const createSite = async (values) => {
    await workspace.createSite(values)
    navigate('/upload')
  }

  return (
    <Routes>
      <Route
        element={
          <AppLayout
            user={user}
            retailer={workspace.retailer}
            site={workspace.site}
            onHome={goHome}
            onLogout={() => {
              logout()
              navigate('/login')
            }}
          />
        }
      >
        <Route
          path="/retailers"
          element={<RetailerPickerPage retailers={workspace.retailers} onSelect={selectRetailer} />}
        />
        <Route
          path="/sites"
          element={
            workspace.retailer ? (
              <SitePickerPage
                retailer={workspace.retailer}
                sites={workspace.sites}
                onSelect={selectSite}
                onBack={goBackToRetailers}
                onCreate={createSite}
              />
            ) : (
              <Navigate to="/retailers" replace />
            )
          }
        />
        <Route
          path="/upload"
          element={
            workspace.site && !workspace.job?.result ? (
              <UploadPage
                site={workspace.site}
                file={workspace.file}
                preview={workspace.preview}
                chooseFile={workspace.chooseFile}
                inputRef={workspace.inputRef}
                analyze={workspace.analyze}
                job={workspace.job}
                updateConfiguration={workspace.updateConfiguration}
                saveConfiguration={workspace.saveConfiguration}
                frameCapture={workspace.frameCapture}
                onFrameCapture={workspace.handleFrameCapture}
                onSuggestGondolas={workspace.suggestGondolas}
              />
            ) : (
              <Navigate to={workspace.site ? '/results' : '/retailers'} replace />
            )
          }
        />
        <Route
          path="/results"
          element={
            workspace.job?.result ? (
              <ResultsPage
                analysis={workspace.job}
                mode={workspace.mode}
                setMode={workspace.setMode}
                selectedId={workspace.selectedId}
                setSelectedId={workspace.setSelectedId}
                closeDetail={() => workspace.setSelectedId(null)}
              />
            ) : (
              <Navigate to={workspace.site ? '/upload' : '/retailers'} replace />
            )
          }
        />
        <Route
          path="*"
          element={
            <Navigate to={getWorkspacePath(workspace)} replace />
          }
        />
      </Route>
    </Routes>
  )
}
