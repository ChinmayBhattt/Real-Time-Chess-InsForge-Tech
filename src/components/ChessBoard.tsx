import type { PieceColor, PieceType, Square } from '../hooks/useChessGame'

const PIECE_UNICODE: Record<string, string> = {
  'wk': '♔', 'wq': '♕', 'wr': '♖', 'wb': '♗', 'wn': '♘', 'wp': '♙',
  'bk': '♚', 'bq': '♛', 'br': '♜', 'bb': '♝', 'bn': '♞', 'bp': '♟',
}

interface ChessBoardProps {
  board: Square[][]
  playerColor: PieceColor
  selectedSquare: string | null
  legalMoves: string[]
  lastMove: { from: string; to: string } | null
  isCheck: boolean
  turn: PieceColor
  onSquareClick: (square: string) => void
  isGameOver: boolean
}

function getPieceSymbol(type: PieceType, color: PieceColor): string {
  return PIECE_UNICODE[`${color}${type}`] || ''
}

function findKingSquare(board: Square[][], color: PieceColor): string | null {
  for (const row of board) {
    for (const sq of row) {
      if (sq.type === 'k' && sq.color === color) return sq.square
    }
  }
  return null
}

export default function ChessBoard({
  board,
  playerColor,
  selectedSquare,
  legalMoves,
  lastMove,
  isCheck,
  turn,
  onSquareClick,
  isGameOver,
}: ChessBoardProps) {
  // Flip board for black
  const displayBoard = playerColor === 'b' ? [...board].reverse().map((row) => [...row].reverse()) : board

  const kingInCheck = isCheck ? findKingSquare(board, turn) : null

  const fileLabels = playerColor === 'w'
    ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']

  const rankLabels = playerColor === 'w'
    ? ['8', '7', '6', '5', '4', '3', '2', '1']
    : ['1', '2', '3', '4', '5', '6', '7', '8']

  return (
    <div className="chessboard-container">
      <div className="chessboard" id="chessboard">
        {displayBoard.map((row, rankIdx) => (
          row.map((sq, fileIdx) => {
            const isLight = (rankIdx + fileIdx) % 2 === 0
            const isSelected = sq.square === selectedSquare
            const isLegal = legalMoves.includes(sq.square)
            const isLastMoveSquare = lastMove && (sq.square === lastMove.from || sq.square === lastMove.to)
            const isKingInCheck = sq.square === kingInCheck
            const hasPiece = sq.type !== null

            let squareClass = `square ${isLight ? 'light' : 'dark'}`
            if (isSelected) squareClass += ' selected'
            if (isLastMoveSquare) squareClass += ' last-move'
            if (isKingInCheck) squareClass += ' in-check'
            if (isGameOver) squareClass += ' game-over'

            return (
              <div
                key={sq.square}
                className={squareClass}
                data-square={sq.square}
                onClick={() => onSquareClick(sq.square)}
              >
                {/* Coordinate labels */}
                {fileIdx === 0 && (
                  <span className="coord-rank">{rankLabels[rankIdx]}</span>
                )}
                {rankIdx === 7 && (
                  <span className="coord-file">{fileLabels[fileIdx]}</span>
                )}

                {/* Piece */}
                {hasPiece && (
                  <span className={`piece ${sq.color === 'w' ? 'white-piece' : 'black-piece'}`}>
                    {getPieceSymbol(sq.type!, sq.color!)}
                  </span>
                )}

                {/* Legal move indicator */}
                {isLegal && (
                  <span className={`legal-dot ${hasPiece ? 'capture-ring' : ''}`} />
                )}
              </div>
            )
          })
        ))}
      </div>
    </div>
  )
}
