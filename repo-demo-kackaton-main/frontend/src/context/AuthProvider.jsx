import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken } from '../services/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(Boolean(getToken()))

  useEffect(() => {
    if (!getToken()) return
    api('/api/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setChecking(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const response = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    setToken(response.access_token)
    setUser(response.user)
  }, [])

  const logout = useCallback(() => {
    api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setToken(null)
    setUser(null)
  }, [])
  return <AuthContext.Provider value={{ user, checking, login, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
