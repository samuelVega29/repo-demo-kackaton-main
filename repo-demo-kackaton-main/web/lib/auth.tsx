'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { api, getToken, setToken, getStoredUser, setStoredUser } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser())
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function validate() {
      if (!getToken()) {
        if (!cancelled) setChecking(false)
        return
      }
      try {
        const me = await api('/api/auth/me')
        const current = getStoredUser()
        if (!cancelled) {
          setStoredUser(current || me)
          setUser(current || me)
        }
      } catch {
        setToken(null)
        setStoredUser(null)
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setChecking(false)
      }
    }
    validate()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const payload = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setToken(payload.access_token)
    setStoredUser(payload.user || payload)
    setUser(payload.user || payload)
    return payload
  }, [])

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      // noop
    }
    setToken(null)
    setStoredUser(null)
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ user, checking, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}