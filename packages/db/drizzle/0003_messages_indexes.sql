CREATE INDEX IF NOT EXISTS messages_tsv_idx  ON messages USING GIN (text_tsv);
CREATE INDEX IF NOT EXISTS messages_trgm_idx ON messages USING GIN (text_content gin_trgm_ops);
