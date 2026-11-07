CREATE TABLE IF NOT EXISTS game_rounds (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  starts_at TIMESTAMPTZ NOT NULL,
  betting_closes_at TIMESTAMPTZ NOT NULL,
  crash_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  crash_multiplier NUMERIC(12, 2) NOT NULL CHECK (crash_multiplier >= 1.01 AND crash_multiplier <= 1000),
  seed CHAR(64) NOT NULL,
  commitment CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (starts_at),
  CHECK (starts_at < betting_closes_at),
  CHECK (betting_closes_at < crash_at),
  CHECK (crash_at < ends_at)
);

CREATE INDEX IF NOT EXISTS game_rounds_starts_at_desc_idx ON game_rounds (starts_at DESC);
CREATE INDEX IF NOT EXISTS game_rounds_ends_at_idx ON game_rounds (ends_at);
