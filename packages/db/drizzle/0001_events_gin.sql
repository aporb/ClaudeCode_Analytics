CREATE INDEX IF NOT EXISTS events_payload_gin ON events USING GIN (payload jsonb_path_ops);
