import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'

export default function RequireAuth() {
  const { user, checking } = useAuth()
  if (checking) return (
    <div className="grid h-screen place-items-center text-[20px] font-bold font-[ui-monospace,monospace] tracking-[.18em]">
      SCAPDER <span className="text-[8px] text-[#61dec0]">INITIALIZING</span>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}