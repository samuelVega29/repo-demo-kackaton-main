import { Outlet } from 'react-router-dom'
import Header from '../components/layout/Header'
import { useAuth } from '../context/AuthProvider'
import { useApp } from '../context/AppProvider'

export default function AppLayout() {
  const { user, logout } = useAuth()
  const { retailer, site, job, goHome } = useApp()
  return (
    <main className="min-h-screen flex flex-col">
      <Header user={user} logout={logout} retailer={retailer} site={site} job={job} goHome={goHome} />
      <Outlet />
    </main>
  )
}