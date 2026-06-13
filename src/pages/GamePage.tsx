import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useRoom } from '../hooks/useRoom'
import { useChessGame } from '../hooks/useChessGame'
import ChessBoard from '../components/ChessBoard'
import MoveList from '../components/MoveList'

interface RoomData {
  id: string
  code: string
  host_id: string
  guest_id: string | null
  status: string
  winner_id: string | null
  fen: string
}

export default function GamePage() {
  const { roomId } = useParams<{ roomId: string }>()
  const { user } = useAuth()
  const { getRoom } = useRoom()
  const navigate = useNavigate()

  const [room, setRoom] = useState<RoomData | null>(null)
  const [roomLoading, setRoomLoading] = useState(true)

  useEffect(() => {
    if (!roomId) return

    async function loadRoom() {
      const roomData = await getRoom(roomId!)
      if (!roomData) {
        navigate('/lobby')
        return
      }
      setRoom(roomData as RoomData)
      setRoomLoading(false)
    }

    void loadRoom()

    // Poll for guest join if waiting
    const interval = setInterval(async () => {
      const roomData = await getRoom(roomId!)
      if (roomData) {
        setRoom(roomData as RoomData)
        if ((roomData as RoomData).status !== 'waiting') {
          clearInterval(interval)
        }
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [roomId, getRoom, navigate])

  if (roomLoading || !room || !roomId) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading game...</p>
      </div>
    )
  }

  // Waiting for opponent
  if (room.status === 'waiting' && !room.guest_id) {
    return <WaitingScreen room={room} />
  }

  return (
    <ActiveGame
      roomId={roomId}
      room={room}
      userName={user?.name || 'Player'}
    />
  )
}

function WaitingScreen({ room }: { room: RoomData }) {
  return (
    <div className="waiting-screen">
      <div className="waiting-card glass-card">
        <div className="waiting-icon">♟</div>
        <h2>Waiting for Opponent</h2>
        <p>Share this room code:</p>
        <div className="room-code-display">
          <span className="room-code-text">{room.code}</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigator.clipboard.writeText(room.code)}
          >
            📋 Copy
          </button>
        </div>
        <div className="waiting-animation">
          <div className="dot-pulse">
            <span /><span /><span />
          </div>
        </div>
        <Link to="/lobby" className="btn btn-ghost">← Back to Lobby</Link>
      </div>
    </div>
  )
}

interface ActiveGameProps {
  roomId: string
  room: RoomData
  userName: string
}

function ActiveGame({ roomId, room, userName }: ActiveGameProps) {
  const {
    gameState,
    selectSquare,
    resign,
    offerDraw,
    acceptDraw,
    declineDraw,
    connected,
    opponentOnline,
    playerColor,
    isMyTurn,
  } = useChessGame({
    roomId,
    hostId: room.host_id,
    guestId: room.guest_id,
    initialFen: room.fen,
  })

  const [showResignConfirm, setShowResignConfirm] = useState(false)

  const opponentColor = playerColor === 'w' ? 'Black' : 'White'
  const myColorName = playerColor === 'w' ? 'White' : 'Black'

  return (
    <div className="game-page">
      <nav className="game-nav">
        <Link to="/lobby" className="nav-back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15,18 9,12 15,6" />
          </svg>
          Lobby
        </Link>
        <div className="game-nav-info">
          <span className="room-badge">Room: {room.code}</span>
          <span className={`connection-status ${connected ? 'online' : 'offline'}`}>
            {connected ? '● Connected' : '○ Connecting...'}
          </span>
        </div>
      </nav>

      <main className="game-main">
        {/* Opponent info bar */}
        <div className="player-bar opponent-bar">
          <div className="player-info">
            <div className={`player-piece ${playerColor === 'w' ? 'black-piece' : 'white-piece'}`}>
              {playerColor === 'w' ? '♚' : '♔'}
            </div>
            <div className="player-details">
              <span className="player-name">{opponentColor}</span>
              <span className={`player-status ${opponentOnline ? 'online' : 'offline'}`}>
                {opponentOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
          {!isMyTurn && !gameState.isGameOver && (
            <span className="turn-indicator thinking">Thinking...</span>
          )}
        </div>

        {/* Chessboard */}
        <ChessBoard
          board={gameState.board}
          playerColor={playerColor}
          selectedSquare={gameState.selectedSquare}
          legalMoves={gameState.legalMoves}
          lastMove={gameState.lastMove}
          isCheck={gameState.isCheck}
          turn={gameState.turn}
          onSquareClick={selectSquare}
          isGameOver={gameState.isGameOver}
        />

        {/* My info bar */}
        <div className="player-bar my-bar">
          <div className="player-info">
            <div className={`player-piece ${playerColor === 'w' ? 'white-piece' : 'black-piece'}`}>
              {playerColor === 'w' ? '♔' : '♚'}
            </div>
            <div className="player-details">
              <span className="player-name">{userName} ({myColorName})</span>
              <span className="player-status online">You</span>
            </div>
          </div>
          {isMyTurn && !gameState.isGameOver && (
            <span className="turn-indicator your-turn">Your turn</span>
          )}
        </div>

        {/* Game status messages */}
        {gameState.isCheck && !gameState.isGameOver && (
          <div className="game-alert check-alert">
            <span>⚠ Check!</span>
          </div>
        )}

        {gameState.isGameOver && gameState.gameResult && gameState.gameResult !== 'draw_offered' && (
          <div className="game-over-overlay">
            <div className="game-over-card glass-card">
              <h2>Game Over</h2>
              <p className="game-result">{gameState.gameResult}</p>
              <div className="game-over-actions">
                <Link to="/lobby" className="btn btn-primary">Back to Lobby</Link>
                <Link to="/leaderboard" className="btn btn-ghost">View Leaderboard</Link>
              </div>
            </div>
          </div>
        )}

        {/* Draw offer notification */}
        {gameState.gameResult === 'draw_offered' && !gameState.isGameOver && (
          <div className="game-over-overlay">
            <div className="game-over-card glass-card">
              <h2>Draw Offered</h2>
              <p>Your opponent is offering a draw.</p>
              <div className="game-over-actions">
                <button onClick={acceptDraw} className="btn btn-primary">Accept Draw</button>
                <button onClick={declineDraw} className="btn btn-ghost">Decline</button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Sidebar */}
      <aside className="game-sidebar">
        <MoveList moves={gameState.moveHistory} />

        {!gameState.isGameOver && (
          <div className="game-controls">
            <button
              onClick={offerDraw}
              className="btn btn-ghost btn-sm"
              id="offer-draw-btn"
            >
              ½ Offer Draw
            </button>
            {!showResignConfirm ? (
              <button
                onClick={() => setShowResignConfirm(true)}
                className="btn btn-danger btn-sm"
                id="resign-btn"
              >
                🏳 Resign
              </button>
            ) : (
              <div className="resign-confirm">
                <span>Are you sure?</span>
                <button onClick={() => { void resign(); setShowResignConfirm(false) }} className="btn btn-danger btn-sm">
                  Yes, Resign
                </button>
                <button onClick={() => setShowResignConfirm(false)} className="btn btn-ghost btn-sm">
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}
