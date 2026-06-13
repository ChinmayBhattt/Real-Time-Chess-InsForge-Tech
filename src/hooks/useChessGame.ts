import { useState, useEffect, useCallback, useRef } from 'react'
import { Chess, type Square as ChessSquare, type Move } from 'chess.js'
import { insforge } from '../lib/insforge'
import { useAuth } from '../contexts/AuthContext'

export type PieceColor = 'w' | 'b'
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

export interface Square {
  square: string
  type: PieceType | null
  color: PieceColor | null
}

export interface GameState {
  board: Square[][]
  turn: PieceColor
  isCheck: boolean
  isCheckmate: boolean
  isStalemate: boolean
  isDraw: boolean
  isGameOver: boolean
  moveHistory: Move[]
  fen: string
  selectedSquare: string | null
  legalMoves: string[]
  lastMove: { from: string; to: string } | null
  playerColor: PieceColor
  gameResult: string | null
}

interface UseChessGameOptions {
  roomId: string
  hostId: string
  guestId: string | null
  initialFen?: string
}

export function useChessGame({ roomId, hostId, guestId, initialFen }: UseChessGameOptions) {
  const { user } = useAuth()
  const chessRef = useRef(new Chess(initialFen))

  // Determine player color: host = white, guest = black
  const playerColor: PieceColor = user?.id === hostId ? 'w' : 'b'

  const [gameState, setGameState] = useState<GameState>(buildGameState(chessRef.current, null, null))
  const [connected, setConnected] = useState(false)
  const [opponentOnline, setOpponentOnline] = useState(false)
  const subscribedRef = useRef(false)
  const moveCountRef = useRef(0)

  function buildGameState(
    chess: Chess,
    selected: string | null,
    lastMv: { from: string; to: string } | null
  ): GameState {
    const board: Square[][] = []
    const rawBoard = chess.board()

    for (let rank = 0; rank < 8; rank++) {
      const row: Square[] = []
      for (let file = 0; file < 8; file++) {
        const piece = rawBoard[rank][file]
        const squareName = String.fromCharCode(97 + file) + (8 - rank)
        row.push({
          square: squareName,
          type: piece ? (piece.type as PieceType) : null,
          color: piece ? (piece.color as PieceColor) : null,
        })
      }
      board.push(row)
    }

    let legalMoves: string[] = []
    if (selected) {
      const moves = chess.moves({ square: selected as ChessSquare, verbose: true })
      legalMoves = moves.map((m: Move) => m.to)
    }

    const history = chess.history({ verbose: true })

    return {
      board,
      turn: chess.turn() as PieceColor,
      isCheck: chess.isCheck(),
      isCheckmate: chess.isCheckmate(),
      isStalemate: chess.isStalemate(),
      isDraw: chess.isDraw(),
      isGameOver: chess.isGameOver(),
      moveHistory: history,
      fen: chess.fen(),
      selectedSquare: selected,
      legalMoves,
      lastMove: lastMv,
      playerColor,
      gameResult: chess.isCheckmate()
        ? `${chess.turn() === 'w' ? 'Black' : 'White'} wins by checkmate`
        : chess.isStalemate()
        ? 'Draw by stalemate'
        : chess.isDraw()
        ? 'Draw'
        : null,
    }
  }

  // Connect to realtime channel
  useEffect(() => {
    if (!roomId || !user) return

    let cleanedUp = false

    async function connectRealtime() {
      try {
        await insforge.realtime.connect()

        const channel = `room:${roomId}`
        const response = await insforge.realtime.subscribe(channel)

        if (!response.ok) {
          console.error('Subscribe failed:', response.error?.message)
          return
        }

        subscribedRef.current = true
        setConnected(true)

        // Check presence for opponent
        const members = response.presence?.members || []
        const currentUserId = user!.id
        const otherMembers = members.filter(
          (m: { presenceId: string }) => m.presenceId !== currentUserId
        )
        setOpponentOnline(otherMembers.length > 0)

        // Listen for moves
        const userId = user!.id
        insforge.realtime.on('chess_move', (payload: any) => {
          if (cleanedUp) return
          if (payload.meta.channel !== channel) return
          if (payload.meta.senderId === userId) return

          const data = payload.payload || payload
          // Apply opponent's move
          const chess = chessRef.current
          const result = chess.move({ from: data.from, to: data.to, promotion: 'q' })
          if (result) {
            moveCountRef.current = data.moveNumber
            setGameState(buildGameState(chess, null, { from: data.from, to: data.to }))
          }
        })

        insforge.realtime.on('game_resign', (payload: any) => {
          if (cleanedUp) return
          if (payload.meta.channel !== channel) return
          const data = payload.payload || payload
          setGameState((prev) => ({
            ...prev,
            isGameOver: true,
            gameResult: data.userId === userId
              ? `${playerColor === 'w' ? 'Black' : 'White'} wins by resignation`
              : `${playerColor === 'w' ? 'White' : 'Black'} wins by resignation`,
          }))
        })

        insforge.realtime.on('game_draw_offer', (payload: any) => {
          if (cleanedUp) return
          if (payload.meta.channel !== channel) return
          const data = payload.payload || payload
          if (data.userId !== userId) {
            // Show draw offer to this player
            setGameState((prev) => ({ ...prev, gameResult: 'draw_offered' }))
          }
        })

        insforge.realtime.on('game_draw_accepted', (payload: any) => {
          if (cleanedUp) return
          if (payload.meta.channel !== channel) return
          setGameState((prev) => ({
            ...prev,
            isGameOver: true,
            isDraw: true,
            gameResult: 'Draw by agreement',
          }))
        })

        // Presence
        insforge.realtime.on('presence:join', ({ member, meta }: { member: { presenceId: string }; meta: { channel: string } }) => {
          if (meta.channel !== channel) return
          if (member.presenceId !== userId) {
            setOpponentOnline(true)
          }
        })

        insforge.realtime.on('presence:leave', ({ member, meta }: { member: { presenceId: string }; meta: { channel: string } }) => {
          if (meta.channel !== channel) return
          if (member.presenceId !== userId) {
            setOpponentOnline(false)
          }
        })
      } catch (err) {
        console.error('Realtime connection failed:', err)
      }
    }

    void connectRealtime()

    return () => {
      cleanedUp = true
      if (subscribedRef.current) {
        insforge.realtime.unsubscribe(`room:${roomId}`)
        subscribedRef.current = false
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user?.id])

  // Load existing moves on mount
  useEffect(() => {
    if (!roomId) return

    async function loadMoves() {
      const { data } = await insforge.database
        .from('game_moves')
        .select()
        .eq('room_id', roomId)
        .order('move_number', { ascending: true })

      if (data && data.length > 0) {
        const chess = chessRef.current
        chess.reset()
        for (const move of data) {
          chess.move({ from: (move as { move_from: string }).move_from, to: (move as { move_to: string }).move_to, promotion: 'q' })
        }
        moveCountRef.current = data.length
        const lastMove = data[data.length - 1] as { move_from: string; move_to: string }
        setGameState(buildGameState(chess, null, { from: lastMove.move_from, to: lastMove.move_to }))
      }
    }

    void loadMoves()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  const selectSquare = useCallback((square: string) => {
    const chess = chessRef.current

    // Can only move on your turn
    if (chess.turn() !== playerColor) return
    if (chess.isGameOver()) return

    const currentSelected = gameState.selectedSquare

    // If clicking on a legal move target, make the move
    if (currentSelected && gameState.legalMoves.includes(square)) {
      const move = chess.move({ from: currentSelected as ChessSquare, to: square as ChessSquare, promotion: 'q' })
      if (move) {
        moveCountRef.current++
        const newLastMove = { from: currentSelected, to: square }
        setGameState(buildGameState(chess, null, newLastMove))

        // Publish move via realtime
        const channel = `room:${roomId}`
        void insforge.realtime.publish(channel, 'chess_move', {
          from: move.from,
          to: move.to,
          san: move.san,
          fen: chess.fen(),
          moveNumber: moveCountRef.current,
        })

        // Persist move to database
        void insforge.database.from('game_moves').insert([{
          room_id: roomId,
          user_id: user!.id,
          move_san: move.san,
          move_from: move.from,
          move_to: move.to,
          fen_after: chess.fen(),
          move_number: moveCountRef.current,
        }])

        // Update room FEN
        void insforge.database
          .from('rooms')
          .update({ fen: chess.fen() })
          .eq('id', roomId)

        // Check for game over
        if (chess.isGameOver()) {
          void handleGameOver(chess)
        }

        return
      }
    }

    // Select piece of own color
    const piece = chess.get(square as ChessSquare)
    if (piece && piece.color === playerColor) {
      setGameState(buildGameState(chess, square, gameState.lastMove))
    } else {
      setGameState(buildGameState(chess, null, gameState.lastMove))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, playerColor, roomId, user])

  async function handleGameOver(chess: Chess) {
    const winnerId = chess.isCheckmate()
      ? chess.turn() === 'w' ? guestId : hostId
      : null
    const result = chess.isCheckmate()
      ? 'checkmate'
      : chess.isStalemate()
      ? 'stalemate'
      : 'draw'

    // Update room
    await insforge.database
      .from('rooms')
      .update({
        status: 'finished',
        winner_id: winnerId,
        result,
        fen: chess.fen(),
      })
      .eq('id', roomId)

    // Update leaderboard
    if (hostId && guestId) {
      if (winnerId) {
        const loserId = winnerId === hostId ? guestId : hostId
        await insforge.database.rpc('update_leaderboard', {
          p_winner_id: winnerId,
          p_loser_id: loserId,
          p_is_draw: false,
        })
      } else {
        await insforge.database.rpc('update_leaderboard', {
          p_winner_id: hostId,
          p_loser_id: guestId,
          p_is_draw: true,
        })
      }
    }
  }

  const resign = useCallback(async () => {
    if (!user || gameState.isGameOver) return

    const channel = `room:${roomId}`
    await insforge.realtime.publish(channel, 'game_resign', { userId: user.id })

    const winnerId = user.id === hostId ? guestId : hostId

    await insforge.database
      .from('rooms')
      .update({
        status: 'finished',
        winner_id: winnerId,
        result: 'resignation',
      })
      .eq('id', roomId)

    if (hostId && guestId) {
      await insforge.database.rpc('update_leaderboard', {
        p_winner_id: winnerId,
        p_loser_id: user.id,
        p_is_draw: false,
      })
    }

    setGameState((prev) => ({
      ...prev,
      isGameOver: true,
      gameResult: `${playerColor === 'w' ? 'Black' : 'White'} wins by resignation`,
    }))
  }, [user, gameState.isGameOver, roomId, hostId, guestId, playerColor])

  const offerDraw = useCallback(async () => {
    if (!user || gameState.isGameOver) return
    const channel = `room:${roomId}`
    await insforge.realtime.publish(channel, 'game_draw_offer', { userId: user.id })
  }, [user, gameState.isGameOver, roomId])

  const acceptDraw = useCallback(async () => {
    if (!user) return
    const channel = `room:${roomId}`
    await insforge.realtime.publish(channel, 'game_draw_accepted', {})

    await insforge.database
      .from('rooms')
      .update({ status: 'finished', result: 'draw' })
      .eq('id', roomId)

    if (hostId && guestId) {
      await insforge.database.rpc('update_leaderboard', {
        p_winner_id: hostId,
        p_loser_id: guestId,
        p_is_draw: true,
      })
    }

    setGameState((prev) => ({
      ...prev,
      isGameOver: true,
      isDraw: true,
      gameResult: 'Draw by agreement',
    }))
  }, [user, roomId, hostId, guestId])

  const declineDraw = useCallback(() => {
    setGameState((prev) => ({
      ...prev,
      gameResult: prev.isGameOver ? prev.gameResult : null,
    }))
  }, [])

  return {
    gameState,
    selectSquare,
    resign,
    offerDraw,
    acceptDraw,
    declineDraw,
    connected,
    opponentOnline,
    playerColor,
    isMyTurn: gameState.turn === playerColor,
  }
}
