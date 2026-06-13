import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { insforge } from '../lib/insforge'

interface LeaderboardEntry {
  user_id: string
  display_name: string
  wins: number
  losses: number
  draws: number
  rating: number
  games_played: number
}

export default function LeaderboardPage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadLeaderboard() {
      const { data } = await insforge.database
        .from('leaderboard')
        .select()
        .order('rating', { ascending: false })
        .limit(50)

      if (data) {
        setEntries(data as LeaderboardEntry[])
      }
      setLoading(false)
    }

    void loadLeaderboard()
  }, [])

  function getMedalEmoji(rank: number): string {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `#${rank}`
  }

  function getWinRate(entry: LeaderboardEntry): string {
    if (entry.games_played === 0) return '—'
    return Math.round((entry.wins / entry.games_played) * 100) + '%'
  }

  return (
    <div className="leaderboard-page">
      <nav className="lobby-nav">
        <div className="nav-brand">
          <Link to="/lobby" className="nav-back-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15,18 9,12 15,6" />
            </svg>
          </Link>
          <span className="logo-icon">♚</span>
          <span className="nav-title">Leaderboard</span>
        </div>
      </nav>

      <main className="leaderboard-main">
        <div className="leaderboard-header">
          <h1>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
            Rankings
          </h1>
          <p className="leaderboard-subtitle">Top players ranked by Elo rating</p>
        </div>

        {loading ? (
          <div className="loading-screen compact">
            <div className="loading-spinner" />
            <p>Loading rankings...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="leaderboard-empty glass-card">
            <div className="empty-icon">♟</div>
            <h2>No games played yet</h2>
            <p>Be the first to complete a game and appear on the leaderboard!</p>
            <Link to="/lobby" className="btn btn-primary">Play Now</Link>
          </div>
        ) : (
          <div className="leaderboard-table-container glass-card">
            <table className="leaderboard-table" id="leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Rating</th>
                  <th>W</th>
                  <th>L</th>
                  <th>D</th>
                  <th>Games</th>
                  <th>Win %</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => {
                  const rank = idx + 1
                  const isMe = entry.user_id === user?.id
                  return (
                    <tr
                      key={entry.user_id}
                      className={`leaderboard-row ${isMe ? 'my-row' : ''} ${rank <= 3 ? 'top-three' : ''}`}
                    >
                      <td className="rank-cell">
                        <span className={`rank ${rank <= 3 ? `rank-${rank}` : ''}`}>
                          {getMedalEmoji(rank)}
                        </span>
                      </td>
                      <td className="player-cell">
                        <span className="player-avatar-sm">{entry.display_name[0]?.toUpperCase()}</span>
                        <span className="player-name-text">
                          {entry.display_name}
                          {isMe && <span className="you-badge">You</span>}
                        </span>
                      </td>
                      <td className="rating-cell">
                        <span className="rating-value">{entry.rating}</span>
                      </td>
                      <td className="stat-cell win">{entry.wins}</td>
                      <td className="stat-cell loss">{entry.losses}</td>
                      <td className="stat-cell draw">{entry.draws}</td>
                      <td className="stat-cell">{entry.games_played}</td>
                      <td className="stat-cell">{getWinRate(entry)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
