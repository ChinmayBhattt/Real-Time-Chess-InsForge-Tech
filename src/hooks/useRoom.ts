import { useState, useCallback } from 'react'
import { insforge } from '../lib/insforge'
import { useAuth } from '../contexts/AuthContext'

interface Room {
  id: string
  code: string
  host_id: string
  guest_id: string | null
  status: string
  winner_id: string | null
  fen: string
  created_at: string
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export function useRoom() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createRoom = useCallback(async (): Promise<Room | null> => {
    if (!user) return null
    setLoading(true)
    setError(null)

    try {
      const code = generateRoomCode()
      const { data, error: dbError } = await insforge.database
        .from('rooms')
        .insert([{
          code,
          host_id: user.id,
          status: 'waiting',
        }])
        .select()

      if (dbError) {
        setError(dbError.message)
        return null
      }

      return data?.[0] as Room
    } catch (err) {
      setError((err as Error).message)
      return null
    } finally {
      setLoading(false)
    }
  }, [user])

  const joinRoom = useCallback(async (code: string): Promise<Room | null> => {
    if (!user) return null
    setLoading(true)
    setError(null)

    try {
      // Find room by code
      const { data: rooms, error: findError } = await insforge.database
        .from('rooms')
        .select()
        .eq('code', code.toUpperCase())
        .eq('status', 'waiting')

      if (findError) {
        setError(findError.message)
        return null
      }

      if (!rooms || rooms.length === 0) {
        setError('Room not found or already full')
        return null
      }

      const room = rooms[0] as Room

      if (room.host_id === user.id) {
        setError('You cannot join your own room')
        return null
      }

      // Join room
      const { data, error: updateError } = await insforge.database
        .from('rooms')
        .update({
          guest_id: user.id,
          status: 'playing',
        })
        .eq('id', room.id)
        .select()

      if (updateError) {
        setError(updateError.message)
        return null
      }

      return data?.[0] as Room
    } catch (err) {
      setError((err as Error).message)
      return null
    } finally {
      setLoading(false)
    }
  }, [user])

  const getRoom = useCallback(async (roomId: string): Promise<Room | null> => {
    const { data, error: dbError } = await insforge.database
      .from('rooms')
      .select()
      .eq('id', roomId)
      .maybeSingle()

    if (dbError) {
      setError(dbError.message)
      return null
    }

    return data as Room | null
  }, [])

  const getUserRooms = useCallback(async (): Promise<Room[]> => {
    if (!user) return []

    const { data, error: dbError } = await insforge.database
      .from('rooms')
      .select()
      .order('created_at', { ascending: false })
      .limit(10)

    if (dbError) {
      console.error('Failed to fetch rooms:', dbError.message)
      return []
    }

    return (data || []) as Room[]
  }, [user])

  return {
    createRoom,
    joinRoom,
    getRoom,
    getUserRooms,
    loading,
    error,
    clearError: () => setError(null),
  }
}
