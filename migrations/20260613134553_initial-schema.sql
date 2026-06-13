-- ============================================================
-- MyChess: Initial Schema Migration
-- Tables, RLS, Realtime channels, Leaderboard function
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TABLES
-- ──────────────────────────────────────────────────────────────

-- Rooms
CREATE TABLE public.rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(6) NOT NULL UNIQUE,
  host_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting', 'playing', 'finished')),
  winner_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  result      VARCHAR(20) CHECK (result IN ('checkmate', 'resignation', 'stalemate', 'draw', 'timeout')),
  fen         TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

-- Game Moves
CREATE TABLE public.game_moves (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  move_san    VARCHAR(10) NOT NULL,
  move_from   VARCHAR(2) NOT NULL,
  move_to     VARCHAR(2) NOT NULL,
  fen_after   TEXT NOT NULL,
  move_number INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_game_moves_room ON public.game_moves(room_id, move_number);

-- Leaderboard
CREATE TABLE public.leaderboard (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Player',
  wins         INT NOT NULL DEFAULT 0,
  losses       INT NOT NULL DEFAULT 0,
  draws        INT NOT NULL DEFAULT 0,
  rating       INT NOT NULL DEFAULT 1200,
  games_played INT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER leaderboard_updated_at
  BEFORE UPDATE ON public.leaderboard
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

CREATE INDEX idx_leaderboard_rating ON public.leaderboard(rating DESC);

-- ──────────────────────────────────────────────────────────────
-- 2. GRANTS
-- ──────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rooms TO authenticated;
GRANT SELECT, INSERT ON public.game_moves TO authenticated;
GRANT SELECT ON public.leaderboard TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────

-- Rooms RLS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY rooms_select ON public.rooms
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY rooms_insert ON public.rooms
  FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid());

CREATE POLICY rooms_update ON public.rooms
  FOR UPDATE TO authenticated
  USING (host_id = auth.uid() OR guest_id = auth.uid());

-- Game Moves RLS
ALTER TABLE public.game_moves ENABLE ROW LEVEL SECURITY;

CREATE POLICY moves_select ON public.game_moves
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms
      WHERE rooms.id = game_moves.room_id
        AND (rooms.host_id = auth.uid() OR rooms.guest_id = auth.uid())
    )
  );

CREATE POLICY moves_insert ON public.game_moves
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.rooms
      WHERE rooms.id = game_moves.room_id
        AND rooms.status = 'playing'
        AND (rooms.host_id = auth.uid() OR rooms.guest_id = auth.uid())
    )
  );

-- Leaderboard RLS (read-only for users; writes via SECURITY DEFINER fn)
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY leaderboard_select ON public.leaderboard
  FOR SELECT TO authenticated
  USING (true);

-- ──────────────────────────────────────────────────────────────
-- 4. REALTIME CHANNEL
-- ──────────────────────────────────────────────────────────────

INSERT INTO realtime.channels (pattern, description, enabled)
VALUES ('room:%', 'Per-room game channels for moves and presence', true)
ON CONFLICT (pattern) DO UPDATE
SET description = EXCLUDED.description,
    enabled = EXCLUDED.enabled;

-- Channel RLS: only room participants can subscribe
ALTER TABLE realtime.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY room_channel_subscribe ON realtime.channels
  FOR SELECT TO authenticated
  USING (
    pattern = 'room:%'
    AND EXISTS (
      SELECT 1 FROM public.rooms
      WHERE rooms.id = NULLIF(split_part(realtime.channel_name(), ':', 2), '')::uuid
        AND (rooms.host_id = auth.uid() OR rooms.guest_id = auth.uid())
    )
  );

-- Message RLS: only room participants can publish
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY room_message_publish ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    channel_name LIKE 'room:%'
    AND EXISTS (
      SELECT 1 FROM public.rooms
      WHERE rooms.id = NULLIF(split_part(channel_name, ':', 2), '')::uuid
        AND (rooms.host_id = auth.uid() OR rooms.guest_id = auth.uid())
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 5. LEADERBOARD UPDATE FUNCTION (Elo rating)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_leaderboard(
  p_winner_id UUID,
  p_loser_id  UUID,
  p_is_draw   BOOLEAN DEFAULT false
)
RETURNS void AS $$
DECLARE
  v_winner_rating INT;
  v_loser_rating  INT;
  v_expected_w    FLOAT;
  v_expected_l    FLOAT;
  v_k             INT := 32;
  v_delta_w       INT;
  v_delta_l       INT;
  v_winner_name   TEXT;
  v_loser_name    TEXT;
BEGIN
  -- Get display names from auth profiles
  SELECT COALESCE(profile->>'name', 'Player') INTO v_winner_name
  FROM auth.users WHERE id = p_winner_id;

  SELECT COALESCE(profile->>'name', 'Player') INTO v_loser_name
  FROM auth.users WHERE id = p_loser_id;

  -- Ensure both players exist in leaderboard
  INSERT INTO public.leaderboard (user_id, display_name)
  VALUES (p_winner_id, v_winner_name)
  ON CONFLICT (user_id) DO UPDATE SET display_name = v_winner_name;

  INSERT INTO public.leaderboard (user_id, display_name)
  VALUES (p_loser_id, v_loser_name)
  ON CONFLICT (user_id) DO UPDATE SET display_name = v_loser_name;

  -- Get current ratings
  SELECT rating INTO v_winner_rating FROM public.leaderboard WHERE user_id = p_winner_id;
  SELECT rating INTO v_loser_rating  FROM public.leaderboard WHERE user_id = p_loser_id;

  -- Elo calculation
  v_expected_w := 1.0 / (1.0 + POWER(10.0, (v_loser_rating - v_winner_rating)::FLOAT / 400.0));
  v_expected_l := 1.0 - v_expected_w;

  IF p_is_draw THEN
    v_delta_w := ROUND(v_k * (0.5 - v_expected_w));
    v_delta_l := ROUND(v_k * (0.5 - v_expected_l));

    UPDATE public.leaderboard
    SET draws = draws + 1,
        games_played = games_played + 1,
        rating = GREATEST(100, rating + v_delta_w)
    WHERE user_id = p_winner_id;

    UPDATE public.leaderboard
    SET draws = draws + 1,
        games_played = games_played + 1,
        rating = GREATEST(100, rating + v_delta_l)
    WHERE user_id = p_loser_id;
  ELSE
    v_delta_w := ROUND(v_k * (1.0 - v_expected_w));
    v_delta_l := ROUND(v_k * (0.0 - v_expected_l));

    UPDATE public.leaderboard
    SET wins = wins + 1,
        games_played = games_played + 1,
        rating = GREATEST(100, rating + v_delta_w)
    WHERE user_id = p_winner_id;

    UPDATE public.leaderboard
    SET losses = losses + 1,
        games_played = games_played + 1,
        rating = GREATEST(100, rating + v_delta_l)
    WHERE user_id = p_loser_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users (RPC calls)
GRANT EXECUTE ON FUNCTION public.update_leaderboard(UUID, UUID, BOOLEAN) TO authenticated;
