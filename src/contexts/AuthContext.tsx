import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { insforge } from '../lib/insforge'

interface User {
  id: string
  email: string
  name?: string
  avatar_url?: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  signUp: (email: string, password: string, name: string) => Promise<{ requireVerification: boolean; error?: string }>
  verifyEmail: (email: string, otp: string) => Promise<{ error?: string }>
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signInWithOAuth: (provider: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signUp: async () => ({ requireVerification: false }),
  verifyEmail: async () => ({}),
  signIn: async () => ({}),
  signInWithOAuth: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function hydrateAuth() {
      const { data, error } = await insforge.auth.getCurrentUser()
      if (cancelled) return
      if (error || !data?.user) {
        setUser(null)
      } else {
        const token = (insforge as any).tokenManager?.getAccessToken()
        if (token) {
          insforge.setAccessToken(token)
        }
        setUser({
          id: data.user.id,
          email: data.user.email,
          name: data.user.profile?.name || data.user.email.split('@')[0],
          avatar_url: data.user.profile?.avatar_url,
        })
      }
      setLoading(false)
    }

    void hydrateAuth()
    return () => { cancelled = true }
  }, [])

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { data, error } = await insforge.auth.signUp({
      email,
      password,
      name,
    })

    if (error) return { requireVerification: false, error: error.message }

    if (data?.requireEmailVerification) {
      return { requireVerification: true }
    }

    if (data?.accessToken && data?.user) {
      insforge.setAccessToken(data.accessToken)
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.profile?.name || email.split('@')[0],
        avatar_url: data.user.profile?.avatar_url,
      })
      return { requireVerification: false }
    }

    return { requireVerification: false }
  }, [])

  const verifyEmail = useCallback(async (email: string, otp: string) => {
    const { data, error } = await insforge.auth.verifyEmail({ email, otp })
    if (error) return { error: error.message }

    if (data?.accessToken) {
      insforge.setAccessToken(data.accessToken)
    }

    if (data?.user) {
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.profile?.name || email.split('@')[0],
        avatar_url: data.user.profile?.avatar_url,
      })
    }
    return {}
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await insforge.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.statusCode === 403) return { error: 'Email not verified. Please check your inbox.' }
      return { error: error.message }
    }

    if (data?.accessToken) {
      insforge.setAccessToken(data.accessToken)
    }

    if (data?.user) {
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.profile?.name || email.split('@')[0],
        avatar_url: data.user.profile?.avatar_url,
      })
    }
    return {}
  }, [])

  const signInWithOAuth = useCallback(async (provider: string) => {
    await insforge.auth.signInWithOAuth(provider, {
      redirectTo: window.location.origin + '/lobby',
    })
  }, [])

  const signOut = useCallback(async () => {
    await insforge.auth.signOut()
    insforge.setAccessToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, signUp, verifyEmail, signIn, signInWithOAuth, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
