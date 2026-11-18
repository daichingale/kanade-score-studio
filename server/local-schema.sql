CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY,key_hash TEXT NOT NULL,owner_hash TEXT NOT NULL,score TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,operations TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS room_peers (room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,client_id TEXT NOT NULL,name TEXT NOT NULL,measure_id TEXT NOT NULL,part_id TEXT,editor_view TEXT,event_index INTEGER NOT NULL,seen_at INTEGER NOT NULL,PRIMARY KEY(room_id,client_id));
CREATE INDEX IF NOT EXISTS peer_seen ON room_peers(room_id,seen_at);
CREATE TABLE IF NOT EXISTS room_limits (bucket TEXT PRIMARY KEY,count INTEGER NOT NULL);
