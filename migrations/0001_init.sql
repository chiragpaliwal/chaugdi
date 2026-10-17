-- GDD §10.7
CREATE TABLE players (
  id TEXT PRIMARY KEY, nickname TEXT NOT NULL,
  created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL
);
CREATE TABLE rooms (
  code TEXT PRIMARY KEY, host_id TEXT NOT NULL REFERENCES players(id),
  status TEXT NOT NULL CHECK (status IN ('open','playing','closed')),
  created_at INTEGER NOT NULL
);
CREATE TABLE matches (
  id TEXT PRIMARY KEY, room_code TEXT NOT NULL, seed TEXT NOT NULL,
  started_at INTEGER NOT NULL, ended_at INTEGER,
  winner_team TEXT CHECK (winner_team IN ('A','B')), win_reason TEXT, final_ledger INTEGER
);
CREATE TABLE match_players (
  match_id TEXT NOT NULL REFERENCES matches(id), seat INTEGER NOT NULL,
  player_id TEXT REFERENCES players(id), is_bot INTEGER NOT NULL, team TEXT NOT NULL,
  PRIMARY KEY (match_id, seat)
);
CREATE TABLE rounds (
  match_id TEXT NOT NULL REFERENCES matches(id), round_no INTEGER NOT NULL,
  dealer INTEGER NOT NULL, bidder INTEGER NOT NULL, bid INTEGER NOT NULL, forced INTEGER NOT NULL,
  trump TEXT NOT NULL, tricks_bidding_team INTEGER NOT NULL, tricks_played INTEGER NOT NULL,
  outcome TEXT NOT NULL, delta INTEGER NOT NULL, ledger_after INTEGER NOT NULL,
  PRIMARY KEY (match_id, round_no)
);
CREATE INDEX idx_match_players_player ON match_players(player_id);
