import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useRoom } from '../hooks/useRoom'

interface Room {
  id: string
  code: string
  host_id: string
  guest_id: string | null
  status: string
  winner_id: string | null
  created_at: string
}

export default function LobbyPage() {
  const { user, signOut } = useAuth()
  const { createRoom, joinRoom, getUserRooms, loading, error, clearError } = useRoom()
  const navigate = useNavigate()

  const [joinCode, setJoinCode] = useState('')
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [recentRooms, setRecentRooms] = useState<Room[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    void loadRooms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadRooms() {
    const rooms = await getUserRooms()
    setRecentRooms(rooms)
  }

  async function handleCreateRoom() {
    clearError()
    const room = await createRoom()
    if (room) {
      setCreatedCode(room.code)
      setShowCreateModal(true)
    }
  }

  function handleGoToRoom() {
    if (createdCode) {
      // Reload rooms to get the new one
      void getUserRooms().then((rooms) => {
        const newRoom = rooms.find((r) => r.code === createdCode)
        if (newRoom) navigate(`/game/${newRoom.id}`)
      })
    }
  }

  async function handleJoinRoom(e: FormEvent) {
    e.preventDefault()
    clearError()
    if (!joinCode.trim()) return

    const room = await joinRoom(joinCode.trim())
    if (room) {
      navigate(`/game/${room.id}`)
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'waiting': return <span className="badge badge-waiting">Waiting</span>
      case 'playing': return <span className="badge badge-playing">In Progress</span>
      case 'finished': return <span className="badge badge-finished">Finished</span>
      default: return null
    }
  }

  return (
    <div className="lobby-page">
      <nav className="lobby-nav">
        <div className="nav-brand">
          <span className="logo-icon">♚</span>
          <span className="nav-title">MyChess</span>
        </div>
        <div className="nav-links">
          <Link to="/leaderboard" className="nav-link">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" />
            </svg>
            Leaderboard
          </Link>
          <div className="nav-user">
            <div className="user-avatar">
              {user?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <span className="user-name">{user?.name || 'Player'}</span>
            <button onClick={signOut} className="btn btn-ghost btn-sm" id="sign-out-btn">Sign Out</button>
          </div>
        </div>
      </nav>

      <main className="lobby-main">
        <div className="lobby-hero">
          <h1>Ready to Play?</h1>
          <p>Create a room and invite a friend, or join with a code.</p>
        </div>

        <div className="lobby-actions">
          <div className="action-card glass-card" id="create-room-card">
            <div className="action-icon">♔</div>
            <h2>Create Room</h2>
            <p>Start a new game and share the room code with a friend</p>
            <button
              onClick={handleCreateRoom}
              className="btn btn-primary"
              disabled={loading}
              id="create-room-btn"
            >
              {loading ? <span className="btn-spinner" /> : 'Create Room'}
            </button>
          </div>

          <div className="action-card glass-card" id="join-room-card">
            <div className="action-icon">♞</div>
            <h2>Join Room</h2>
            <p>Enter a room code to join an existing game</p>
            <form onSubmit={handleJoinRoom} className="join-form">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter code"
                maxLength={6}
                className="join-input"
                id="join-code-input"
              />
              <button type="submit" className="btn btn-accent" disabled={loading || joinCode.length < 6} id="join-room-btn">
                {loading ? <span className="btn-spinner" /> : 'Join'}
              </button>
            </form>
          </div>
        </div>

        {error && (
          <div className="lobby-error">
            <span>{error}</span>
            <button onClick={clearError} className="error-dismiss">×</button>
          </div>
        )}

        {recentRooms.length > 0 && (
          <div className="recent-games">
            <h2>Recent Games</h2>
            <div className="games-list">
              {recentRooms.map((room) => (
                <div
                  key={room.id}
                  className="game-item glass-card"
                  onClick={() => navigate(`/game/${room.id}`)}
                >
                  <div className="game-item-left">
                    <span className="game-code">{room.code}</span>
                    {getStatusBadge(room.status)}
                  </div>
                  <div className="game-item-right">
                    <span className="game-date">
                      {new Date(room.created_at).toLocaleDateString()}
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9,18 15,12 9,6" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Room Created Modal */}
      {showCreateModal && createdCode && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal glass-card" onClick={(e) => e.stopPropagation()} id="room-created-modal">
            <h2>Room Created!</h2>
            <p>Share this code with your opponent:</p>
            <div className="room-code-display">
              <span className="room-code-text">{createdCode}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => navigator.clipboard.writeText(createdCode)}
                id="copy-code-btn"
              >
                📋 Copy
              </button>
            </div>
            <p className="modal-hint">Waiting for opponent to join...</p>
            <button onClick={handleGoToRoom} className="btn btn-primary btn-full" id="go-to-room-btn">
              Go to Game Room
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
