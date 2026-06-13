import { useEffect, useRef } from 'react'
import type { Move } from 'chess.js'

interface MoveListProps {
  moves: Move[]
}

export default function MoveList({ moves }: MoveListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [moves.length])

  // Group moves into pairs (white, black)
  const movePairs: { number: number; white: string; black?: string }[] = []
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      number: Math.floor(i / 2) + 1,
      white: moves[i].san,
      black: moves[i + 1]?.san,
    })
  }

  return (
    <div className="move-list" id="move-list">
      <h3 className="move-list-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        Moves
      </h3>
      <div className="move-list-scroll" ref={scrollRef}>
        {movePairs.length === 0 ? (
          <p className="move-list-empty">No moves yet</p>
        ) : (
          movePairs.map((pair) => (
            <div key={pair.number} className="move-pair">
              <span className="move-number">{pair.number}.</span>
              <span className={`move-san ${pair.number === movePairs.length && !pair.black ? 'current-move' : ''}`}>
                {pair.white}
              </span>
              {pair.black && (
                <span className={`move-san ${pair.number === movePairs.length ? 'current-move' : ''}`}>
                  {pair.black}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
